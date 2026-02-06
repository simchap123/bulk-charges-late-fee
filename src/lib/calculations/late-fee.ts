import {
  PROPERTY_GROUP_A,
  PROPERTY_GROUP_B,
  DEFAULT_LATE_FEE_THRESHOLD,
  DEFAULT_LATE_FEE_PERCENT,
  DEFAULT_LATE_FEE_BASE
} from '@/lib/appfolio/constants';

const ZERO_EPS = 1e-6;

export interface LateFeeParams {
  threshold: number;
  percent: number;
  base: number;
}

/**
 * Get late fee parameters for a given property ID.
 * Group A (Cook County): threshold = $1000
 * Group B (Chicago): threshold = $500
 */
export function getLateFeeParams(propId: string | number | null | undefined): LateFeeParams {
  const pid = String(propId ?? '').trim();

  if (PROPERTY_GROUP_A.has(pid)) {
    return { threshold: 1000, percent: 0.05, base: 10 };
  }
  if (PROPERTY_GROUP_B.has(pid)) {
    return { threshold: 500, percent: 0.05, base: 10 };
  }

  // Fallback to defaults
  return {
    threshold: DEFAULT_LATE_FEE_THRESHOLD,
    percent: DEFAULT_LATE_FEE_PERCENT,
    base: DEFAULT_LATE_FEE_BASE
  };
}

/**
 * Parse currency string or number to float.
 */
export function parseCurrencyOrNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  try {
    return parseFloat(String(v).replace(/,/g, '').replace('$', '').trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Compute late fee based on the rules:
 * - If 0_to30 == 0 → Amount = 0
 * - If 0_to30 > 0 and total > threshold → (total - threshold) * percent + base
 * - If 0_to30 > 0 and total <= threshold → base
 */
export function computeLateFee(
  totalAmount: unknown,
  zeroTo30: unknown,
  params: LateFeeParams
): number {
  const total = parseCurrencyOrNumber(totalAmount);
  const z = parseCurrencyOrNumber(zeroTo30);

  if (z <= ZERO_EPS) {
    return 0;
  }

  if (total > params.threshold) {
    return (total - params.threshold) * params.percent + params.base;
  }

  return params.base;
}

/**
 * Get the property group name for display purposes.
 */
export function getPropertyGroup(propId: string | number | null | undefined): string {
  const pid = String(propId ?? '').trim();
  if (PROPERTY_GROUP_A.has(pid)) return 'Cook County';
  if (PROPERTY_GROUP_B.has(pid)) return 'Chicago';
  return 'Unknown';
}
