import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const PASSWORD = process.env.TSTERM_TEST_PASSWORD
const HOST = process.env.TSTERM_TEST_HOST
const USER = process.env.TSTERM_TEST_USER
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ui-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

if (!PASSWORD || !HOST || !USER) {
  console.error('Set TSTERM_TEST_HOST, TSTERM_TEST_USER and TSTERM_TEST_PASSWORD before running the UI test.')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
let app
let page

async function dismissToasts() {
  const closes = page.locator('.toast-close')
  const count = await closes.count()
  for (let index = count - 1; index >= 0; index -= 1) {
    try {
      await closes.nth(index).click({ timeout: 800 })
    } catch {
      // a toast may have auto-dismissed between counting and clicking
    }
  }
  await page.waitForTimeout(250)
}

async function shot(name) {
  await dismissToasts()
  await page.screenshot({ path: path.join(shots, name), animations: 'disabled' })
  results.push(name)
}

async function waitText(text, timeout = 20000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout })
}

try {
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TSTERM_USER_DATA: userData
    }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => console.error('[renderer error]', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[renderer console]', message.text())
  })
  page.on('dialog', (dialog) => dialog.accept())

  await page.waitForSelector('.app', { timeout: 30000 })
  await page.waitForTimeout(900)
  await shot('01-welcome.png')

  await page.locator('.welcome-actions .btn-primary').click()
  await page.waitForSelector('.modal-panel')
  await page.locator('.field', { hasText: 'Display name' }).locator('input').fill('ASA Lab')
  await page.locator('.field', { hasText: 'Hostname or IP' }).locator('input').fill(HOST)
  await page.locator('.field', { hasText: 'Username' }).locator('input').fill(USER)
  await page.locator('.modal-panel input[type="password"]').first().fill(PASSWORD)
  await page.waitForTimeout(300)
  await shot('02-new-host.png')
  await page.getByRole('button', { name: /Save & connect/ }).click()

  await page.waitForTimeout(4500)
  if (await page.getByText('Verify host identity', { exact: false }).count()) {
    await shot('03-host-key.png')
    await page.getByRole('button', { name: /Trust & connect/ }).click()
    await page.waitForTimeout(2500)
  } else if (await page.getByText('Host key has changed', { exact: false }).count()) {
    await shot('03-host-key-mismatch.png')
    throw new Error('Unexpected host key mismatch in a clean profile.')
  }

  if (await page.getByText('What kind of device is this?', { exact: false }).count()) {
    await page.locator('.device-search input').fill('ASA')
    await page.waitForTimeout(400)
    await shot('04-device-picker.png')
    await page.locator('.device-option', { hasText: 'Cisco ASA' }).first().click()
    await page.getByRole('button', { name: /Use Cisco ASA/ }).click()
    await page.waitForTimeout(1200)
  }

  await page.waitForSelector('.connection-pill.connected', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await shot('05-session.png')

  await page.locator('.terminal-host').click()
  await page.keyboard.type('show version')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3800)
  for (let index = 0; index < 4; index += 1) {
    const text = await page.locator('body').innerText()
    if (!text.includes('More')) break
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
  }
  await shot('07-terminal-show-version.png')

  await page.locator('.terminal-host').click()
  await page.keyboard.type('deb')
  await page.waitForTimeout(500)
  const ghost = (await page.locator('.terminal-ghost').textContent())?.trim() || ''
  if (!ghost) throw new Error('Inline next-word suggestion did not appear.')
  await shot('06-suggestions.png')

  const tsSearch = page.locator('input[aria-label="Search troubleshooting runbooks"]')
  await tsSearch.fill('radius')
  await page.waitForTimeout(500)
  await shot('08-troubleshoot-search.png')
  await page.locator('.ts-row', { hasText: /all users/ }).first().click()
  await page.waitForTimeout(450)
  await shot('09-runbook-detail.png')
  await page.getByRole('button', { name: /Open runbook/ }).click()
  await page.waitForSelector('.runbook-panel, .runbook-warning')
  await page.waitForTimeout(400)
  await shot('10-runbook-modal.png')
  await page.getByRole('button', { name: /^Copy commands$/ }).click()
  await page.waitForTimeout(500)
  await shot('10b-runbook-copied.png')
  await page.waitForTimeout(300)
  await page.locator('.modal-close').last().click()
  await page.waitForTimeout(500)
  const debugChip = page.locator('.debug-chip')
  if (!(await debugChip.count())) throw new Error('Debug copy was not tracked in the guard.')
  await shot('11-debug-tracked.png')

  await debugChip.click()
  await page.waitForTimeout(400)
  await shot('12-debug-guard.png')
  await page.locator('.modal-close').last().click()

  await page.locator('.host-row', { hasText: 'ASA Lab' }).click()
  await page.waitForTimeout(3500)
  if (await page.locator('.modal-panel').count()) {
    throw new Error('A remembered host should not prompt for the host key or device type again.')
  }
  if ((await page.locator('.tab').count()) < 2) throw new Error('Second remembered session did not open.')
  await page.locator('.tab.active .tab-close').click()
  await page.waitForTimeout(500)

  await page.locator('.sidebar-nav button', { hasText: 'Snippets' }).click()
  await page.waitForTimeout(400)
  await page.locator('.snippet-editor .field', { hasText: 'Title' }).locator('input').fill('ASA version')
  await page.locator('.snippet-editor textarea').fill('show version')
  await page.getByRole('button', { name: /Save snippet/ }).click()
  await page.waitForTimeout(600)
  await shot('13-snippets.png')
  await page.locator('.modal-close').last().click()

  await page.locator('button[title^="Settings"]').click()
  await page.waitForTimeout(500)
  await shot('14-settings-appearance.png')
  await page.locator('.app-theme-card', { hasText: 'Daylight' }).click()
  await page.waitForTimeout(500)
  await shot('14b-daylight.png')
  await page.locator('.app-theme-card', { hasText: 'Midnight' }).click()
  await page.waitForTimeout(300)

  await page.locator('.settings-nav button', { hasText: 'Terminal' }).click()
  await page.waitForTimeout(400)
  await page.locator('.font-chip', { hasText: 'JetBrains Mono' }).click()
  await page.waitForTimeout(350)
  const terminalFont = await page
    .locator('.settings-content .setting-block')
    .filter({ hasText: 'Terminal font' })
    .locator('input')
    .inputValue()
  if (!terminalFont.includes('JetBrains Mono')) throw new Error('Terminal font selection did not persist.')
  await shot('15-settings-terminal.png')
  await page.locator('.font-chip', { hasText: 'Cascadia Code' }).click()
  await page.waitForTimeout(250)

  await page.locator('.modal-close').last().click()
  await page.waitForTimeout(300)
  await page.locator('.command-trigger').click()
  await page.waitForTimeout(400)
  await shot('15b-command-palette.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  await page.locator('button[title="Port forwarding"]').click()
  await page.waitForTimeout(400)
  await shot('15c-port-forwarding.png')
  await page.locator('.modal-close').last().click()
  await page.waitForTimeout(300)

  await page.locator('button[title^="Settings"]').click()
  await page.waitForTimeout(400)
  await page.locator('.settings-nav button', { hasText: 'Data & packs' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /New device type/ }).click()
  await page.waitForSelector('.json-editor')
  await page.getByRole('button', { name: /Generate starter/ }).click()
  await page.waitForTimeout(400)
  await shot('16-new-device-type.png')
  await page.getByRole('button', { name: /Create device type/ }).click()
  await page.waitForTimeout(1200)
  const createdToast = await page.getByText('Device pack created', { exact: false }).count()
  if (!createdToast) throw new Error('Custom device pack was not created.')

  await page.evaluate(() => window.close())
  await page.waitForSelector('.quit-panel', { timeout: 8000 })
  await shot('17-quit-guard.png')
  await page.getByRole('button', { name: /^Cancel$/ }).click()
  await page.waitForTimeout(500)

  await debugChip.click()
  await page.getByRole('button', { name: /Mark all stopped/ }).click()
  await page.waitForTimeout(500)
  await page.locator('.modal-close').last().click()

  await page.locator('.sidebar-local').click()
  await page.waitForTimeout(3500)
  await shot('18-local-terminal.png')
  const localStatus = await page.locator('.session-subtitle').innerText()
  if (!/powershell|pwsh/i.test(localStatus)) {
    throw new Error(`Local shell is not PowerShell: ${localStatus}`)
  }

  const errors = await page.locator('.form-error-banner, .terminal-placeholder .placeholder-icon.error').count()
  const status = await page.locator('.statusbar').innerText()
  console.log('\nUI smoke test complete')
  console.log('Screenshots:', results.join(', '))
  console.log('Final status:', status.replace(/\s+/g, ' ').trim())
  console.log('Visible errors:', errors)
} catch (error) {
  console.error('\nUI smoke test failed:', error)
  if (page) {
    try {
      await shot('99-failure.png')
      console.error('Page text excerpt:', (await page.locator('body').innerText()).slice(0, 2000))
    } catch {
      // ignore
    }
  }
  process.exitCode = 1
} finally {
  if (app) {
    try {
      await app.close()
    } catch {
      // ignore
    }
  }
}
