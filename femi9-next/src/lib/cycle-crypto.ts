import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function key(): Buffer {
  const raw = process.env.CYCLE_DATA_ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('CYCLE_DATA_ENCRYPTION_KEY is not set')
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length !== 32) {
    throw new Error('CYCLE_DATA_ENCRYPTION_KEY must be exactly 32 base64-encoded bytes')
  }
  return decoded
}

/**
 * AES-256-GCM provides confidentiality and integrity. Every row gets a fresh
 * 96-bit IV; the auth tag rejects ciphertext modification before JSON parsing.
 */
export function encryptCyclePayload(payload: Record<string, unknown>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(VERSION))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptCyclePayload(value: string): Record<string, unknown> {
  const [version, ivPart, tagPart, ciphertextPart] = value.split('.')
  if (version !== VERSION || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Unsupported encrypted cycle payload')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivPart, 'base64url'))
  decipher.setAAD(Buffer.from(VERSION))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ])
  const parsed = JSON.parse(plaintext.toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid encrypted cycle payload')
  }
  return parsed as Record<string, unknown>
}
