import type { DeviceType, Workflow } from './types'
import {
  buildRunbook,
  initialValues,
  runbookCleanupCommands,
  runbookCommands,
  searchWorkflows
} from './catalog-utils'

const MAX_HINTS = 4

function describeWorkflow(workflow: Workflow): string {
  const runbook = buildRunbook(workflow, initialValues(workflow))
  const commands = runbookCommands(runbook).slice(0, 6)
  const cleanup =
    workflow.effect === 'debug' || workflow.effect === 'capture' || workflow.effect === 'change'
      ? runbookCleanupCommands(runbook).slice(0, 4)
      : []
  return [
    `### ${workflow.title} (${workflow.severity}, ${workflow.effect})`,
    workflow.summary,
    commands.length ? `Commands:\n${commands.join('\n')}` : '',
    cleanup.length ? `Cleanup:\n${cleanup.join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function hintQueries(query: string): string[] {
  const original = query.trim()
  const cleaned = original
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, ' ')
    .replace(/\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}\b/gi, ' ')
    .replace(/\b\d{1,5}\b/g, ' ')
    .replace(/\b(?:source|destination|src|dst|from|to|between|traffic|inside|outside|interface)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...new Set([original, cleaned].filter(Boolean))]
}

export function buildRunbookHints(type: DeviceType | undefined, query: string): string[] {
  if (!type) return []
  try {
    let workflows: Workflow[] = []
    for (const candidate of hintQueries(query)) {
      const hits = searchWorkflows(type, candidate, { partial: true, minCoverage: 0.25 })
      if (hits.length) {
        workflows = hits.slice(0, MAX_HINTS).map(({ workflow }) => workflow)
        break
      }
    }

    const cleanTokens =
      hintQueries(query)
        .join(' ')
        .toLowerCase()
        .match(/[a-z][a-z0-9-]{2,}/g) ?? []
    const category = type.categories.find((item) => {
      const blob = `${item.name} ${item.description ?? ''}`.toLowerCase()
      return cleanTokens.some((token) => blob.includes(token))
    })
    if (category && workflows.length < 3) {
      for (const workflow of type.workflows.filter((item) => item.category === category.id)) {
        if (!workflows.some((item) => item.id === workflow.id)) workflows.push(workflow)
        if (workflows.length >= MAX_HINTS) break
      }
    }

    const hints = workflows.map((workflow) => describeWorkflow(workflow).slice(0, 1200))
    if (workflows.length < 3) {
      const categories = type.categories.map((item) => item.name).join(' · ')
      hints.push(
        `### TSTerm catalog categories for ${type.name}\n${categories}\nOnly use runbooks from ${type.name}; ask a clarifying question if the goal does not fit one of these categories.`.slice(
          0,
          1200
        )
      )
    }
    return hints
  } catch {
    return []
  }
}
