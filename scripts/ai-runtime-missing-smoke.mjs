import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ai-runtime-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

let app
let page
const results = []

async function shot(name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(shots, name), animations: 'disabled' })
  results.push(name)
}

try {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}/v1`
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      schemaVersion: 1,
      aiEnabled: false,
      aiActiveProfileId: 'local-ollama',
      aiAutoPullLocalModels: true,
      aiProfiles: [
        {
          id: 'local-ollama',
          name: 'Ollama (local)',
          kind: 'openai-compatible',
          baseUrl,
          model: 'llama3.2',
          authStyle: 'none',
          maxTokens: 1024,
          temperature: 0.2,
          local: true
        }
      ]
    })
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

  await page.locator('button[title^="Settings"]').click()
  await page.locator('.settings-nav button', { hasText: 'AI assistant' }).click()
  await page.waitForTimeout(300)
  await page.locator('.ai-settings-hero .switch').click()

  await page.waitForSelector('.ai-local-panel.missing', { timeout: 15000 })
  await page.waitForTimeout(700)
  const panelText = await page.locator('.ai-local-panel').innerText()
  if (!/not responding/i.test(panelText)) throw new Error(`Unexpected panel: ${panelText}`)
  const installButton = page.getByRole('button', { name: /^Install Ollama$/ })
  if (!(await installButton.count())) throw new Error('Install Ollama button is missing.')
  if (await page.getByRole('button', { name: /^Download model$/ }).count()) {
    throw new Error('A misleading Download model button is shown while Ollama is missing.')
  }
  await page.locator('.ai-local-panel').scrollIntoViewIfNeeded()
  await shot('27-ai-install-ollama.png')

  await page.locator('.modal-close').last().click()
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForTimeout(700)
  const bannerText = await page.locator('.ai-local-banner').innerText()
  if (!/Install Ollama/.test(bannerText)) {
    throw new Error(`Assistant banner does not offer Install Ollama: ${bannerText}`)
  }
  if (!/not responding/i.test(bannerText)) {
    throw new Error(`Assistant banner does not explain the runtime failure: ${bannerText}`)
  }
  await shot('28-ai-install-ollama-assistant.png')

  console.log('\nMissing-runtime UI smoke test complete')
  console.log('Screenshots:', results.join(', '))
} catch (error) {
  console.error('\nMissing-runtime UI smoke test failed:', error)
  if (page) {
    try {
      await shot('99-ai-runtime-failure.png')
      console.error('Page text excerpt:', (await page.locator('body').innerText()).slice(0, 2500))
    } catch {
      // ignore
    }
  }
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
}
