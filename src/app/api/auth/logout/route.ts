import { NextResponse } from 'next/server';

const AUTH_COOKIE = 'bcb_session';

export async function POST() {
  const response = NextResponse.json({ success: true });

  // Clear session cookie
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  return response;
}
