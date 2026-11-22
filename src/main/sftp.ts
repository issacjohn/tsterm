import path from 'node:path'
import { dialog } from 'electron'
import type { SFTPWrapper, Stats } from 'ssh2'
import type { SftpActionResult, SftpEntry, SftpListResult } from '@shared/types'
import type { SessionManager } from './sessions'

function sftpFor(session: SessionManager, terminalId: string): Promise<SFTPWrapper> {
  const client = session.getClient(terminalId)
  if (!client) throw new Error('SFTP is available on live SSH sessions only.')
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) reject(error)
      else resolve(sftp)
    })
  })
}

function entryType(attrs: Stats): SftpEntry['type'] {
  if (attrs.isDirectory()) return 'directory'
  if (attrs.isSymbolicLink()) return 'symlink'
  if (attrs.isFile()) return 'file'
  return 'other'
}

function normalizeRemote(input: string): string {
  const value = (input || '.').replace(/\\/g, '/')
  return path.posix.normalize(value.startsWith('/') ? value : `/${value}`)
}

export class SftpService {
  constructor(private readonly terminals: SessionManager) {}

  async list(terminalId: string, remotePath: string): Promise<SftpListResult> {
    const sftp = await sftpFor(this.terminals, terminalId)
    try {
      const resolved = await new Promise<string>((resolve, reject) => {
        if (remotePath && remotePath !== '.') {
          resolve(normalizeRemote(remotePath))
          return
        }
        sftp.realpath('.', (error, value) => {
          if (error) reject(error)
          else resolve(value)
        })
      })
      const entries = await new Promise<SftpEntry[]>((resolve, reject) => {
        sftp.readdir(resolved, (error, list) => {
          if (error) {
            reject(error)
            return
          }
          const mapped = list
            .filter((item) => item.filename !== '.' && item.filename !== '..')
            .map((item) => ({
              name: item.filename,
              path: path.posix.join(resolved, item.filename),
              type: entryType(item.attrs),
              size: item.attrs.size,
              modified: item.attrs.mtime ? item.attrs.mtime * 1000 : undefined,
              mode: item.attrs.mode
            }))
          mapped.sort((a, b) => {
            const aDir = a.type === 'directory' ? 0 : 1
            const bDir = b.type === 'directory' ? 0 : 1
            return aDir - bDir || a.name.localeCompare(b.name)
          })
          resolve(mapped)
        })
      })
      return { path: resolved, entries }
    } finally {
      sftp.end()
    }
  }

  async upload(terminalId: string, remoteDir: string): Promise<SftpActionResult> {
    const result = await dialog.showOpenDialog({
      title: 'Upload files',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, message: 'Upload cancelled.' }
    const sftp = await sftpFor(this.terminals, terminalId)
    let uploaded = 0
    try {
      for (const localPath of result.filePaths) {
        const target = path.posix.join(normalizeRemote(remoteDir), path.basename(localPath))
        await new Promise<void>((resolve, reject) => {
          sftp.fastPut(localPath, target, (error) => (error ? reject(error) : resolve()))
        })
        uploaded += 1
      }
      return {
        ok: true,
        path: remoteDir,
        message: `Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}.`
      }
    } finally {
      sftp.end()
    }
  }

  async download(terminalId: string, remotePath: string): Promise<SftpActionResult> {
    const result = await dialog.showSaveDialog({
      title: 'Download file',
      defaultPath: path.basename(remotePath)
    })
    if (result.canceled || !result.filePath) return { ok: false, message: 'Download cancelled.' }
    const sftp = await sftpFor(this.terminals, terminalId)
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(remotePath, result.filePath!, (error) => (error ? reject(error) : resolve()))
      })
      return { ok: true, path: result.filePath, message: 'Download complete.' }
    } finally {
      sftp.end()
    }
  }

  async mkdir(terminalId: string, remotePath: string): Promise<void> {
    const sftp = await sftpFor(this.terminals, terminalId)
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.mkdir(normalizeRemote(remotePath), (error) => (error ? reject(error) : resolve()))
      })
    } finally {
      sftp.end()
    }
  }

  async rename(terminalId: string, from: string, to: string): Promise<void> {
    const sftp = await sftpFor(this.terminals, terminalId)
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.rename(normalizeRemote(from), normalizeRemote(to), (error) => (error ? reject(error) : resolve()))
      })
    } finally {
      sftp.end()
    }
  }

  async remove(terminalId: string, remotePath: string, isDirectory: boolean): Promise<void> {
    const sftp = await sftpFor(this.terminals, terminalId)
    try {
      await new Promise<void>((resolve, reject) => {
        const callback = (error?: Error | null): void => (error ? reject(error) : resolve())
        if (isDirectory) sftp.rmdir(normalizeRemote(remotePath), callback)
        else sftp.unlink(normalizeRemote(remotePath), callback)
      })
    } finally {
      sftp.end()
    }
  }
}
