// Auth utilities - works in both Node.js and Edge runtime

const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || '';

/**
 * Derive the HMAC key material.
 * Prefers AUTH_SECRET env var; falls back to AUTH_PASSWORD-derived key.
 */
function getSecretKey(): string {
  return AUTH_SECRET || (AUTH_PASSWORD + '_bulk_charges_hmac');
}

/**
 * Constant-time comparison of two strings.
 * Hashes both inputs via SHA-256 to normalize length, then XOR-compares.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const arrA = new Uint8Array(hashA);
  const arrB = new Uint8Array(hashB);
  let result = 0;
  for (let i = 0; i < arrA.length; i++) {
    result |= arrA[i] ^ arrB[i];
  }
  return result === 0;
}

/**
 * Create HMAC signature using Web Crypto API (works in Edge)
 */
async function createSignature(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a signed session token
 * Format: timestamp.signature
 */
export async function createSessionToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const signature = await createSignature(timestamp + AUTH_PASSWORD);
  return `${timestamp}.${signature}`;
}

/**
 * Verify a session token
 * Returns true if valid and not expired (30 days)
 */
export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token || !AUTH_PASSWORD) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // Check expiry (30 days)
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - ts > maxAge) return false;

  // Verify signature (timing-safe)
  const expectedSignature = await createSignature(timestamp + AUTH_PASSWORD);
  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Validate password using timing-safe comparison.
 */
export async function validatePassword(password: string): Promise<boolean> {
  if (AUTH_PASSWORD === '' || !password) return false;
  return timingSafeEqual(password, AUTH_PASSWORD);
}
