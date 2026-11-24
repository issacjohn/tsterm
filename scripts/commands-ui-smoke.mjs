import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-commands-ui-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

let app
let page
const errors = []

const packaged = process.env.TSTERM_COMMANDS_PACKAGED === '1'
const exe = path.resolve(ROOT, 'release/win-unpacked/TSTerm.exe')
if (packaged && !fs.existsSync(exe)) {
  console.error(`Packaged app not found at ${exe}. Run "npm run package" first.`)
  process.exit(2)
}

try {
  app = await electron.launch({
    ...(packaged ? { executablePath: exe } : { args: ['.'] }),
    env: { ...process.env, TSTERM_USER_DATA: userData }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.waitForSelector('.app', { timeout: 30000 })
  await page.waitForTimeout(900)
  await page.getByText('Local terminal', { exact: true }).first().click()
  await page.waitForSelector('.connection-pill.connected', { timeout: 20000 })
  await page.locator('.device-chip').click()
  await page.waitForSelector('.device-search input')
  await page.locator('.device-search input').fill('ASA')
  await page.waitForTimeout(300)
  await page.locator('.device-option', { hasText: 'Cisco ASA' }).first().click()
  await page.getByRole('button', { name: /Use Cisco ASA/ }).click()
  await page.waitForTimeout(500)

  const clicked = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return false
    const find = (items) => {
      for (const item of items) {
        if (item.label === 'Command Reference') {
          item.click()
          item.menu?.closePopup?.()
          return true
        }
        if (item.submenu && find(item.submenu.items)) return true
      }
      return false
    }
    return find(menu.items)
  })
  if (!clicked) throw new Error('Command Reference menu item was not found.')

  await page.waitForSelector('.command-browser-modal', { timeout: 5000 })
  await page.waitForSelector('.cmd-search input')
  await page.locator('.cmd-search input').fill('capture traffic between two hosts')
  await page.waitForSelector('.cmd-result', { timeout: 10000 })
  await page.locator('.cmd-result').first().click()
  await page.waitForSelector('.cmd-preview')
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(shots, 'commands-01-search.png'), animations: 'disabled' })

  const resultCount = await page.locator('.cmd-result').count()
  const topResults = []
  for (let index = 0; index < Math.min(5, resultCount); index += 1) {
    const card = page.locator('.cmd-result').nth(index)
    topResults.push({
      command: (await card.locator('code').innerText()).trim(),
      meta: (await card.locator('.cmd-result-meta').innerText()).replace(/\n/g, ' · ')
    })
  }
  const preview = (await page.locator('.cmd-preview > code').innerText()).trim()
  const detailText = await page.locator('.cmd-detail').innerText()
  const footer = (await page.locator('.cmd-footer-status').innerText()).trim()

  await page.locator('.cmd-filter', { hasText: 'Read only' }).click()
  await page.waitForTimeout(600)
  const readOnlyRisks = await page.locator('.cmd-result .cmd-risk').allInnerTexts()
  await page.screenshot({ path: path.join(shots, 'commands-02-readonly.png'), animations: 'disabled' })

  await page.locator('.cmd-filter', { hasText: 'All' }).click()
  await page.locator('.cmd-search input').fill('aaa accounting command')
  const referenceCard = page
    .locator('.cmd-result')
    .filter({ hasText: 'aaa accounting command' })
    .filter({ hasText: 'reference' })
    .first()
  await referenceCard.waitFor({ timeout: 15000 })
  await referenceCard.click()
  await page.waitForSelector('.cmd-preview-head')
  await page.waitForTimeout(300)
  const reference = {
    count: await page.locator('.cmd-result').filter({ hasText: 'reference' }).count(),
    syntaxLabel: (await page.locator('.cmd-preview-head span').first().innerText()).trim(),
    syntax: (await page.locator('.cmd-preview > code').innerText()).trim(),
    note: (await page.locator('.cmd-detail').innerText()).includes("Reference entry from Cisco's ASA"),
    fillDisabled: await page.locator('.cmd-actions button', { hasText: 'Fill' }).isDisabled(),
    ciscoDoc: await page.locator('.cmd-actions button', { hasText: 'Cisco doc' }).count()
  }
  await page.screenshot({ path: path.join(shots, 'commands-05-reference.png'), animations: 'disabled' })

  let vectorBuild = null
  if (process.env.TSTERM_BUILD_VECTORS === '1') {
    await page.getByRole('button', { name: /Build vector index/ }).click()
    await page.waitForSelector('.cmd-index-progress', { timeout: 10_000 })
    await page.waitForFunction(
      () => document.querySelector('.cmd-footer-status')?.textContent?.includes('Hybrid'),
      null,
      { timeout: 300_000 }
    )
    vectorBuild = (await page.locator('.cmd-footer-status').innerText()).replace(/\n/g, ' · ')
    await page.screenshot({ path: path.join(shots, 'commands-03-hybrid.png'), animations: 'disabled' })
  }

  await page.locator('.modal-close').click()
  await page.waitForTimeout(200)

  await page.locator('.device-chip').click()
  await page.waitForSelector('.device-search input')
  await page.locator('.device-search input').fill('Windows')
  await page.waitForTimeout(300)
  await page.locator('.device-option', { hasText: 'Windows' }).first().click()
  await page.getByRole('button', { name: /Use Windows/ }).click()
  await page.waitForTimeout(500)

  const windowsScope = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return false
    const find = (items) => {
      for (const item of items) {
        if (item.label === 'Command Reference') {
          item.click()
          item.menu?.closePopup?.()
          return true
        }
        if (item.submenu && find(item.submenu.items)) return true
      }
      return false
    }
    return find(menu.items)
  })
  if (!windowsScope) throw new Error('Command Reference menu item was not found for Windows.')

  await page.waitForSelector('.command-browser-modal', { timeout: 5000 })
  const windowsTitle = (await page.locator('.modal-heading h2').innerText()).trim()
  await page.locator('.cmd-search input').fill('ipconfig')
  await page.waitForSelector('.cmd-result', { timeout: 10000 })
  await page.waitForTimeout(300)
  const windowsResults = await page.locator('.cmd-result').allInnerTexts()
  if (!/Windows Command Reference/i.test(windowsTitle)) {
    throw new Error(`Command browser is not scoped to Windows: ${windowsTitle}`)
  }
  if (!windowsResults.some((text) => /ipconfig/i.test(text))) {
    throw new Error('Windows command search did not return ipconfig.')
  }
  if (windowsResults.some((text) => /capture TSTCAP|ASA help|Cisco ASA/i.test(text))) {
    throw new Error('ASA commands leaked into the Windows command browser.')
  }
  await page.screenshot({ path: path.join(shots, 'commands-06-scope-windows.png'), animations: 'disabled' })
  await page.locator('.modal-close').click()
  await page.waitForTimeout(200)

  console.log(
    JSON.stringify(
      {
        resultCount,
        topResults,
        preview,
        hasFill: detailText.includes('Fill'),
        hasNeverEnter: /never presses enter/i.test(detailText) || /enter .* first/i.test(detailText),
        footer,
        vectorBuild,
        reference,
        readOnlyRisks: [...new Set(readOnlyRisks.map((text) => text.trim()))],
        errors
      },
      null,
      2
    )
  )
  if (errors.length) process.exitCode = 1
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await app?.close()
}
