import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'bcb_session';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const AUTH_SECRET = AUTH_PASSWORD + '_secret_key';

// Simple HMAC for Edge runtime
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

async function verifyToken(token: string): Promise<boolean> {
  if (!token || !AUTH_PASSWORD) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // Check expiry (30 days)
  if (Date.now() - ts > 30 * 24 * 60 * 60 * 1000) return false;

  // Verify signature
  const expected = await createSignature(timestamp + AUTH_PASSWORD);
  return signature === expected;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip auth for login page and auth API routes
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Check session cookie
  const sessionCookie = request.cookies.get(AUTH_COOKIE);
  const isValid = sessionCookie ? await verifyToken(sessionCookie.value) : false;

  if (!isValid) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For pages, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
