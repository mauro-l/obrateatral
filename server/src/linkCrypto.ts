import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Reversible encryption for studio links at rest.
 *
 * This is NOT password hashing: the server must recover the plaintext to play
 * and copy the link. AES-256-GCM gives confidentiality + integrity. The key
 * lives in the server environment (`LINK_KEY`), never in the database, so a
 * database-only leak (dump/backup) cannot be read.
 */
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

function rawKey(): string | null {
  const value = process.env.LINK_KEY?.trim();
  return value ? value : null;
}

/** A 32-byte key derived from LINK_KEY. 64 hex chars are used verbatim; any
 *  other strong secret (e.g. Render's generated value) is hashed to 32 bytes. */
function key(): Buffer {
  const raw = rawKey();
  if (!raw) throw new Error('LINK_KEY is not set (see .env.example)');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function isLinkEncryptionConfigured(): boolean {
  return rawKey() !== null;
}

export function encryptLink(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/** Returns null when the payload is malformed, tampered with, or the key changed. */
export function decryptLink(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, ciphertextB64] = payload.split('.');
    if (version !== VERSION || !ivB64 || !tagB64 || !ciphertextB64) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);

    return plain.toString('utf8');
  } catch {
    return null;
  }
}
