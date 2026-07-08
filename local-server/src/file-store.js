import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import crypto from 'node:crypto'

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
}

export function createFileStore(dataDir) {
  const filesDir = resolve(dataDir, 'files')
  if (!existsSync(filesDir)) mkdirSync(filesDir, { recursive: true })

  function save(filename, buffer) {
    const ext = extname(filename).toLowerCase()
    const id = crypto.randomUUID()
    const storedName = `${id}${ext}`
    const filePath = join(filesDir, storedName)
    writeFileSync(filePath, buffer)
    return {
      id,
      filename,
      storedName,
      path: `/files/${storedName}`,
      size: buffer.length,
      mime: MIME_TYPES[ext] || 'application/octet-stream',
    }
  }

  function get(storedName) {
    const filePath = join(filesDir, storedName)
    if (!existsSync(filePath)) return null
    const ext = extname(storedName).toLowerCase()
    return {
      buffer: readFileSync(filePath),
      mime: MIME_TYPES[ext] || 'application/octet-stream',
    }
  }

  function list() {
    if (!existsSync(filesDir)) return []
    return []
  }

  return { save, get, list }
}
