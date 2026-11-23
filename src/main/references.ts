import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type {
  AiReferenceDoc,
  AiReferenceMatch,
  AiReferenceSearchRequest,
  AiReferenceSearchResult
} from '@shared/types'

const MAX_FILE_BYTES = 40 * 1024 * 1024
const MAX_TEXT_CHARS = 12_000_000
const MAX_PDF_PAGES = 2000
const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 180
const MAX_SEARCH_CHARS = 6000
const SUPPORTED = new Set(['.txt', '.md', '.markdown', '.log', '.json', '.csv', '.html', '.htm', '.pdf'])

interface StoredDoc extends AiReferenceDoc {
  hash: string
}

interface ReferenceIndex {
  version: 1
  docs: StoredDoc[]
}

interface CachedDoc {
  text: string
  chunks: string[]
  mtimeMs: number
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'what', 'which', 'how',
  'why', 'is', 'are', 'can', 'should', 'would', 'do', 'does', 'my', 'this', 'that', 'it', 'me',
  'please', 'device', 'command', 'commands', 'about', 'from', 'into', 'when', 'where'
])

function publicDoc(doc: StoredDoc): AiReferenceDoc {
  return {
    id: doc.id,
    name: doc.name,
    fileName: doc.fileName,
    deviceTypeId: doc.deviceTypeId,
    chars: doc.chars,
    chunks: doc.chunks,
    addedAt: doc.addedAt
  }
}

function normalizeText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function htmlToText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|pre|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function chunkText(input: string): string[] {
  const chunks: string[] = []
  let current = ''
  const flush = (): void => {
    const value = current.trim()
    if (value) chunks.push(value)
    current = ''
  }

  for (const rawPart of input.split(/\n{2,}/)) {
    const part = rawPart.trim()
    if (!part) continue
    if (part.length > CHUNK_SIZE) {
      flush()
      for (let start = 0; start < part.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(part.slice(start, start + CHUNK_SIZE).trim())
      }
      continue
    }
    if (current && current.length + part.length + 2 > CHUNK_SIZE) {
      const overlap = current.slice(-CHUNK_OVERLAP)
      flush()
      current = `${overlap}\n\n${part}`
    } else {
      current = current ? `${current}\n\n${part}` : part
    }
  }
  flush()
  return chunks
}

function queryTokens(query: string): string[] {
  const tokens = (query.toLowerCase().match(/[a-z0-9][a-z0-9_.:-]*/g) ?? [])
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
  return [...new Set(tokens)].slice(0, 20)
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = 0
  while (count < 8) {
    const found = haystack.indexOf(needle, index)
    if (found < 0) break
    count += 1
    index = found + needle.length
  }
  return count
}

export class ReferenceService {
  private readonly root: string
  private readonly docsDir: string
  private readonly indexPath: string
  private index: ReferenceIndex = { version: 1, docs: [] }
  private cache = new Map<string, CachedDoc>()
  private warnings: string[] = []

