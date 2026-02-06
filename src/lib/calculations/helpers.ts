// MONTH_ABBR is exported from constants but not needed here

/**
 * Convert various date formats to YYYY-MM-DD.
 */
export function toYMD(s: unknown): string {
  if (!s) return '';
  const str = String(s);

  // Already YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }

  // MM/DD/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const mm = mdyMatch[1].padStart(2, '0');
    const dd = mdyMatch[2].padStart(2, '0');
    return `${mdyMatch[3]}-${mm}-${dd}`;
  }

  // Try parsing as date
  try {
    const d = new Date(str.replace('Z', '').replace('T', ' '));
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {
    // ignore
  }

  return '';
}

/**
 * Convert date to MM/DD/YYYY format.
 */
export function toMMDDYYYY(dateish: unknown): string {
  try {
    const d = new Date(String(dateish).replace('Z', '').replace('T', ' '));
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${mm}/${dd}/${d.getFullYear()}`;
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Get first of month as MM/01/YYYY from YYYY-MM-DD.
 */
export function firstOfMonthFromYMD(ymd: string): string {
  try {
    const y = parseInt(ymd.substring(0, 4));
    const m = parseInt(ymd.substring(5, 7));
    if (!isNaN(y) && !isNaN(m)) {
      return `${String(m).padStart(2, '0')}/01/${y}`;
    }
  } catch {
    // ignore
  }
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/01/${now.getFullYear()}`;
}

/**
 * Get end of current month as YYYY-MM-DD.
 */
export function endOfCurrentMonthYMD(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // First day of next month
  const firstNext = month === 11
    ? new Date(year + 1, 0, 1)
    : new Date(year, month + 1, 1);

  // Last day of current month
  const last = new Date(firstNext.getTime() - 24 * 60 * 60 * 1000);
  return last.toISOString().split('T')[0];
}

/**
 * Get ISO date string for N days ago.
 */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Convert "Last, First" to "First Last".
 */
export function lastCommaFirstToFirstLast(name: string | null | undefined): string {
  if (!name) return '';
  const parts = String(name).split(',').map(p => p.trim());
  if (parts.length >= 2) {
    return `${parts[1]} ${parts[0]}`.trim();
  }
  return name;
}

/**
 * Get description prefix from env or default.
 */
const DESCRIPTION_PREFIX = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_LATE_FEE_DESCRIPTION_PREFIX || 'IL Custom Late Fee')
  : 'IL Custom Late Fee';

/**
 * Generate late fee description from YYYY-MM-DD date.
 * Format: {PREFIX} - MM/01/YYYY
 */
export function lateFeeDescriptionFromYMD(ymd: string, prefix?: string): string {
  const firstOfMonth = firstOfMonthFromYMD(ymd);
  const descPrefix = prefix || DESCRIPTION_PREFIX;
  return `${descPrefix} - ${firstOfMonth}`;
}

/**
 * Generate late fee description with custom format.
 * Can include placeholders: {date}, {month}, {year}
 */
export function buildLateFeeDescription(ymd: string, template?: string): string {
  const firstOfMonth = firstOfMonthFromYMD(ymd);

  if (!template) {
    return `IL Custom Late Fee - ${firstOfMonth}`;
  }

  // Parse date parts
  const parts = ymd.split('-');
  const year = parts[0] || new Date().getFullYear().toString();
  const month = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');

  return template
    .replace('{date}', firstOfMonth)
    .replace('{month}', month)
    .replace('{year}', year);
}

/**
 * Generate a UUID v4.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Clamp a number between min and max.
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
