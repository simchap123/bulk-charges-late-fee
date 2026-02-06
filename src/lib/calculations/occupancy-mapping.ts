import type { V0Tenant, V2TenantDirectoryRow, AgedReceivablesRow, ChargeRow } from '@/lib/types';
import { computeLateFee, getLateFeeParams, parseCurrencyOrNumber } from './late-fee';
import { toYMD, lastCommaFirstToFirstLast, lateFeeDescriptionFromYMD } from './helpers';

// Create key from property + unit for fallback matching
function keyFrom(prop: string, unit: string): string {
  return `${(prop || '').trim().toLowerCase()}||${(unit || '').trim().toLowerCase()}`;
}

interface OccupancyMaps {
  // V0 maps
  tenantIdToV0OccId: Map<string, string>;
  integrationIdToV0OccId: Map<string, string>;
  unitIdToV0OccId: Map<string, string>;
  // V2 maps
  occUidToCandidates: Map<string, Array<{ integ: string; status: string }>>;
  occUidByPropUnit: Map<string, string>;
  occIdToOccUid: Map<string, string>;
}

/**
 * Build occupancy maps from V0 tenants and V2 tenant directory.
 */
export function buildOccupancyMaps(
  v0Tenants: V0Tenant[],
  v2TenantDirectory: V2TenantDirectoryRow[]
): OccupancyMaps {
  const tenantIdToV0OccId = new Map<string, string>();
  const integrationIdToV0OccId = new Map<string, string>();
  const unitIdToV0OccId = new Map<string, string>();

  // Build V0 maps
  for (const t of v0Tenants) {
    const tid = String(t.Id ?? '').trim();
    const integId = String(t.IntegrationId || t.ExternalId || '').trim();
    const occ = String(t.OccupancyId ?? '').trim();
    const status = String(t.Status ?? '').toLowerCase();
    const unitId = String(t.UnitId ?? '').trim();

    if (tid && occ) {
      tenantIdToV0OccId.set(tid, occ);
    }
    if (integId && occ) {
      integrationIdToV0OccId.set(integId, occ);
    }
    // Only set unitId map for current/notice tenants and if not already set
    if (unitId && occ && ['current', 'notice'].includes(status) && !unitIdToV0OccId.has(unitId)) {
      unitIdToV0OccId.set(unitId, occ);
    }
  }

  // Build V2 maps
  const occUidToCandidates = new Map<string, Array<{ integ: string; status: string }>>();
  const occUidByPropUnit = new Map<string, string>();
  const occIdToOccUid = new Map<string, string>();

  for (const r of v2TenantDirectory) {
    const occUid = String(r.occupancy_import_uid ?? '').trim();
    const integ = String(r.tenant_integration_id ?? '').trim();
    const status = String(r.status ?? '').trim().toLowerCase();

    // Map occupancy_import_uid → [{ integ, status }, ...]
    if (occUid && integ) {
      const existing = occUidToCandidates.get(occUid) || [];
      existing.push({ integ, status });
      occUidToCandidates.set(occUid, existing);
    }

    // Build property+unit fallback
    const prop = r.property_name || r.property || '';
    const unit = r.unit || r.unit_name || '';
    if (occUid && (prop || unit)) {
      occUidByPropUnit.set(keyFrom(prop, unit), occUid);
    }

    // Map occupancy_id → occupancy_import_uid
    const occId = String(r.occupancy_id ?? '').trim();
    if (occId && occUid && !occIdToOccUid.has(occId)) {
      occIdToOccUid.set(occId, occUid);
    }
  }

  return {
    tenantIdToV0OccId,
    integrationIdToV0OccId,
    unitIdToV0OccId,
    occUidToCandidates,
    occUidByPropUnit,
    occIdToOccUid,
  };
}

/**
 * Pick the best integration ID from candidates (prefer current/notice status).
 */
function pickIntegrationId(candidates: Array<{ integ: string; status: string }>): string {
  if (!candidates || candidates.length === 0) return '';

  // Prefer current/notice status
  for (const c of candidates) {
    if (['current', 'notice'].includes(c.status)) {
      return c.integ.trim();
    }
  }

  // Fallback to first
  return candidates[0].integ.trim();
}

/**
 * Check if a date string (YYYY-MM-DD) is in the current month.
 */
function isCurrentMonth(dateIso: string): boolean {
  if (!dateIso) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const [year, month] = dateIso.split('-').map(Number);
  return year === currentYear && month - 1 === currentMonth;
}

