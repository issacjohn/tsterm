import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ai-threads-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

const requests = []
const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end('{"error":"not found"}')
    return
  }
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
  })
  request.on('end', () => {
    const payload = JSON.parse(body)
    const messages = payload.messages || []
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    const prompt = lastUser?.content ?? ''
    requests.push({ prompt, system: messages[0]?.content ?? '' })
    const reply = `Reply to: ${prompt}`
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`
      )
      response.write('data: [DONE]\n\n')
      response.end()
    }, 650)
  })
})

let app
let page
const results = []

async function shot(name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(shots, name), animations: 'disabled' })
  results.push(name)
}

async function waitForIdle() {
  await page.waitForFunction(
    () => !document.querySelector('.ai-stop') && Boolean(document.querySelector('.ai-send')),
    { timeout: 30000 }
  )
}

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}/v1`

  const customCatalog = path.join(userData, 'catalog')
  fs.mkdirSync(customCatalog, { recursive: true })
  fs.copyFileSync(
    path.join(ROOT, 'catalog-archive', 'windows.json'),
    path.join(customCatalog, 'windows.json')
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

  const topVersion = await page.locator('.topbar-version').innerText()
  if (!/v\d+\.\d+\.\d+/.test(topVersion)) throw new Error(`Top-bar version missing: ${topVersion}`)
  if (!(await page.locator('.topbar-version button[title="Check for updates"]').count())) {
    throw new Error('Top-bar update button is missing.')
  }

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
  await page.waitForTimeout(300)
  const asaScope = await page.locator('.ai-scope-line').innerText()
  if (!/Cisco ASA runbooks only/.test(asaScope)) throw new Error(`Wrong ASA scope: ${asaScope}`)

  await page.locator('.ai-composer textarea').fill('ASA background question')
  await page.getByRole('button', { name: /^Ask$/ }).click()

  // Switch terminals while the ASA request is still streaming.
  await page.locator('.sidebar-local').click()
  await page.waitForTimeout(600)
  if ((await page.locator('.tab').count()) < 2) throw new Error('Second terminal did not open.')
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForTimeout(300)

  const winScope = await page.locator('.ai-scope-line').innerText()
  if (!/Windows runbooks only/.test(winScope)) throw new Error(`Wrong Windows scope: ${winScope}`)
  if ((await page.locator('.ai-message').count()) !== 0) {
    throw new Error('The new Windows terminal inherited the ASA conversation.')
  }

  await page.locator('.ai-composer textarea').fill('Windows question')
  await page.getByRole('button', { name: /^Ask$/ }).click()
  await waitForIdle()
  await page.waitForTimeout(300)
  await page.getByText('Reply to: Windows question', { exact: false }).waitFor({ timeout: 10000 })

  await page.locator('.tab').nth(0).click()
  await page.waitForTimeout(400)
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await waitForIdle()
  await page.getByText('Reply to: ASA background question', { exact: false }).waitFor({
    timeout: 15000
  })
  if (await page.getByText('Reply to: Windows question', { exact: false }).count()) {
    throw new Error('The ASA thread is showing the Windows conversation.')
  }

  await page.locator('.ai-composer textarea').fill('unsent ASA draft')
  await page.locator('.tab').nth(1).click()
  await page.waitForTimeout(300)
  await page.locator('.tab').nth(0).click()
  await page.waitForTimeout(300)
  const restoredDraft = await page.locator('.ai-composer textarea').inputValue()
  if (restoredDraft !== 'unsent ASA draft') {
    throw new Error(`ASA draft was not restored: "${restoredDraft}"`)
  }
  await shot('31-ai-per-terminal-threads.png')

  if (requests.length < 2) throw new Error('Expected two chat requests.')
  const asaRequest = requests.find((item) => item.prompt === 'ASA background question')
  const winRequest = requests.find((item) => item.prompt === 'Windows question')
  if (!asaRequest || !winRequest) throw new Error('Missing chat request.')
  if (!asaRequest.system.includes('active device pack is Cisco ASA')) {
    throw new Error('ASA request was not scoped to Cisco ASA.')
  }
  if (!winRequest.system.includes('active device pack is Windows')) {
    throw new Error('Windows request was not scoped to Windows.')
  }
  if (winRequest.system.includes('Cisco ASA runbook')) {
    throw new Error('ASA runbook context leaked into the Windows request.')
  }
  if (
    winRequest.system.includes('Top-level ASA commands') ||
    winRequest.system.includes('capture TSTCAP')
  ) {
    throw new Error('ASA command syntax leaked into the Windows request.')
  }

  console.log('\nPer-terminal AI thread smoke test complete')
  console.log('Top bar:', topVersion.replace(/\s+/g, ' ').trim())
  console.log('Screenshots:', results.join(', '))
} catch (error) {
  console.error('\nPer-terminal AI thread smoke test failed:', error)
  if (page) {
    try {
      await shot('99-ai-threads-failure.png')
      console.error('Page text excerpt:', (await page.locator('body').innerText()).slice(0, 3000))
    } catch {
      // ignore
    }
  }
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  server.close()
}
