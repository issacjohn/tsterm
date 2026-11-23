import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const OLLAMA = 'http://127.0.0.1:11434'
const MODELS = ['qwen3:8b', 'deepseek-r1:8b']
const LIMIT = Number(process.env.BENCH_LIMIT || 0)
const SEED = 1337

function mulberry32(seed) {
  let value = seed
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items, random = mulberry32(SEED)) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function parseAsaCommands() {
  const source = fs.readFileSync(path.join(ROOT, 'src/shared/asa-commands.ts'), 'utf8')
  const entries = []
  const pattern =
    /name: '([^']+)', description: '([^']+)'(?:, example: '([^']+)')?/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ name: match[1], description: match[2], example: match[3] })
  }
  return entries
}

function commandFromStep(step) {
  return typeof step === 'string' ? step : step?.command
}

function workflowCommands(workflow) {
  const primary = (workflow.steps ?? []).map(commandFromStep).filter(Boolean)
  const verify = (workflow.verify ?? []).map(commandFromStep).filter(Boolean)
  const cleanup = (workflow.cleanup ?? []).map(commandFromStep).filter(Boolean)
  return { primary, verify, cleanup, all: [...primary, ...verify, ...cleanup] }
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/```[a-z0-9_-]*\r?\n/gi, ' ')
    .replace(/```/g, ' ')
    .replace(/ciscoasa[^\s]*#/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsCommand(answer, expected) {
  const a = normalize(answer)
  const e = normalize(expected)
  if (!e) return false
  return a.includes(e)
}

function namesCommand(answer, name) {
  const tokens = normalize(answer).split(/[^a-z0-9_-]+/).filter(Boolean)
  return tokens.includes(name.toLowerCase())
}

const pack = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'resources/catalog/cisco-asa.json'), 'utf8')
)

// Context-assisted runbook extraction questions.
const runbookPool = []
for (const workflow of pack.workflows ?? []) {
  const { primary, verify, cleanup, all } = workflowCommands(workflow)
  if (!all.length) continue
  let commandNumber = 1
  const contextLines = [`### ${workflow.title}`, `Summary: ${workflow.summary}`]
  const appendSection = (label, commands) => {
    if (!commands.length) return
    contextLines.push(label)
    for (const command of commands) {
      contextLines.push(`${commandNumber}. ${command}`)
      commandNumber += 1
    }
  }
  appendSection('Primary commands:', primary)
  appendSection('Verify commands:', verify)
  appendSection('Cleanup commands:', cleanup)
  const context = contextLines.join('\n')

  const add = (kind, expected) => {
    if (!expected || expected.includes('{')) return
    runbookPool.push({
      id: `runbook-${workflow.id}-${kind}-${runbookPool.length}`,
      category: kind,
      context: `TSTerm runbook context:\n${context}`,
      question:
        kind === 'first'
          ? `Using the runbook context above, return the exact first primary command.`
          : kind === 'second'
            ? `Using the runbook context above, return the exact second primary command.`
            : kind === 'last'
              ? `Using the runbook context above, return the exact last primary command.`
              : `Using the runbook context above, return the exact cleanup command.`,
      expected,
      evaluate: 'command'
    })
  }

  add('first', primary[0])
  add('second', primary[1])
  add('last', primary[primary.length - 1])
  add('cleanup', cleanup[0])

  for (let index = 0; index < all.length; index += 1) {
    const command = all[index]
    if (command.includes('{')) continue
    runbookPool.push({
      id: `runbook-${workflow.id}-pos-${index}`,
      category: 'position',
      context: `TSTerm runbook context:\n${context}`,
      question: `Using the runbook context above, return command number ${index + 1} exactly.`,
      expected: command,
      evaluate: 'command'
    })
  }
}

const questions = shuffle(runbookPool).slice(0, LIMIT > 0 ? LIMIT : 300)
if (!questions.length) throw new Error('No runbook questions were generated.')

const system = [
  'You are TSTerm AI, a senior Cisco ASA engineer.',
  'Active device pack: Cisco ASA only. Use only ASA commands.',
  'The supplied runbook context is the source of truth. Quote commands exactly as written.',
  'Return exactly one fenced text code block with the requested command.',
  'Do not explain. Do not include prompts. If the answer is not in the context, return UNKNOWN.'
].join(' ')

