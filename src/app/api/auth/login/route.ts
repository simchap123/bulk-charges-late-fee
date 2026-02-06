import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, validatePassword } from '@/lib/auth';

const AUTH_COOKIE = 'bcb_session';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!validatePassword(password)) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    const token = await createSessionToken();
    const response = NextResponse.json({ success: true });

    // Set session cookie with signed token
    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
