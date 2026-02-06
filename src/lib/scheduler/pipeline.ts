// Server-side pipeline for autonomous late fee charge execution
// Replicates the full data loading → calculation → submission flow without UI

import { getV2Config, getV0Config, getGlConfig, authBasic, type EnvMode } from '@/lib/env-config';
import { buildOccupancyMaps, buildChargeRows, retryMappingWithWideTenants } from '@/lib/calculations/occupancy-mapping';
import type { AgedReceivablesRow, V2TenantDirectoryRow, V0Tenant } from '@/lib/types';

const TABLE_GL_ACCOUNT_NUMBER = process.env.NEXT_PUBLIC_TABLE_GL_ACCOUNT_NUMBER || '4815-000';

export interface PipelineResult {
  status: 'success' | 'error' | 'dry-run';
  totalRows: number;
  validRows: number;
  submittedRows: number;
  skippedRows: number;
  missingV0Count: number;
  totalAmount: number;
  duration: number;
  warnings: string[];
  error?: string;
  mode: EnvMode;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// V2 API helpers (POST with retry + pagination)
// ---------------------------------------------------------------------------

async function v2PostJson(
  url: string,
  body: object | null,
  auth: string,
  timeout = 60000
): Promise<unknown> {
  const payload = body ?? {};
  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: auth,
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
async function v2CollectAll(basePath: string, path: string, firstBody: object, auth: string): Promise<any[]> {
  const firstUrl = `${basePath}/${path.replace(/^\//, '')}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const js = (await v2PostJson(firstUrl, firstBody, auth)) as any;
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

  const absUrl = (u: string) => {
    if (!u.startsWith('http')) return new URL(u, getV2Origin()).href;
    // Validate origin matches expected host to prevent SSRF
    const parsed = new URL(u);
    const expected = new URL(basePath);
    if (parsed.host !== expected.host) throw new Error('Pagination URL host mismatch');
    return u;
  };

  while (nextUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageJs = (await v2PostJson(absUrl(nextUrl), null, auth)) as any;
    rows.push(...(pageJs.results || []));
    nextUrl = pageJs.next_page_url;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// V0 API helpers (GET with pagination + batch by property)
// ---------------------------------------------------------------------------

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function v0FetchAllPages(
  basePath: string,
  devId: string,
  auth: string,
  path: string,
  pageSize = 1000,
  baseQuery: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        Accept: 'application/json',
        Authorization: auth,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${path} failed: ${resp.status} ${text}`);
    }

