/**
 * Manual lab connectivity check. Reads credentials from the environment only.
 * Usage:
 *   TSTERM_TEST_HOST=192.0.2.10 TSTERM_TEST_USER=admin TSTERM_TEST_PASSWORD=secret node scripts/asa-check.mjs
 */
import { Client } from 'ssh2'

const host = process.env.TSTERM_TEST_HOST
const username = process.env.TSTERM_TEST_USER
const password = process.env.TSTERM_TEST_PASSWORD

if (!host || !username || !password) {
  console.error('Set TSTERM_TEST_HOST, TSTERM_TEST_USER and TSTERM_TEST_PASSWORD.')
  process.exit(2)
}

const client = new Client()
let output = ''

const timeout = setTimeout(() => {
  console.error('Timed out after 20s')
  client.end()
  process.exit(1)
}, 20000)

client.on('ready', () => {
  client.shell({ term: 'vt100', cols: 120, rows: 40 }, (error, stream) => {
    if (error) {
      console.error('Shell failed:', error.message)
      clearTimeout(timeout)
      client.end()
      process.exit(1)
      return
    }
    stream.on('data', (chunk) => {
      output += chunk.toString('utf8')
    })
    setTimeout(() => stream.write('terminal length 0\n'), 600)
    setTimeout(() => stream.write('show version\n'), 1200)
    setTimeout(() => {
      stream.end()
      client.end()
    }, 8500)
  })
})

client.on('error', (error) => {
  clearTimeout(timeout)
  console.error('SSH error:', error.message)
  process.exit(1)
})

client.on('close', () => {
  clearTimeout(timeout)
  const clean = output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '')
  console.log(clean.slice(0, 6000))
  const prompt = clean.split('\n').filter((line) => /[#>]\s*$/.test(line.trim())).slice(-1)[0]
  console.log('\n--- detected prompt ---')
  console.log(prompt?.trim() || '(none)')
  process.exit(0)
})

client.connect({
  host,
  port: Number(process.env.TSTERM_TEST_PORT || 22),
  username,
  password,
  readyTimeout: 15000,
  tryKeyboard: true,
  hostVerifier: () => true
})

client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
  finish(prompts.map(() => password))
})
