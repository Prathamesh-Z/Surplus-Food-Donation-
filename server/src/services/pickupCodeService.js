import crypto from 'node:crypto';
import { config } from '../lib/config.js';

// PRD FR-11 — pickup codes.
// Format: 8 characters from an unambiguous alphabet (no 0/O/1/I).
// Storage: the code itself is NEVER stored in plaintext.
//   - pickupCodeHash + pickupCodeSalt: salted SHA-256, used for verification.
//   - pickupCodeEncrypted (+iv+authTag): AES-256-GCM copy that ONLY the
//     claim owner can re-view while the claim is active; deleted at terminal
//     state.
//   - pickupCodeHmac: HMAC-SHA-256 under a server-side pepper, UNIQUE in the
//     database — this is how uniqueness of active codes is enforced without
//     storing the code. Cleared (null) at terminal state.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function saltedHash(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
  return { salt, hash };
}

export function verifySaltedHash(code, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function codeHmac(code) {
  return crypto.createHmac('sha256', config.pickupPepper).update(code).digest('hex');
}

function encKey() {
  const key = Buffer.from(config.pickupEncKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('PICKUP_CODE_ENC_KEY must be 32 bytes (64 hex characters)');
  }
  return key;
}

export function encryptCode(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return {
    encrypted: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptCode({ pickupCodeEncrypted, pickupCodeIv, pickupCodeAuthTag }) {
  if (!pickupCodeEncrypted || !pickupCodeIv || !pickupCodeAuthTag) return null;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encKey(),
    Buffer.from(pickupCodeIv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(pickupCodeAuthTag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(pickupCodeEncrypted, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

// Build the full set of stored fields for a freshly generated code.
export function codeStorageFields(code) {
  const { salt, hash } = saltedHash(code);
  const enc = encryptCode(code);
  return {
    pickupCodeHash: hash,
    pickupCodeSalt: salt,
    pickupCodeEncrypted: enc.encrypted,
    pickupCodeIv: enc.iv,
    pickupCodeAuthTag: enc.authTag,
    pickupCodeHmac: codeHmac(code),
  };
}
