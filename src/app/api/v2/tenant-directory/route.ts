import { NextRequest, NextResponse } from 'next/server';
import { getEnvMode, getV2Config, authBasic } from '@/lib/env-config';

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
    const auth = authBasic(v2Config.user, v2Config.pass);

    console.log(`[tenant-directory] Mode: ${mode}, Base: ${v2Config.base}`);

    // Try multiple body variations for compatibility
    const bodies = [
      // Primary body - filters only
      {
        tenant_visibility: 'active',
        tenant_statuses: ['0', '4', '3'],
        tenant_types: ['all'],
        property_visibility: 'active',
        properties: {
          properties_ids: v2Config.propertyIds,
        },
      },
      // With minimal columns
      {
        tenant_visibility: 'active',
        tenant_statuses: ['0', '4', '3'],
        tenant_types: ['all'],
        property_visibility: 'active',
        properties: {
          properties_ids: v2Config.propertyIds,
        },
        columns: ['property_name', 'unit', 'occupancy_import_uid', 'tenant_integration_id', 'status'],
      },
      // Alternative column names
      {
        tenant_visibility: 'active',
        tenant_statuses: ['0', '4', '3'],
        tenant_types: ['all'],
        property_visibility: 'active',
        properties: {
          properties_ids: v2Config.propertyIds,
        },
        columns: ['property_name', 'unit_name', 'occupancy_import_uid', 'tenant_integration_id', 'status'],
      },
    ];

    let lastError: Error | null = null;
    for (const body of bodies) {
      try {
        const rows = await v2CollectAll(v2Config.base, 'tenant_directory.json', body, auth);
        return NextResponse.json({ data: rows, count: rows.length, mode });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
    }

    throw lastError || new Error('All tenant directory requests failed');
  } catch (error) {
    console.error('Tenant directory error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