    const json = await resp.json();
    const data = json.data || [];
    if (Array.isArray(data)) allData.push(...data);
    if (!data || data.length < pageSize) break;
    page++;
  }

  return allData;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function v0FetchTenantsBatched(
  basePath: string,
  devId: string,
  auth: string,
  propIds: string[],
  baseFilters: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const BATCH_SIZE = 20;
  const CONCURRENCY = 5;
  const batches = chunkArray(propIds, BATCH_SIZE);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allData: any[] = [];

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      group.map((batch) => {
        const query = { ...baseFilters, 'filters[PropertyId]': batch.join(',') };
        return v0FetchAllPages(basePath, devId, auth, 'tenants', 1000, query);
      })
    );
    for (const result of results) allData.push(...result);
  }

  // Deduplicate by Id
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return allData.filter((t: any) => {
    const id = String(t.Id || '');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Data fetching orchestration
// ---------------------------------------------------------------------------

async function fetchAgedReceivables(mode: EnvMode): Promise<AgedReceivablesRow[]> {
  const v2Config = getV2Config(mode);
  const glConfig = getGlConfig(mode);
  const auth = authBasic(v2Config.user, v2Config.pass);
  const asOfDate = new Date().toISOString().split('T')[0];

  const body = {
    occurred_on_to: asOfDate,
    property_visibility: 'active',
    tenant_statuses: ['0', '4', '3'],
    properties: { properties_ids: v2Config.propertyIds },
    columns: [
      'property_name', 'unit_name', 'payer_name', 'occupancy_id',
      '0_to30', 'total_amount', 'account_number',
      'unit_id', 'property_id', 'posting_date', 'invoice_occurred_on',
    ],
  };

  const allRows = await v2CollectAll(v2Config.base, 'aged_receivables_detail.json', body, auth);

  const filterGl = glConfig.filterGlAccount.trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = filterGl ? allRows.filter((r: any) => String(r.account_number ?? '').trim() === filterGl) : allRows;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return filtered.map((r: any) => ({
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
  }));
}

async function fetchTenantDirectory(mode: EnvMode): Promise<V2TenantDirectoryRow[]> {
  const v2Config = getV2Config(mode);
  const auth = authBasic(v2Config.user, v2Config.pass);

  const bodies = [
    {
      tenant_visibility: 'active',
      tenant_statuses: ['0', '4', '3'],
      tenant_types: ['all'],
      property_visibility: 'active',
      properties: { properties_ids: v2Config.propertyIds },
    },
    {
      tenant_visibility: 'active',
      tenant_statuses: ['0', '4', '3'],
      tenant_types: ['all'],
      property_visibility: 'active',
      properties: { properties_ids: v2Config.propertyIds },
      columns: ['property_name', 'unit', 'occupancy_import_uid', 'tenant_integration_id', 'status'],
    },
    {
      tenant_visibility: 'active',
      tenant_statuses: ['0', '4', '3'],
      tenant_types: ['all'],
      property_visibility: 'active',
      properties: { properties_ids: v2Config.propertyIds },
      columns: ['property_name', 'unit_name', 'occupancy_import_uid', 'tenant_integration_id', 'status'],
    },
  ];

  let lastError: Error | null = null;
  for (const body of bodies) {
    try {
      return await v2CollectAll(v2Config.base, 'tenant_directory.json', body, auth);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError || new Error('All tenant directory requests failed');
}

async function fetchV0Tenants(mode: EnvMode, wide = false): Promise<V0Tenant[]> {
  const v0Config = getV0Config(mode);
  const auth = authBasic(v0Config.clientId, v0Config.clientSecret);
  const lookback = wide ? 1825 : 365;

  const baseFilters: Record<string, string> = {
    'filters[Status]': 'Current,Notice,Evict',
    'filters[IncludeUnassigned]': 'false',
    'filters[LastUpdatedAtFrom]': isoDaysAgo(lookback),
  };

  return v0FetchTenantsBatched(v0Config.base, v0Config.devId, auth, v0Config.propertyIds, baseFilters);
}

async function submitBulkCharges(
  mode: EnvMode,
  rows: Array<{ amount: number; _v0OccupancyId: string; _chargeDateIso: string; description: string }>
): Promise<number> {
  const v0Config = getV0Config(mode);
  const glConfig = getGlConfig(mode);
  const auth = authBasic(v0Config.clientId, v0Config.clientSecret);

  const today = new Date().toISOString().split('T')[0];
  const data = rows
    .filter((r) => r._v0OccupancyId && r.amount > 0)
    .map((r) => ({
      AmountDue: r.amount.toFixed(2),
      ChargedOn: r._chargeDateIso || today,
      Description: r.description || `IL Custom Late Fee - ${r._chargeDateIso || today}`,
      GlAccountId: glConfig.bulkGlAccountId,
      OccupancyId: r._v0OccupancyId,
      ReferenceId: crypto.randomUUID(),
    }));

  if (data.length === 0) return 0;

  const url = `${v0Config.base}/charges/bulk`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'X-AppFolio-Developer-ID': v0Config.devId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify({ data }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Bulk create failed (${resp.status}): ${text}`);
  }

  return data.length;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runPipeline(mode: EnvMode, autoSubmit: boolean): Promise<PipelineResult> {
  const start = Date.now();
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();

  try {
    // Phase 1: Fetch aged receivables
    const aged = await fetchAgedReceivables(mode);

    if (aged.length === 0) {
      return {
        status: autoSubmit ? 'success' : 'dry-run',
        totalRows: 0, validRows: 0, submittedRows: 0, skippedRows: 0,
        missingV0Count: 0, totalAmount: 0,
        duration: Date.now() - start, warnings: ['No aged receivables found'], mode, timestamp,
      };
    }

    // Phase 2: Fetch tenant mapping (parallel)
    const [tenantDir, v0Tenants] = await Promise.all([
      fetchTenantDirectory(mode).catch((e) => {
        warnings.push(`Tenant directory: ${e instanceof Error ? e.message : 'failed'}`);
        return [] as V2TenantDirectoryRow[];
      }),
      fetchV0Tenants(mode).catch((e) => {
        warnings.push(`V0 tenants: ${e instanceof Error ? e.message : 'failed'}`);
        return [] as V0Tenant[];
      }),
    ]);

    // Phase 3: Build charge rows with late fee calculations
    const maps = buildOccupancyMaps(v0Tenants, tenantDir);
    let rows = buildChargeRows(aged, maps, TABLE_GL_ACCOUNT_NUMBER);

    // Phase 4: Retry mapping with wide tenants if needed
    const missingCount = rows.filter((r) => !r._v0OccupancyId).length;
    if (missingCount > 0 && missingCount < rows.length) {
      try {
        const wideTenants = await fetchV0Tenants(mode, true);
        rows = retryMappingWithWideTenants(rows, wideTenants);
      } catch {
        warnings.push('Wide tenant retry failed');
      }
    }

    // Phase 5: Identify valid rows
    const validRows = rows.filter((r) => r._v0OccupancyId && r.amount > 0);
    const finalMissingCount = rows.filter((r) => !r._v0OccupancyId).length;
    const totalAmount = Math.round(validRows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    if (finalMissingCount > 0) {
      warnings.push(`${finalMissingCount} rows missing V0 occupancy ID`);
    }

    // Phase 6: Submit or dry-run
    if (!autoSubmit) {
      return {
        status: 'dry-run', totalRows: rows.length, validRows: validRows.length,
        submittedRows: 0, skippedRows: rows.length - validRows.length,
        missingV0Count: finalMissingCount, totalAmount,
        duration: Date.now() - start, warnings, mode, timestamp,
      };
    }

    if (validRows.length === 0) {
      return {
        status: 'success', totalRows: rows.length, validRows: 0,
        submittedRows: 0, skippedRows: rows.length,
        missingV0Count: finalMissingCount, totalAmount: 0,
        duration: Date.now() - start, warnings: [...warnings, 'No valid rows to submit'], mode, timestamp,
      };
    }

    const submittedCount = await submitBulkCharges(mode, validRows);

    return {
      status: 'success', totalRows: rows.length, validRows: validRows.length,
      submittedRows: submittedCount, skippedRows: rows.length - validRows.length,
      missingV0Count: finalMissingCount, totalAmount,
      duration: Date.now() - start, warnings, mode, timestamp,
    };
  } catch (error) {
    return {
      status: 'error', totalRows: 0, validRows: 0,
      submittedRows: 0, skippedRows: 0, missingV0Count: 0, totalAmount: 0,
      duration: Date.now() - start, warnings,
      error: error instanceof Error ? error.message : 'Unknown error',
      mode, timestamp,
    };
  }
}
