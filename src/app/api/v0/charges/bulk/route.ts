import { NextRequest, NextResponse } from 'next/server';
import { getEnvMode, getV0Config, getGlConfig, authBasic } from '@/lib/env-config';

interface BulkChargeItem {
  AmountDue: string;
  ChargedOn: string;
  Description: string;
  GlAccountId: string;
  OccupancyId: string;
  ReferenceId: string;
}

export async function POST(request: NextRequest) {
  try {
    const mode = getEnvMode(request);
    const v0Config = getV0Config(mode);
    const glConfig = getGlConfig(mode);
    const auth = authBasic(v0Config.clientId, v0Config.clientSecret);

    console.log(`[bulk-charges] Mode: ${mode}`);

    const body = await request.json();
    const rows = body.rows as Array<{
      amount: number;
      _v0OccupancyId: string;
      _chargeDateIso: string;
      description: string;
    }>;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows provided' },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const data: BulkChargeItem[] = [];

    for (const r of rows) {
      const occId = String(r._v0OccupancyId || '').trim();
      const amount = r.amount || 0;
      const chargedOn = r._chargeDateIso || today;
      const desc = r.description || `IL Custom Late Fee - ${chargedOn}`;

      if (!occId || amount <= 0) {
        continue;
      }

      data.push({
        AmountDue: amount.toFixed(2),
        ChargedOn: chargedOn,
        Description: desc,
        GlAccountId: glConfig.bulkGlAccountId,
        OccupancyId: occId,
        ReferenceId: crypto.randomUUID(),
      });
    }

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to send. Check OccupancyId and Amount.' },
        { status: 400 }
      );
    }

    const url = `${v0Config.base}/charges/bulk`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'X-AppFolio-Developer-ID': v0Config.devId,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': auth,
      },
      body: JSON.stringify({ data }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Bulk create failed: ${text}` },
        { status: resp.status }
      );
    }

    const result = await resp.json();
    return NextResponse.json({ ...result, mode });
  } catch (error) {
    console.error('Bulk charges error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
