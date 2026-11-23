import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-commands-ai-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

fs.writeFileSync(
  path.join(userData, 'settings.json'),
  JSON.stringify({
    aiEnabled: true,
    aiActiveProfileId: 'local-ollama',
    aiIncludeContext: true,
    aiAutoPullLocalModels: false,
    aiProfiles: [
      {
        id: 'local-ollama',
        name: 'Ollama (local)',
        kind: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'qwen3:8b',
        authStyle: 'none',
        maxTokens: 1024,
        temperature: 0.2,
        local: true
      }
    ]
  }),
  'utf8'
)

let app
let page
const errors = []

try {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TSTERM_USER_DATA: userData }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.waitForSelector('.app', { timeout: 30000 })
  await page.waitForTimeout(900)

  const clicked = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return false
    const find = (items) => {
      for (const item of items) {
        if (item.label === 'ASA Command Reference') {
          item.click()
          return true
        }
        if (item.submenu && find(item.submenu.items)) return true
      }
      return false
    }
    return find(menu.items)
  })
  if (!clicked) throw new Error('ASA Command Reference menu item was not found.')

  await page.waitForSelector('.command-browser-modal', { timeout: 5000 })
  const input = page.locator('.cmd-search input')
  await input.fill(
    'Run a packet capture on the outside interface for host 10.1.1.1 talking to 8.8.8.8'
  )
  await page.waitForSelector('.cmd-result', { timeout: 10000 })

  await page.getByRole('button', { name: /Let AI choose/ }).click()
  await page.waitForSelector('.cmd-route-result', { state: 'attached', timeout: 120_000 })
  await page.waitForTimeout(500)

  const routeText = (await page.locator('.cmd-route-result').innerText()).replace(/\n/g, ' · ')
  const preview = (await page.locator('.cmd-preview > code').innerText()).trim()
  const risk = (await page.locator('.cmd-detail-head .cmd-risk').innerText()).trim()
  const params = await page.locator('.cmd-field input').evaluateAll((nodes) =>
    nodes.map((node) => ({ name: node.previousElementSibling?.textContent, value: node.value }))
  )
  await page.screenshot({ path: path.join(shots, 'commands-04-ai-route.png'), animations: 'disabled' })

  const result = { routeText, preview, risk, params, errors }
  console.log(JSON.stringify(result, null, 2))

  if (!/capture TSTCAP interface outside match ip host 10\.1\.1\.1 host 8\.8\.8\.8/.test(preview)) {
    throw new Error(`Unexpected routed preview: ${preview}`)
  }
  if (risk.toUpperCase() !== 'DIAGNOSTIC') throw new Error(`Unexpected risk: ${risk}`)
  if (errors.length) process.exitCode = 1
} catch (error) {
  console.error(error)
  try {
    if (page) {
      await page.screenshot({ path: path.join(shots, 'commands-04-ai-route-error.png'), animations: 'disabled' })
      const routeText = await page.locator('.cmd-route-result').innerText().catch(() => '')
      const toast = await page.locator('.toast').allInnerTexts().catch(() => [])
      console.error('Route text:', routeText)
      console.error('Toasts:', toast)
    }
  } catch {
    // best effort diagnostics
  }
  process.exitCode = 1
} finally {
  await app?.close()
}
