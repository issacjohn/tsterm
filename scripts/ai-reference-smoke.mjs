import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ai-ref-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

const REFERENCE_TEXT = `
ASA command reference excerpt
Packet capture on an interface:
capture TSTREF interface outside match ip host 192.0.2.10 host 192.0.2.20
capture TSTREF buffer 33554432
show capture TSTREF
no capture TSTREF

Packet capture has no duration keyword on ASA 9.24.
`
const REPLY = [
  'Use the ASA capture pattern from the reference document:',
  '',
  '```text',
  'capture TSTREF interface outside match ip host 192.0.2.10 host 192.0.2.20',
  'capture TSTREF buffer 33554432',
  '```',
  '',
  'Then verify and remove it:',
  '',
  '```text',
  'show capture TSTREF',
  'no capture TSTREF',
  '```'
].join('\n')

let chatBody = null
const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      chatBody = JSON.parse(body)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: REPLY } }] })}\n\n`
      )
      response.write('data: [DONE]\n\n')
      response.end()
    })
    return
  }
  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end('{"error":"not found"}')
})

let app
let page
let results = []

async function shot(name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(shots, name), animations: 'disabled' })
  results.push(name)
}

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}/v1`

  const refDir = path.join(userData, 'references')
  const docsDir = path.join(refDir, 'docs')
  fs.mkdirSync(docsDir, { recursive: true })
  fs.writeFileSync(path.join(docsDir, 'ref-asa.txt'), REFERENCE_TEXT, 'utf8')
  fs.writeFileSync(
    path.join(refDir, 'index.json'),
    JSON.stringify({
      version: 1,
      docs: [
        {
          id: 'ref-asa',
          name: 'ASA Command Reference',
          fileName: 'asa-reference.md',
          deviceTypeId: 'cisco-asa',
          chars: REFERENCE_TEXT.length,
          chunks: 1,
          addedAt: new Date().toISOString(),
          hash: 'smoke-reference-hash'
        }
      ]
    }),
    'utf8'
  )
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      schemaVersion: 1,
      aiEnabled: true,
      aiIncludeContext: false,
      aiAutoPullLocalModels: false,
      aiActiveProfileId: 'mock',
      aiProfiles: [
        {
          id: 'mock',
          name: 'Mock provider',
          kind: 'openai-compatible',
          baseUrl,
          model: 'mock-model',
          authStyle: 'none',
          maxTokens: 512,
          temperature: 0.1,
          local: false
        }
      ]
    }),
    'utf8'
  )

  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TSTERM_USER_DATA: userData }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => console.error('[renderer error]', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[renderer console]', message.text())
  })

  await page.waitForSelector('.app', { timeout: 30000 })
  await page.waitForTimeout(700)
  await page.locator('.sidebar-local').click()
  await page.waitForSelector('.connection-pill.connected', { timeout: 20000 })

  await page.locator('.device-chip').click()
  await page.waitForSelector('.device-search input')
  await page.locator('.device-search input').fill('ASA')
  await page.waitForTimeout(300)
  await page.locator('.device-option', { hasText: 'Cisco ASA' }).first().click()
  await page.getByRole('button', { name: /Use Cisco ASA/ }).click()
  await page.waitForTimeout(500)

  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForTimeout(500)
  const scope = await page.locator('.ai-scope-line').innerText()
  if (!/Cisco ASA runbooks only/.test(scope)) throw new Error(`Wrong AI scope: ${scope}`)
  const refChip = await page.locator('.ai-reference-chip').innerText()
  if (!refChip.includes('1')) throw new Error(`Reference chip missing: ${refChip}`)

  await page
    .locator('.ai-composer textarea')
    .fill('How do I capture packets on the outside interface?')
  await page.getByRole('button', { name: /^Ask$/ }).click()
  await page.waitForFunction(
    () => !document.querySelector('.ai-stop') && Boolean(document.querySelector('.ai-send')),
    { timeout: 30000 }
  )
  await shot('30-ai-reference-scope.png')

  if (!chatBody) throw new Error('The mock provider received no chat request.')
  const system = chatBody.messages?.[0]?.content ?? ''
  if (!system.includes('active device pack is Cisco ASA')) {
    throw new Error('The active ASA pack is not stated in the prompt.')
  }
  if (!system.includes('capture TSTREF interface outside')) {
    throw new Error('The ASA reference excerpt was not sent to the model.')
  }
  if (/Get-NetAdapter|Get-NetIPConfiguration|PowerShell/i.test(system)) {
    throw new Error('Windows commands leaked into an ASA-scoped prompt.')
  }

  console.log('\nAI reference/scope smoke test complete')
  console.log('Scope:', scope.replace(/\s+/g, ' ').trim())
  console.log('Screenshots:', results.join(', '))
} catch (error) {
  console.error('\nAI reference/scope smoke test failed:', error)
  if (page) {
    try {
      await shot('99-ai-reference-failure.png')
      console.error('Page text excerpt:', (await page.locator('body').innerText()).slice(0, 2500))
    } catch {
      // ignore
    }
  }
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  server.close()
}