  constructor(baseDir: string) {
    this.root = path.join(baseDir, 'references')
    this.docsDir = path.join(this.root, 'docs')
    this.indexPath = path.join(this.root, 'index.json')
    fs.mkdirSync(this.docsDir, { recursive: true })
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as ReferenceIndex
        if (parsed && parsed.version === 1 && Array.isArray(parsed.docs)) {
          this.index = { version: 1, docs: parsed.docs.filter((doc) => doc && typeof doc.id === 'string') }
        }
      }
    } catch (error) {
      this.warnings.push(`Could not read the reference library index: ${(error as Error).message}`)
    }
    const valid = []
    for (const doc of this.index.docs) {
      if (!fs.existsSync(this.docFile(doc.id))) continue
      valid.push(doc)
    }
    if (valid.length !== this.index.docs.length) {
      this.index.docs = valid
      this.writeIndex()
    }
  }

  getWarnings(): string[] {
    return [...this.warnings]
  }

  private docFile(id: string): string {
    return path.join(this.docsDir, `${id}.txt`)
  }

  private writeIndex(): void {
    const tmp = `${this.indexPath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.index, null, 2), 'utf8')
    fs.renameSync(tmp, this.indexPath)
  }

  list(): AiReferenceDoc[] {
    return this.index.docs.map(publicDoc)
  }

  getFolder(): string {
    return this.root
  }

  async import(
    filePath: string,
    deviceTypeId?: string
  ): Promise<{ docs: AiReferenceDoc[]; error?: string }> {
    try {
      const extension = path.extname(filePath).toLowerCase()
      if (!SUPPORTED.has(extension)) {
        return {
          docs: this.list(),
          error: `Unsupported document type ${extension || '(none)'}. Use PDF, HTML, Markdown, text, JSON, or CSV.`
        }
      }
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return { docs: this.list(), error: 'That path is not a file.' }
      if (stat.size > MAX_FILE_BYTES) {
        return { docs: this.list(), error: 'The document is larger than the 40 MB import limit.' }
      }

      const buffer = fs.readFileSync(filePath)
      const hash = createHash('sha256').update(buffer).digest('hex')
      if (this.index.docs.some((doc) => doc.hash === hash)) {
        return { docs: this.list(), error: 'That document is already in the reference library.' }
      }

      let text: string
      if (extension === '.pdf') {
        text = await this.extractPdf(buffer)
      } else if (extension === '.html' || extension === '.htm') {
        text = htmlToText(buffer.toString('utf8'))
      } else {
        text = buffer.toString('utf8')
      }
      text = normalizeText(text)
      if (text.trim().length < 20) {
        return {
          docs: this.list(),
          error: 'No extractable text was found. Scanned PDFs need OCR before importing.'
        }
      }
      text = text.slice(0, MAX_TEXT_CHARS)
      const chunks = chunkText(text)
      if (!chunks.length) {
        return { docs: this.list(), error: 'The document contains no usable text.' }
      }

      const id = randomUUID()
      fs.writeFileSync(this.docFile(id), text, 'utf8')
      const baseName = path.basename(filePath, extension).replace(/[_-]+/g, ' ').trim()
      const doc: StoredDoc = {
        id,
        name: (baseName || 'Reference document').slice(0, 120),
        fileName: path.basename(filePath).slice(0, 180),
        deviceTypeId: deviceTypeId?.trim().slice(0, 100) || undefined,
        chars: text.length,
        chunks: chunks.length,
        addedAt: new Date().toISOString(),
        hash
      }
      this.index.docs.push(doc)
      this.cache.delete(id)
      this.writeIndex()
      return { docs: this.list() }
    } catch (error) {
      return { docs: this.list(), error: (error as Error).message }
    }
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const info = await parser.getInfo()
      if (info.total > MAX_PDF_PAGES) {
        throw new Error(`The PDF has ${info.total} pages; the limit is ${MAX_PDF_PAGES}. Split it first.`)
      }
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy().catch(() => {})
    }
  }

  remove(id: string): AiReferenceDoc[] {
    const doc = this.index.docs.find((item) => item.id === id)
    if (!doc) return this.list()
    try {
      fs.unlinkSync(this.docFile(id))
    } catch {
      // already gone
    }
    this.index.docs = this.index.docs.filter((item) => item.id !== id)
    this.cache.delete(id)
    this.writeIndex()
    return this.list()
  }

  private loadDocChunks(doc: StoredDoc): string[] {
    const file = this.docFile(doc.id)
    const stat = fs.statSync(file)
    const cached = this.cache.get(doc.id)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.chunks
    const text = fs.readFileSync(file, 'utf8')
    const chunks = chunkText(text)
    this.cache.set(doc.id, { text, chunks, mtimeMs: stat.mtimeMs })
    return chunks
  }

  search(request: AiReferenceSearchRequest): AiReferenceSearchResult {
    try {
      const tokens = queryTokens(String(request.query ?? ''))
      if (!tokens.length) return { ok: true, matches: [] }
      const limit = Math.min(12, Math.max(1, Math.round(Number(request.limit) || 6)))
      const phrase = String(request.query ?? '').trim().toLowerCase()
      const matches: AiReferenceMatch[] = []

      for (const doc of this.index.docs) {
        if (
          request.deviceTypeId &&
          doc.deviceTypeId &&
          doc.deviceTypeId !== request.deviceTypeId
        ) {
          continue
        }
        let chunks: string[]
        try {
          chunks = this.loadDocChunks(doc)
        } catch {
          continue
        }
        for (const chunk of chunks) {
          const lower = chunk.toLowerCase()
          let score = 0
          for (const token of tokens) {
            const occurrences = countOccurrences(lower, token)
            if (occurrences) score += occurrences * (1 + Math.min(token.length, 12) / 12)
          }
          if (score === 0) continue
          if (phrase.length > 8 && lower.includes(phrase)) score += 10
          score /= Math.sqrt(Math.max(1, chunk.length / 1000))
          matches.push({
            docId: doc.id,
            docName: doc.name,
            excerpt: chunk.slice(0, 1200),
            score
          })
        }
      }

      matches.sort((a, b) => b.score - a.score)
      const selected: AiReferenceMatch[] = []
      let total = 0
      for (const match of matches) {
        if (selected.length >= limit) break
        if (total + match.excerpt.length > MAX_SEARCH_CHARS) break
        selected.push(match)
        total += match.excerpt.length
      }
      return { ok: true, matches: selected }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }
}
