import { NextRequest, NextResponse } from 'next/server';
import { getEnvMode, getV2Config, getGlConfig, authBasic } from '@/lib/env-config';

function todayYMD(): string {
  return new Date().toISOString().split('T')[0];
}

async function v2PostJson(
  url: string,
  body: object | null,
  auth: string,
  timeout = 60000
): Promise<unknown> {
  const payload = body ?? {};
  const headers: HeadersInit = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': auth,
  };

  let backoff = 500;
  for (let attempt = 0; attempt < 6; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if ([429, 500, 502, 503, 504].includes(resp.status) && attempt < 5) {
        await new Promise(r => setTimeout(r, backoff));
        backoff *= 2;
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }

      return await resp.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt === 5) throw err;
      await new Promise(r => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
  throw new Error('Unreachable');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function v2CollectAll(
  basePath: string,
  path: string,
  firstBody: object,
  auth: string
): Promise<any[]> {
  const firstUrl = `${basePath}/${path.replace(/^\//, '')}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const js = await v2PostJson(firstUrl, firstBody, auth) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  if (Array.isArray(js)) {
    rows.push(...js);
  } else {
    rows.push(...(js.results || []));
  }

  let nextUrl = Array.isArray(js) ? null : js.next_page_url;

  const getV2Origin = () => {
    const url = new URL(basePath);
    return `${url.protocol}//${url.host}`;
  };

  const absUrl = (u: string) => u.startsWith('http') ? u : new URL(u, getV2Origin()).href;

  while (nextUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageJs = await v2PostJson(absUrl(nextUrl), null, auth) as any;
    rows.push(...(pageJs.results || []));
    nextUrl = pageJs.next_page_url;
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const mode = getEnvMode(request);
    const v2Config = getV2Config(mode);
    const glConfig = getGlConfig(mode);
    const auth = authBasic(v2Config.user, v2Config.pass);

    console.log(`[aged-receivables] Mode: ${mode}, Base: ${v2Config.base}`);

    const asOfDate = todayYMD();
    const columns = [
      'property_name', 'unit_name', 'payer_name', 'occupancy_id',
      '0_to30', 'total_amount', 'account_number',
      'unit_id', 'property_id', 'posting_date', 'invoice_occurred_on'
    ];

    const body = {
      occurred_on_to: asOfDate,
      property_visibility: 'active',
      tenant_statuses: ['0', '4', '3'],
      properties: {
        properties_ids: v2Config.propertyIds,
      },
      columns,
    };

    const allRows = await v2CollectAll(v2Config.base, 'aged_receivables_detail.json', body, auth);

    // Filter by GL account
    const filterGl = glConfig.filterGlAccount.trim();
    const filtered = filterGl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? allRows.filter((r: any) => String(r.account_number ?? '').trim() === filterGl)
      : allRows;

    // Transform to simplified format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = filtered.map((r: any) => ({
      propName: r.property_name ?? '',
      unitName: r.unit_name ?? '',
      payerName: r.payer_name ?? '',
      occIdV2: r.occupancy_id ?? '',
      zeroTo30: r['0_to30'] ?? 0,
      totalAmount: r.total_amount ?? 0,
      v2UnitId: r.unit_id ?? '',
      v2PropId: r.property_id ?? '',
      postingDateRaw: r.posting_date ?? '',
      chargeDateRaw: r.invoice_occurred_on ?? '',
      _account_number: r.account_number ?? '',
    }));

    return NextResponse.json({ data: result, count: result.length, mode });
  } catch (error) {
    console.error('Aged receivables error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
