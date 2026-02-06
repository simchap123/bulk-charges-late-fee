import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { runPipeline } from '@/lib/scheduler/pipeline';
import type { EnvMode } from '@/lib/env-config';

// GET = Vercel Cron trigger (authenticated via CRON_SECRET)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enabled = process.env.SCHEDULER_ENABLED !== 'false';
  if (!enabled) {
    return NextResponse.json({ status: 'skipped', message: 'Scheduler is disabled via SCHEDULER_ENABLED env var' });
  }

  const mode = (process.env.SCHEDULER_ENV_MODE || 'live') as EnvMode;
  const autoSubmit = process.env.SCHEDULER_AUTO_SUBMIT === 'true';

  console.log(`[scheduler] Cron triggered. Mode: ${mode}, AutoSubmit: ${autoSubmit}`);
  const result = await runPipeline(mode, autoSubmit);
  console.log(`[scheduler] Cron complete. Status: ${result.status}, Submitted: ${result.submittedRows}, Amount: $${result.totalAmount}`);

  return NextResponse.json(result);
}

// POST = Manual trigger from Scheduler UI (authenticated via session cookie)
export async function POST(request: NextRequest) {
  // Verify session cookie (middleware skips this route, so we check manually)
  const sessionCookie = request.cookies.get('bcb_session');
  const isValid = sessionCookie ? await verifySessionToken(sessionCookie.value) : false;

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { mode?: string; autoSubmit?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // Default values used below
  }

  const mode = (body.mode === 'test' ? 'test' : 'live') as EnvMode;
  const autoSubmit = body.autoSubmit === true;

  console.log(`[scheduler] Manual trigger. Mode: ${mode}, AutoSubmit: ${autoSubmit}`);
  const result = await runPipeline(mode, autoSubmit);
  console.log(`[scheduler] Manual run complete. Status: ${result.status}, Submitted: ${result.submittedRows}, Amount: $${result.totalAmount}`);

  return NextResponse.json(result);
}
