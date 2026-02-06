// Auth utilities - works in both Node.js and Edge runtime

const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || AUTH_PASSWORD + '_secret_key';

/**
 * Create HMAC signature using Web Crypto API (works in Edge)
 */
async function createSignature(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(AUTH_SECRET),
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

  // Verify signature
  const expectedSignature = await createSignature(timestamp + AUTH_PASSWORD);
  return signature === expectedSignature;
}

export function validatePassword(password: string): boolean {
  return AUTH_PASSWORD !== '' && password === AUTH_PASSWORD;
}
