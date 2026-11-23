import fs from 'node:fs'
import path from 'node:path'
import * as cheerio from 'cheerio'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'resources', 'commands')
const OUT_FILE = path.join(OUT_DIR, 'asa-reference.json')
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36'

const BOOKS = [
  {
    id: 'A-H',
    url: 'https://www.cisco.com/c/en/us/td/docs/security/asa/asa-cli-reference/A-H/asa-command-ref-A-H.html'
  },
  {
    id: 'I-R',
    url: 'https://www.cisco.com/c/en/us/td/docs/security/asa/asa-cli-reference/I-R/asa-command-ref-I-R.html'
  },
  {
    id: 'S',
    url: 'https://www.cisco.com/c/en/us/td/docs/security/asa/asa-cli-reference/S/asa-command-ref-S.html'
  },
  {
    id: 'T-Z',
    url: 'https://www.cisco.com/c/en/us/td/docs/security/asa/asa-cli-reference/T-Z/asa-command-ref-T-Z.html'
  }
]

const LIMIT = Number(process.env.TSTERM_REF_LIMIT) || 0
const SKIP_CHAPTERS = /(?:^|\/)(?:asa-command-ref-[^/]*_CLT_chapter|cli-usage|ios-commands-for-asasm)\.html$/i

function clean(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u00ad\u200b-\u200d\ufeff\ufffd]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanSyntax(value) {
  return clean(value)
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/([\[({])\s+/g, '$1')
    .replace(/\s+([\]})])/g, '$1')
    .replace(/\s+([,;:])/g, '$1')
}

