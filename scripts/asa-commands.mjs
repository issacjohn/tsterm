import { Client } from 'ssh2'

const host = process.env.TSTERM_TEST_HOST
const username = process.env.TSTERM_TEST_USER
const password = process.env.TSTERM_TEST_PASSWORD

if (!host || !username || !password) {
  console.error('Set TSTERM_TEST_HOST, TSTERM_TEST_USER and TSTERM_TEST_PASSWORD.')
  process.exit(2)
}

const commands = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'terminal pager 0',
      'show version | include Version',
      'show aaa-server',
      'debug radius ?',
      'debug radius user ?',
      'undebug radius all',
      'show capture',
      'undebug all'
    ]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const commandDelay = Math.max(600, Number(process.env.TSTERM_COMMAND_DELAY || 2200))
let output = ''
let stream = null
let lastSpace = 0

const pager = setInterval(() => {
  if (!stream) return
  if (/<--- More --->/.test(output.slice(-300)) && Date.now() - lastSpace > 350) {
    stream.write(' ')
    lastSpace = Date.now()
  }
}, 120)

const finish = (code = 0) => {
  clearInterval(pager)
  const clean = output
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r/g, '')
  console.log(process.env.TSTERM_FULL_OUTPUT ? clean : clean.slice(-30000))
  try {
    client.end()
  } catch {
    // ignore
  }
  process.exit(code)
}

const client = new Client()
const timeout = setTimeout(() => finish(1), 100000)

client.on('ready', () => {
  client.shell({ term: 'vt100', cols: 160, rows: 48 }, async (error, channel) => {
    if (error) {
      console.error('Shell failed:', error.message)
      finish(1)
      return
    }
    stream = channel
    channel.on('data', (chunk) => {
      output += chunk.toString('utf8')
    })
    await sleep(1200)
    for (const command of commands) {
      stream.write(`${command}\n`)
      await sleep(commandDelay)
    }
    await sleep(2500)
    clearTimeout(timeout)
    finish(0)
  })
})

client.on('error', (error) => {
  console.error('SSH error:', error.message)
  finish(1)
})

client.connect({
  host,
  username,
  password,
  port: Number(process.env.TSTERM_TEST_PORT || 22),
  readyTimeout: 15000,
  tryKeyboard: true,
  hostVerifier: () => true,
  keepaliveInterval: 10000
})

client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finishPrompt) => {
  finishPrompt(prompts.map(() => password))
})