async function ask(model, item) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180000)
  const started = Date.now()
  try {
    const response = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        ...(model.startsWith('deepseek') ? {} : { think: false }),
        keep_alive: '15m',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: item.context ? `${item.context}\n\nQuestion: ${item.question}` : item.question
          }
        ],
        options: {
          temperature: 0,
          seed: 42,
          num_predict: 512,
          num_ctx: 8192
        }
      })
    })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`, ms: Date.now() - started }
    }
    const data = await response.json()
    const answer = String(data.message?.content ?? '')
    const evaluate = item.evaluate === 'command-name'
      ? namesCommand(answer, item.expected)
      : containsCommand(answer, item.expected)
    return {
      ok: true,
      answer,
      correct: evaluate,
      ms: Date.now() - started,
      evalCount: data.eval_count ?? 0,
      evalDuration: data.eval_duration ?? 0,
      totalDuration: data.total_duration ?? 0
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started
    }
  } finally {
    clearTimeout(timer)
  }
}

const results = []
const modelSummaries = []
fs.mkdirSync(path.join(ROOT, 'benchmarks'), { recursive: true })

for (const model of MODELS) {
  console.log(`\n=== ${model} ===`)
  let correct = 0
  let totalMs = 0
  let tokens = 0
  let tokenSeconds = 0
  for (let index = 0; index < questions.length; index += 1) {
    const item = questions[index]
    const result = await ask(model, item)
    const row = { model, ...item, ...result }
    results.push(row)
    if (result.ok && result.correct) correct += 1
    totalMs += result.ms
    if (result.ok) {
      tokens += result.evalCount
      tokenSeconds += result.evalDuration / 1e9
    }
    if ((index + 1) % 10 === 0 || index === questions.length - 1) {
      console.log(`${index + 1}/${questions.length} correct=${correct} last=${result.ok ? (result.correct ? 'PASS' : 'FAIL') : result.error}`)
    }
  }
  const answered = results.filter((row) => row.model === model).length
  modelSummaries.push({
    model,
    questions: answered,
    correct,
    accuracy: answered ? correct / answered : 0,
    medianMs: (() => {
      const values = results.filter((row) => row.model === model).map((row) => row.ms).sort((a, b) => a - b)
      return values.length ? values[Math.floor(values.length / 2)] : 0
    })(),
    avgTokensPerSecond: tokenSeconds > 0 ? tokens / tokenSeconds : 0,
    errors: results.filter((row) => row.model === model && !row.ok).length
  })
  fs.writeFileSync(
    path.join(ROOT, 'benchmarks', 'asa-model-benchmark-partial.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), questions: questions.length, results, modelSummaries }, null, 2)
  )
}

const report = {
  generatedAt: new Date().toISOString(),
  questions: questions.length,
  models: MODELS,
  system,
  summaries: modelSummaries,
  byCategory: MODELS.map((model) => {
    const rows = results.filter((row) => row.model === model)
    const categories = [...new Set(rows.map((row) => row.category))]
    return {
      model,
      categories: categories.map((category) => {
        const subset = rows.filter((row) => row.category === category)
        return {
          category,
          questions: subset.length,
          correct: subset.filter((row) => row.ok && row.correct).length
        }
      })
    }
  }),
  failures: results.filter((row) => row.ok && !row.correct).slice(0, 20),
  results
}

fs.writeFileSync(
  path.join(ROOT, 'benchmarks', 'asa-model-benchmark.json'),
  JSON.stringify(report, null, 2),
  'utf8'
)

const lines = [
  '# ASA model benchmark',
  '',
  `Generated: ${report.generatedAt}`,
  `Questions per model: ${questions.length}`,
  '',
  '## Results',
  '',
  '| Model | Correct | Accuracy | Median latency | Tokens/sec | Errors |',
  '| --- | ---: | ---: | ---: | ---: | ---: |'
]
for (const summary of modelSummaries) {
  lines.push(
    `| ${summary.model} | ${summary.correct}/${summary.questions} | ${(summary.accuracy * 100).toFixed(1)}% | ${summary.medianMs} ms | ${summary.avgTokensPerSecond.toFixed(1)} | ${summary.errors} |`
  )
}
lines.push('', '## By category', '', '| Model | Category | Correct | Questions | Accuracy |', '| --- | --- | ---: | ---: | ---: |')
for (const entry of report.byCategory) {
  for (const category of entry.categories) {
    lines.push(
      `| ${entry.model} | ${category.category} | ${category.correct} | ${category.questions} | ${((category.correct / category.questions) * 100).toFixed(1)}% |`
    )
  }
}
lines.push('', '## Method', '', '- Every question includes the numbered TSTerm ASA runbook context; the expected command is present.')
lines.push('- The model must return the exact requested command, not a paraphrase.')
lines.push('- Exact command matching, no LLM judge. Temperature 0, 8K context, 512 output tokens.')
lines.push('- Qwen3 runs with thinking disabled; DeepSeek R1 uses its normal reasoning mode.')
lines.push('', '## Sample failures', '')
for (const failure of report.failures.slice(0, 12)) {
  lines.push(`### ${failure.model} / ${failure.category}`)
  lines.push(`Question: ${failure.question}`)
  lines.push(`Expected: \`${failure.expected}\``)
  lines.push(`Answer: ${String(failure.answer).replace(/\s+/g, ' ').slice(0, 300)}`)
  lines.push('')
}

fs.writeFileSync(
  path.join(ROOT, 'benchmarks', 'asa-model-benchmark.md'),
  lines.join('\n'),
  'utf8'
)

console.log('\nBenchmark complete.')
for (const summary of modelSummaries) {
  console.log(
    `${summary.model}: ${summary.correct}/${summary.questions} (${(summary.accuracy * 100).toFixed(1)}%), median ${summary.medianMs} ms, ${summary.avgTokensPerSecond.toFixed(1)} tok/s, errors ${summary.errors}`
  )
}
console.log('Report: benchmarks/asa-model-benchmark.md')
