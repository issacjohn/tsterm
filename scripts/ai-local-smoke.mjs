import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const ROOT = process.cwd()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-ai-local-'))
const shots = path.join(ROOT, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

const MODEL = 'qwen3:8b'
const REPLY = [
  'Start with the interface counters.',
  '',
  '```ciscoasa',
  'ciscoasa/act# show interface ip brief',
  '```',
  '',
  'I have not run anything.'
].join('\n')

let pulled = false
let pullCalls = 0
let chatCalls = 0
let pullBody = null
let chatBody = null

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/version') {
    return json(response, 200, { version: '0.9.9-mock' })
  }

  if (request.method === 'GET' && request.url === '/api/tags') {
    return json(response, 200, {
      models: pulled ? [{ name: `${MODEL}:latest`, model: `${MODEL}:latest` }] : []
    })
  }

  if (request.method === 'POST' && request.url === '/api/pull') {
    pullCalls += 1
    pullBody = JSON.parse(await readBody(request))
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`)
    setTimeout(() => {
      if (!response.writableEnded) {
        response.write(
          `${JSON.stringify({ status: 'pulling 1234567890ab', completed: 30, total: 100 })}\n`
        )
      }
    }, 450)
    setTimeout(() => {
      if (!response.writableEnded) {
        response.write(
          `${JSON.stringify({ status: 'pulling 1234567890ab', completed: 72, total: 100 })}\n`
        )
      }
    }, 900)
    setTimeout(() => {
      if (response.writableEnded) return
      pulled = true
      response.write(`${JSON.stringify({ status: 'verifying sha256 digest' })}\n`)
      response.write(`${JSON.stringify({ status: 'success' })}\n`)
      response.end()
    }, 1500)
    return
  }

  if (request.method === 'GET' && request.url === '/v1/models') {
    return json(response, 200, { data: [{ id: MODEL }] })
  }

  if (request.method === 'POST' && request.url === '/api/chat') {
    chatCalls += 1
    chatBody = JSON.parse(await readBody(request))
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write(
      `${JSON.stringify({ message: { role: 'assistant', content: REPLY }, done: false })}\n`
    )
    response.write(`${JSON.stringify({ done: true })}\n`)
    response.end()
    return
  }

  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    chatCalls += 1
    chatBody = JSON.parse(await readBody(request))
    return json(response, 200, {
      choices: [{ message: { content: REPLY } }]
    })
  }

  json(response, 404, { error: { message: 'not found' } })
})

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
  await page.waitForTimeout(700)

  await page.locator('.sidebar-local').click()
  await page.waitForSelector('.connection-pill.connected', { timeout: 20000 })

  await page.locator('button[title^="Settings"]').click()
  await page.locator('.settings-nav button', { hasText: 'AI assistant' }).click()
  await page.waitForTimeout(350)
  await page.locator('.ai-settings-hero .switch').click()
  await page.waitForTimeout(500)

  await page
    .locator('.ai-profile-grid label')
    .filter({ hasText: 'Base URL' })
    .locator('input')
    .fill(baseUrl)
  await page.getByRole('button', { name: /Save provider/ }).click()

  await page.waitForSelector('.ai-local-panel', { timeout: 15000 })
  await page.waitForSelector('.ai-local-panel.pulling', { timeout: 15000 })
  await page.waitForTimeout(550)
  await shot('24-ai-model-download.png')

  await page.locator('.modal-close').last().click()
  await page.locator('.ts-mode-tabs button', { hasText: 'Assistant' }).click()
  await page.waitForSelector('.ai-local-banner.pulling', { timeout: 10000 })
  await shot('25-ai-model-pulling-panel.png')

  await page.waitForFunction(
    () => {
      const input = document.querySelector('.ai-composer textarea')
      return input instanceof HTMLTextAreaElement && !input.disabled
    },
    { timeout: 30000 }
  )
  await page.waitForTimeout(600)

  if (!pulled) throw new Error('The mock Ollama model was never marked as pulled.')
  if (pullCalls !== 1) throw new Error(`Expected exactly one automatic pull, got ${pullCalls}.`)
  if (!pullBody || pullBody.name !== MODEL) {
    throw new Error(`Unexpected pull body: ${JSON.stringify(pullBody)}`)
  }

  await page.locator('.ai-composer textarea').fill('Check the interface status.')
  await page.getByRole('button', { name: /^Ask$/ }).click()
  await page.waitForSelector('.ai-code', { timeout: 20000 })
  await page.waitForTimeout(400)
  await shot('26-ai-auto-pulled-chat.png')

  if (chatCalls !== 1) throw new Error(`Expected one chat request, got ${chatCalls}.`)
  if (chatBody?.model !== MODEL) throw new Error(`Wrong model used: ${chatBody?.model}`)
  if (chatBody?.options?.num_ctx !== 16384) {
    throw new Error(`Expected the native Ollama context window, got ${chatBody?.options?.num_ctx}`)
  }
  if (!String(chatBody?.messages?.[0]?.content).includes('You cannot execute commands')) {
    throw new Error('The chat request lost the execution ban.')
  }

  console.log('\nLocal model auto-install smoke test complete')
  console.log('Pull calls:', pullCalls)
  console.log('Chat calls:', chatCalls)
  console.log('Screenshots:', results.join(', '))
} catch (error) {
  console.error('\nLocal model auto-install smoke test failed:', error)
  if (page) {
    try {
      await shot('99-ai-local-failure.png')
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
