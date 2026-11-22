import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from 'ssh2'
import { _electron as electron } from 'playwright-core'

const PASSWORD = process.env.TSTERM_TEST_PASSWORD
const HOST = process.env.TSTERM_TEST_HOST
const USER = process.env.TSTERM_TEST_USER
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tsterm-debug-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!PASSWORD || !HOST || !USER) {
  console.error('Set TSTERM_TEST_HOST, TSTERM_TEST_USER and TSTERM_TEST_PASSWORD before running the debug test.')
  process.exit(2)
}

function runOnAsa(command) {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let output = ''
    const timeout = setTimeout(() => {
      client.end()
      resolve(output)
    }, 7000)
    client.on('ready', () => {
      client.shell({ term: 'vt100', cols: 160, rows: 48 }, (error, stream) => {
        if (error) {
          clearTimeout(timeout)
          reject(error)
          return
        }
        stream.on('data', (chunk) => {
          output += chunk.toString('utf8')
        })
        setTimeout(() => stream.write('terminal pager 0\n'), 350)
        setTimeout(() => stream.write('show debug\n'), 900)
        setTimeout(() => {
          clearTimeout(timeout)
          stream.end()
          client.end()
          resolve(output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, ''))
        }, 4200)
      })
    })
    client.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    client.connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASSWORD,
      readyTimeout: 12000,
      tryKeyboard: true,
      hostVerifier: () => true
    })
    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => PASSWORD))
    })
  })
}

let app
let page
let failed = false

try {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TSTERM_USER_DATA: userData }
  })
  page = await app.firstWindow()
  page.on('dialog', (dialog) => dialog.accept())
  await page.waitForSelector('.app', { timeout: 30000 })
  await page.locator('.welcome-actions .btn-primary').click()
  await page.locator('.field', { hasText: 'Display name' }).locator('input').fill('ASA Lab')
  await page.locator('.field', { hasText: 'Hostname or IP' }).locator('input').fill(HOST)
  await page.locator('.field', { hasText: 'Username' }).locator('input').fill(USER)
  await page.locator('.modal-panel input[type="password"]').first().fill(PASSWORD)
  await page.getByRole('button', { name: /Save & connect/ }).click()
  await page.waitForTimeout(4500)
  if (await page.getByText('Verify host identity', { exact: false }).count()) {
    await page.getByRole('button', { name: /Trust & connect/ }).click()
    await page.waitForTimeout(2500)
  }
  if (await page.getByText('What kind of device is this?', { exact: false }).count()) {
    await page.locator('.device-search input').fill('ASA')
    await page.locator('.device-option', { hasText: 'Cisco ASA' }).first().click()
    await page.getByRole('button', { name: /Use Cisco ASA/ }).click()
  }
  await page.waitForSelector('.connection-pill.connected', { timeout: 30000 })

  await page.locator('input[aria-label="Search troubleshooting runbooks"]').fill('radius')
  await page.waitForTimeout(400)
  await page.locator('.ts-row', { hasText: /all users/ }).first().click()
  await page.getByRole('button', { name: /Open runbook/ }).click()
  await page.waitForSelector('.runbook-warning')
  await page.locator('.runbook-footer-left input[type="checkbox"]').check()
  await page.getByRole('button', { name: /Send to terminal/ }).click()
  await page.waitForSelector('.debug-chip', { timeout: 8000 })
  await page.waitForTimeout(6500)

  const before = await runOnAsa('show debug')
  const armed = /debug radius/.test(before)
  console.log(`Debug active after send: ${armed}`)
  if (!armed) {
    throw new Error('The debug command was not active on the ASA before quit.')
  }

  await page.evaluate(() => window.close())
  await page.waitForSelector('.quit-panel', { timeout: 8000 })
  await page.getByRole('button', { name: /Stop debugs & quit/ }).click()
  await sleep(4500)

  const after = await runOnAsa('show debug')
  const stillArmed = /debug radius/.test(after)
  console.log(`Debug active after quit cleanup: ${stillArmed}`)
  console.log('show debug after cleanup:')
  console.log(after.trim().slice(-1000))
  if (stillArmed) {
    failed = true
    throw new Error('Cleanup did not disable the RADIUS debug on the ASA.')
  }
  const cleanupFiles = fs.readdirSync(path.join(userData, 'exports')).filter((file) => file.startsWith('cleanup-'))
  console.log(`Cleanup file written: ${cleanupFiles.length > 0}`)
  if (!cleanupFiles.length) {
    failed = true
    throw new Error('No cleanup file was written to the exports folder.')
  }

  console.log('Live debug guard test passed.')
} catch (error) {
  failed = true
  console.error('Live debug guard test failed:', error)
  if (page) {
    try {
      console.error((await page.locator('body').innerText()).slice(0, 1500))
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
  if (!failed) process.exit(0)
}
