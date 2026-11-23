import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ai-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

const API_KEY = 'smoke-key-not-a-real-secret'
const MODEL = 'mock-troubleshooter'
const REPLY = [
  'Start with read-only checks, then capture only if the counters move.',
  '',
  '```ciscoasa',
  'ciscoasa/act# show version',
  'show interface ip brief',
  '```',
  '',
  'If you need a capture, use this pair:',
  '',
  '```ciscoasa',
  'capture cap interface outside match ip any any',
  'no capture cap',
  '```',
  '',
  'I have not run anything. Filling a line only stages it in the prompt.'
].join('\n')

const requests = []
let modelListCalls = 0
const server = http.createServer((request, response) => {
  const auth = request.headers.authorization
  const json = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(body))
  }

  if (request.method === 'GET' && request.url === '/v1/models') {
    modelListCalls += 1
    if (auth !== `Bearer ${API_KEY}`) return json(401, { error: { message: 'bad auth' } })
    return json(200, { data: [{ id: MODEL }] })
  }

  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    if (auth !== `Bearer ${API_KEY}`) return json(401, { error: { message: 'bad auth' } })
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        const payload = JSON.parse(body)
        requests.push(payload)
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        })
        const pieces = REPLY.match(/[\s\S]{1,24}/g) || []
        let index = 0
        const send = () => {
          if (response.writableEnded) return
          if (index < pieces.length) {
            response.write(
              `data: ${JSON.stringify({ choices: [{ delta: { content: pieces[index] } }] })}\n\n`
            )
            index += 1
            setTimeout(send, 35)
          } else {
            response.write('data: [DONE]\n\n')
            response.end()
          }
        }
        send()
      } catch (error) {
        return json(400, { error: { message: error.message } })
      }
    })
    return
  }

  json(404, { error: { message: 'not found' } })
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
let app
let page

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

  await page.waitForSelector('.app', { timeout: 30000 })
  await page.waitForTimeout(800)

  await page.locator('.sidebar-local').click()
  await page.waitForTimeout(3000)
  await page.waitForSelector('.connection-pill.connected', { timeout: 20000 })

  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForSelector('.ai-opt-in')
  await shot('19-ai-opt-in.png')

  await page.locator('button[title^="Settings"]').click()
  await page.locator('.settings-nav button', { hasText: 'AI assistant' }).click()
  await page.waitForTimeout(400)
  await page.locator('.ai-settings-hero .switch').click()
  await page.waitForTimeout(500)
  await shot('20-ai-settings.png')

  await page.getByRole('button', { name: /Add provider/ }).click()
  await page.waitForTimeout(350)
  const nameField = page.locator('.ai-profile-grid label').filter({ hasText: 'Name' }).locator('input').first()
  await nameField.fill('Mock local model')
  await page
    .locator('.ai-profile-grid label')
    .filter({ hasText: 'Base URL' })
    .locator('input')
    .fill(baseUrl)
  await page.locator('.ai-profile-grid label').filter({ hasText: 'Auth header' }).locator('select').selectOption('bearer')
  await page.locator('.ai-key-row input').fill(API_KEY)
  await page.getByRole('button', { name: /^Save key$/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Fetch models/ }).click()
  await page.waitForTimeout(900)
  const modelValue = await page.locator('.ai-model-row label input').inputValue()
  if (modelValue !== MODEL) throw new Error(`Expected detected model ${MODEL}, got ${modelValue}`)
  await page.getByRole('button', { name: /Save provider/ }).click()
  await page.waitForTimeout(700)
  if (!(await page.getByText('Mock local model', { exact: false }).count())) {
    throw new Error('New AI provider was not saved.')
  }
  await shot('20b-ai-provider.png')

  await page.locator('.modal-close').last().click()
  await page.waitForTimeout(400)
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForSelector('.ai-composer textarea')
  await page.locator('.ai-composer textarea').fill('The ASA is dropping traffic. What should I check first?')
  await page.getByRole('button', { name: /^Ask$/ }).click()
  await page.waitForSelector('.ai-code', { timeout: 20000 })
  await page.waitForTimeout(500)
  await shot('21-ai-chat.png')

  if (!requests.length) throw new Error('The mock provider never received a chat request.')
  const sent = requests[0]
  const system = sent.messages?.[0]?.content ?? ''
  if (!system.includes('You cannot execute commands')) {
    throw new Error('System prompt does not contain the execution ban.')
  }
  if (!system.includes('UNTRUSTED DATA')) {
    throw new Error('Terminal context is not marked as untrusted data.')
  }
  if (sent.model !== MODEL) throw new Error(`Wrong model sent: ${sent.model}`)
  if (sent.stream !== true) throw new Error('Expected a streaming request.')

  const beforeRows = await page.locator('.xterm-rows > div').allInnerTexts()
  await page.locator('.ai-command-line .ai-fill-btn').first().click()
  await page.waitForTimeout(500)
  await shot('22-ai-fill.png')
  const afterRows = await page.locator('.xterm-rows > div').allInnerTexts()
  const lastText = afterRows.filter((line) => line.trim()).at(-1) ?? ''
  if (!lastText.includes('show version')) {
    throw new Error('The command was not placed in the terminal prompt.')
  }
  if (afterRows.length > beforeRows.length + 1) {
    throw new Error('Filling a command added terminal lines, which suggests Enter was pressed.')
  }
  const transcript = afterRows.join('\n')
  if (/not recognized|CommandNotFound|is not recognized/i.test(transcript)) {
    throw new Error('The filled command appears to have been executed.')
  }

  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.locator('.ts-mode-tabs button', { hasText: 'Runbooks' }).click()
  await page.waitForTimeout(250)

  await page.locator('button[title^="Settings"]').click()
  await page.locator('.settings-nav button', { hasText: 'AI assistant' }).click()
  await page.waitForTimeout(350)
  await page.locator('.ai-settings-hero .switch').click()
  await page.waitForTimeout(500)
  await page.locator('.modal-close').last().click()
  await page.waitForTimeout(350)
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForSelector('.ai-opt-in')
  await shot('23-ai-disabled.png')

  console.log('\nAI smoke test complete')
  console.log('Model list calls:', modelListCalls)
  console.log('Chat requests:', requests.length)
  console.log('Screenshots:', results.join(', '))
} catch (error) {
  console.error('\nAI smoke test failed:', error)
  if (page) {
    try {
      await shot('99-ai-failure.png')
      console.error('Page text excerpt:', (await page.locator('body').innerText()).slice(0, 2500))
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
  server.close()
}