/**
 * Transform aged receivables into charge rows with computed late fees.
 * Only includes charges from the current month.
 */
export function buildChargeRows(
  agedReceivables: AgedReceivablesRow[],
  maps: OccupancyMaps,
  glAccountNumber: string
): ChargeRow[] {
  const rows: ChargeRow[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const r of agedReceivables) {
    const occV2 = String(r.occIdV2 ?? '').trim();
    const pk = keyFrom(r.propName ?? '', r.unitName ?? '');

    // Resolve occupancy UID
    let occUid: string;
    if (maps.occUidToCandidates.has(occV2)) {
      occUid = occV2;
    } else {
      occUid = maps.occUidByPropUnit.get(pk) || maps.occIdToOccUid.get(occV2) || '';
    }

    // Get integration ID from candidates
    const candidates = maps.occUidToCandidates.get(occUid) || [];
    const integ = pickIntegrationId(candidates);

    // Resolve V0 occupancy ID
    const v0OccId =
      maps.tenantIdToV0OccId.get(integ) ||
      maps.integrationIdToV0OccId.get(integ) ||
      (r.v2UnitId ? maps.unitIdToV0OccId.get(String(r.v2UnitId)) : '') ||
      '';

    // Compute late fee
    const zClean = parseCurrencyOrNumber(r.zeroTo30);
    const tTotal = parseCurrencyOrNumber(r.totalAmount);
    const params = getLateFeeParams(r.v2PropId);
    let amount = computeLateFee(tTotal, zClean, params);
    if (amount < 0) amount = 0;

    // Parse dates
    const chargeRaw = String(r.chargeDateRaw ?? '').trim();
    const postRaw = String(r.postingDateRaw ?? '').trim();
    const chargeIso = toYMD(chargeRaw) || today;
    const postIso = toYMD(postRaw) || today;

    // Skip charges that are not from the current month
    if (!isCurrentMonth(chargeIso)) {
      continue;
    }

    rows.push({
      propertyName: r.propName ?? '',
      unitName: r.unitName ?? '',
      occupancyUid: occUid,
      tenantName: lastCommaFirstToFirstLast(r.payerName),
      occupancyId: occV2,
      amount: Math.round(amount * 100) / 100,
      chargeDate: chargeRaw,
      postingDate: postRaw,
      glAccountNumber,
      description: lateFeeDescriptionFromYMD(chargeIso),
      // Internal fields
      _chargeDateIso: chargeIso,
      _postingDateIso: postIso,
      _tenantIntegrationId: integ,
      _v0OccupancyId: v0OccId,
      _v2UnitId: r.v2UnitId ?? '',
      _v2PropertyId: r.v2PropId ?? '',
      _zeroTo30: zClean,
      _totalAmount: tTotal,
    });
  }

  return rows;
}

/**
 * Retry mapping for rows missing V0 occupancy ID with wider tenant data.
 */
export function retryMappingWithWideTenants(
  rows: ChargeRow[],
  v0TenantsAll: V0Tenant[]
): ChargeRow[] {
  // Rebuild V0 maps with all tenants
  const tenantIdToV0OccId = new Map<string, string>();
  const integrationIdToV0OccId = new Map<string, string>();
  const unitIdToV0OccId = new Map<string, string>();

  for (const t of v0TenantsAll) {
    const tid = String(t.Id ?? '').trim();
    const integId = String(t.IntegrationId || t.ExternalId || '').trim();
    const occ = String(t.OccupancyId ?? '').trim();
    const status = String(t.Status ?? '').toLowerCase();
    const unitId = String(t.UnitId ?? '').trim();

    if (tid && occ) {
      tenantIdToV0OccId.set(tid, occ);
    }
    if (integId && occ) {
      integrationIdToV0OccId.set(integId, occ);
    }
    if (unitId && occ && ['current', 'notice'].includes(status) && !unitIdToV0OccId.has(unitId)) {
      unitIdToV0OccId.set(unitId, occ);
    }
  }

  // Update rows that are missing V0 occupancy ID
  return rows.map(row => {
    if (row._v0OccupancyId) return row;

    const integ = row._tenantIntegrationId.trim();
    const v0OccId =
      tenantIdToV0OccId.get(integ) ||
      integrationIdToV0OccId.get(integ) ||
      (row._v2UnitId ? unitIdToV0OccId.get(String(row._v2UnitId)) : '') ||
      '';

    return { ...row, _v0OccupancyId: v0OccId };
  });
}
