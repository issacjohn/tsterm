import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-update-'))
let app
try {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TSTERM_USER_DATA: userData }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.error('[renderer error]', error.message))
  await page.waitForSelector('.app', { timeout: 30000 })
  await page.locator('button[title^="Settings"]').click()
  await page.locator('.settings-nav button', { hasText: 'About' }).click()
  await page
    .locator('.settings-content')
    .getByRole('button', { name: /Check for updates/ })
    .click()
  await page.waitForTimeout(2600)
  const body = await page.locator('body').innerText()
  const upToDate = /up to date|latest version/i.test(body)
  const releaseError = /update check failed|github returned|could not reach/i.test(body)
  console.log(`Update check reached GitHub successfully: ${upToDate}`)
  if (releaseError) console.log(body.slice(-800))
  if (!upToDate) throw new Error('The live GitHub update check did not report the current release as up to date.')
  await page.screenshot({ path: 'screenshots/20-update-check.png', animations: 'disabled' })
  console.log('Live update check smoke test passed.')
} catch (error) {
  console.error('Live update check smoke test failed:', error)
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
