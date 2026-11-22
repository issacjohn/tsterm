import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const exe = path.resolve('release/win-unpacked/TSTerm.exe')
if (!fs.existsSync(exe)) {
  console.error(`Packaged app not found at ${exe}. Run "npm run package" first.`)
  process.exit(2)
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-packaged-'))
let app
try {
  app = await electron.launch({
    executablePath: exe,
    args: [],
    env: { ...process.env, TSTERM_USER_DATA: userData }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.error('[renderer error]', error.message))
  await page.waitForSelector('.app', { timeout: 30000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'screenshots/19-packaged-welcome.png', animations: 'disabled' })
  await page.locator('.sidebar-local').click()
  await page.waitForTimeout(3000)
  const subtitle = await page.locator('.session-subtitle').innerText()
  const status = await page.locator('.statusbar').innerText()
  if (!/powershell|pwsh/i.test(subtitle)) {
    throw new Error(`Packaged local shell is not PowerShell: ${subtitle}`)
  }
  await page.screenshot({ path: 'screenshots/19-packaged-local.png', animations: 'disabled' })
  console.log('Packaged app smoke test passed.')
  console.log('Local shell:', subtitle)
  console.log('Status:', status.replace(/\s+/g, ' ').trim())
} catch (error) {
  console.error('Packaged app smoke test failed:', error)
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
