import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const MODEL = process.env.TSTERM_OLLAMA_MODEL || 'qwen2.5:7b'
const BASE = process.env.TSTERM_OLLAMA_BASE || 'http://127.0.0.1:11434'
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ollama-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

let app
let page

try {
  const status = await fetch(`${BASE}/api/tags`).then((response) => response.json())
  const installed = (status.models || []).some(
    (model) => String(model.name).replace(/:latest$/, '') === MODEL.replace(/:latest$/, '')
  )
  if (!installed) {
    console.error(`Skipping: ${MODEL} is not installed in Ollama at ${BASE}.`)
    process.exit(2)
  }

  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      schemaVersion: 1,
      aiEnabled: true,
      aiActiveProfileId: 'local-ollama',
      aiAutoPullLocalModels: true,
      aiIncludeContext: false,
      aiProfiles: [
        {
          id: 'local-ollama',
          name: 'Ollama (local)',
          kind: 'openai-compatible',
          baseUrl: `${BASE}/v1`,
          model: MODEL,
          authStyle: 'none',
          maxTokens: 256,
          temperature: 0.1,
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
  await page.locator('.device-chip').click()
  await page.waitForSelector('.device-search input')
  await page.locator('.device-search input').fill('ASA')
  await page.waitForTimeout(300)
  await page.locator('.device-option', { hasText: 'Cisco ASA' }).first().click()
  await page.getByRole('button', { name: /Use Cisco ASA/ }).click()
  await page.waitForTimeout(400)
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()

  await page.waitForFunction(
    () => {
      const input = document.querySelector('.ai-composer textarea')
      return input instanceof HTMLTextAreaElement && !input.disabled
    },
    { timeout: 30000 }
  )

  await page
    .locator('.ai-composer textarea')
    .fill('Reply with exactly one short sentence: what command shows interface IP addresses on a Cisco ASA?')
  await page.getByRole('button', { name: /^Ask$/ }).click()
  await page.waitForFunction(
    () => !document.querySelector('.ai-stop') && Boolean(document.querySelector('.ai-send')),
    { timeout: 180000 }
  )
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(shots, '29-ai-real-ollama.png'), animations: 'disabled' })

  const reply = await page.locator('.ai-message.assistant .ai-text').last().innerText()
  if (!/show\s+(?:interface|ip)/i.test(reply)) {
    throw new Error(`Unexpected Ollama reply: ${reply.slice(0, 500)}`)
  }
  console.log('Real Ollama chat passed.')
  console.log('Model:', MODEL)
  console.log('Reply excerpt:', reply.replace(/\s+/g, ' ').slice(0, 240))
} catch (error) {
  console.error('Real Ollama chat failed:', error)
  if (page) {
    try {
      await page.screenshot({ path: path.join(shots, '99-ai-ollama-failure.png'), animations: 'disabled' })
      console.error('Page text excerpt:', (await page.locator('body').innerText()).slice(0, 2500))
    } catch {
      // ignore
    }
  }
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
}
