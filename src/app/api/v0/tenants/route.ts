import { NextRequest, NextResponse } from 'next/server';
import { getEnvMode, getV0Config, authBasic } from '@/lib/env-config';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// Fetch all pages for a single query
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchV0AllPages(
  basePath: string,
  devId: string,
  auth: string,
  path: string,
  pageSize = 1000,
  baseQuery: Record<string, string> = {}
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allData: any[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      ...baseQuery,
      'page[number]': String(page),
      'page[size]': String(pageSize),
    });

    const url = `${basePath}/${path}?${params.toString()}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-AppFolio-Developer-ID': devId,
        'Accept': 'application/json',
        'Authorization': auth,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${path} failed: ${resp.status} ${text}`);
    }

    const json = await resp.json();
    const data = json.data || [];

    if (Array.isArray(data)) {
      allData.push(...data);
    }

    if (!data || data.length < pageSize) {
      break;
    }

    page++;
  }

  return allData;
}

// Split array into chunks
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Fetch tenants in batches by PropertyId to avoid 414 error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTenantsByPropertyBatches(
  basePath: string,
  devId: string,
  auth: string,
  propIds: string[],
  baseFilters: Record<string, string>
): Promise<any[]> {
  const BATCH_SIZE = 20; // 20 UUIDs per batch keeps URL short
  const batches = chunkArray(propIds, BATCH_SIZE);

  console.log(`Fetching tenants in ${batches.length} batches of ${BATCH_SIZE} properties each...`);

  // Run batches in parallel (max 5 concurrent to avoid rate limiting)
  const CONCURRENCY = 5;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allData: any[] = [];

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const batchGroup = batches.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batchGroup.map(async (batch) => {
        const query = {
          ...baseFilters,
          'filters[PropertyId]': batch.join(','),
        };
        return fetchV0AllPages(basePath, devId, auth, 'tenants', 1000, query);
      })
    );

    for (const result of results) {
      allData.push(...result);
    }
  }

  return allData;
}

export async function GET(request: NextRequest) {
  try {
    const mode = getEnvMode(request);
    const v0Config = getV0Config(mode);
    const auth = authBasic(v0Config.clientId, v0Config.clientSecret);

    console.log(`[v0-tenants] Mode: ${mode}, Base: ${v0Config.base}`);

    const searchParams = request.nextUrl.searchParams;
    const wide = searchParams.get('wide') === 'true';

    const propIds = v0Config.propertyIds;

    if (propIds.length === 0) {
      return NextResponse.json({
        error: 'No V0_PROPERTY_IDS configured in environment',
        data: [],
        count: 0,
        mode,
      });
    }

    // AppFolio requires LastUpdatedAtFrom filter
    // Default: 1 year (365 days) - gets most current tenants
    // Wide mode: 5 years (1825 days) - for complete mapping coverage
    const effectiveLookback = wide ? 1825 : 365;

    const baseFilters: Record<string, string> = {
      'filters[Status]': 'Current,Notice,Evict',
      'filters[IncludeUnassigned]': 'false',
      'filters[LastUpdatedAtFrom]': isoDaysAgo(effectiveLookback),
    };

    // Batch the property IDs to avoid 414 URI Too Large error
    const data = await fetchTenantsByPropertyBatches(
      v0Config.base,
      v0Config.devId,
      auth,
      propIds,
      baseFilters
    );

    // Deduplicate by tenant Id (in case of overlap)
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniqueData = data.filter((t: any) => {
      const id = String(t.Id || '');
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return NextResponse.json({ data: uniqueData, count: uniqueData.length, mode });
  } catch (error) {
    console.error('V0 tenants error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