function firstSentence(value, limit = 320) {
  const text = clean(value)
  const sentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? text
  return sentence.length > limit ? `${sentence.slice(0, limit - 1).trim()}…` : sentence
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\(deprecated\)/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function categoryFor(name) {
  const value = name.toLowerCase()
  if (value.startsWith('show ')) return 'show'
  if (/^(debug|undebug|logging debug)/.test(value)) return 'debug'
  if (/^(capture|no capture|packet-tracer)/.test(value)) return 'capture'
  if (value.startsWith('clear ')) return 'clear'
  if (/^(configure|copy|write|reload|erase|format|delete|restore|revert)/.test(value)) {
    return 'operations'
  }
  if (/^(crypto|ssl|tls|ikev|ipsec)/.test(value)) return 'crypto'
  if (/^(aaa|radius|tacacs|ldap|user-identity|kerberos)/.test(value)) return 'aaa'
  if (/^(vpn|webvpn|tunnel-group|group-policy|anyconnect|client-update|saml|sso)/.test(value)) {
    return 'vpn'
  }
  if (/^(interface|ip |ipv6 |route|ospf|eigrp|bgp|rip|mroute|multicast|arp)/.test(value)) {
    return 'routing'
  }
  if (/^(access-list|access-group|object|object-group|nat|route-map|class-map|policy-map|service-policy)/.test(value)) {
    return 'policy'
  }
  if (/^(logging|log |syslog|snmp|ntp|dns|dhcpd|ssh|telnet|http|asdm|management)/.test(value)) {
    return 'management'
  }
  if (/^(failover|cluster|redundant-interface)/.test(value)) return 'high-availability'
  if (/^(license|activation-key|backup)/.test(value)) return 'licensing'
  if (/^(monitor|perfmon|cpu|memory|crashinfo|show tech)/.test(value)) return 'diagnostics'
  return 'configuration'
}

function riskFor(name) {
  const value = name.toLowerCase().trim()
  if (/^(reload|erase|format|delete|downgrade|fsck|fips)\b/.test(value)) return 'destructive'
  if (/^write\s+erase\b/.test(value)) return 'destructive'
  if (/^clear\s+configure\b/.test(value) && !/^clear\s+configure\s+access-list\b/.test(value)) {
    return 'destructive'
  }
  if (
    /^(debug|undebug|capture|no\s+capture|packet-tracer|perfmon|terminal\s+(monitor|no\s+monitor)|test)\b/.test(
      value
    )
  ) {
    return 'diagnostic'
  }
  if (/^(show|ping|traceroute|dir|more|verify|help|who|pwd|exit|quit|logout|disable)\b/.test(value)) {
    return 'read_only'
  }
  return 'mutating'
}

function modeList(article, $) {
  const heading = article
    .find('h3.sectiontitle')
    .filter((_, element) => clean($(element).text()) === 'Command Modes')
    .first()
  if (!heading.length) return []
  const table = heading.parent().find('table').first()
  if (!table.length) return []
  const modes = []
  table.find('tr').each((index, row) => {
    if (index === 0) return
    const cells = $(row)
      .find('th,td')
      .map((_, cell) => clean($(cell).text()))
      .get()
    if (cells.length < 2) return
    const mode = cells[0]
    if (!mode || /^(routed|transparent|single|multiple|context|system|command mode)$/i.test(mode)) {
      return
    }
    if (cells.slice(1).some((value) => /^yes$/i.test(value))) modes.push(mode)
  })
  return [...new Set(modes)]
}

function parseArticle(article, $, book, url) {
  const heading = article.find('h2').first()
  const name = clean(heading.text()).replace(/\s*\(Deprecated\)\s*/i, '').trim()
  if (!name || /^(chapter|results|book title|contents)/i.test(name)) return null
  if (name.length > 140) return null

  const body = article.find('section.body.refbody').first()
  const scope = body.length ? body : article
  const firstSection = scope.children('section').first()
  const description = firstSentence(
    firstSection.find('p').first().text() || firstSection.text() || article.text()
  )

  const syntaxBlock = scope.find('p.figgroup.synblk').first()
  const syntax = cleanSyntax(syntaxBlock.text() || scope.children('section').eq(1).text())

  const modes = modeList(article, $)

  return {
    id: `asa.doc.${slug(name)}`,
    vendor: 'cisco-asa',
    name,
    commandTemplate: name,
    syntax: syntax || name,
    description,
    category: categoryFor(name),
    mode: modes.length ? modes.join(', ') : 'documented mode',
    modes,
    risk: riskFor(name),
    keywords: [
      ...new Set(
        `${name} ${description} ${categoryFor(name)}`
          .toLowerCase()
          .match(/[a-z0-9%._:/-]+/g)
          ?.filter((token) => token.length > 1) ?? []
      )
    ].slice(0, 50),
    parameters: [],
    examples: [],
    cleanup: [],
    source: 'cisco-docs',
    version: '9.24',
    url,
    referenceOnly: true,
    book
  }
}

async function fetchHtml(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' }
  })
  if (!response.ok) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
      return fetchHtml(url, attempt + 1)
    }
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.text()
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const chapters = []

  for (const book of BOOKS) {
    const html = await fetchHtml(book.url)
    const $ = cheerio.load(html)
    const links = $('#bookToc a')
      .map((_, element) => $(element).attr('href'))
      .get()
      .filter((href) => typeof href === 'string' && href.endsWith('.html'))
      .filter((href) => !SKIP_CHAPTERS.test(href))
    for (const href of links) {
      chapters.push({
        book: book.id,
        url: href.startsWith('http') ? href : `https://www.cisco.com${href}`
      })
    }
    console.log(`${book.id}: ${links.length} chapter pages`)
  }

  const uniqueChapters = [...new Map(chapters.map((chapter) => [chapter.url, chapter])).values()]
  const limited = LIMIT > 0 ? uniqueChapters.slice(0, LIMIT) : uniqueChapters
  const commands = new Map()
  let page = 0

  for (const chapter of limited) {
    page += 1
    process.stdout.write(`[${page}/${limited.length}] ${chapter.book} ${chapter.url.split('/').pop()} … `)
    try {
      const html = await fetchHtml(chapter.url)
      const $ = cheerio.load(html)
      let found = 0
      $('article.topic.reference').each((_, element) => {
        const record = parseArticle($(element), $, chapter.book, chapter.url)
        if (!record) return
        const key = record.name.toLowerCase()
        const existing = commands.get(key)
        if (existing) {
          if (record.syntax.length > existing.syntax.length) commands.set(key, record)
          return
        }
        commands.set(key, record)
        found += 1
      })
      console.log(`${found} commands`)
    } catch (error) {
      console.log(`FAILED: ${error.message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const list = [...commands.values()].sort((a, b) => a.name.localeCompare(b.name))
  const usedIds = new Set()
  for (const record of list) {
    let id = record.id
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${record.id}-${suffix}`
      suffix += 1
    }
    usedIds.add(id)
    record.id = id
  }
  const output = {
    version: 1,
    vendor: 'cisco-asa',
    source: 'Cisco Secure Firewall ASA Series Command Reference (A-H, I-R, S, T-Z)',
    sourceUrl: 'https://www.cisco.com/c/en/us/support/security/adaptive-security-appliance-asa-software/products-command-reference-list.html',
    generatedAt: new Date().toISOString(),
    commands: list
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8')
  console.log(`\nWrote ${list.length} reference commands to ${OUT_FILE}`)
  console.log(`Size: ${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2)} MB`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
