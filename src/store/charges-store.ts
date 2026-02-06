import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChargeRow, LoadingState } from '@/lib/types';

type EnvMode = 'live' | 'test';

interface ChargesState {
  // Environment mode
  envMode: EnvMode;

  // Charge settings (editable by user)
  chargeDate: string; // YYYY-MM-DD format
  descriptionTemplate: string;

  // Data (kept in memory only - too large for localStorage)
  rows: ChargeRow[];
  filteredRows: ChargeRow[];
  selectedIds: Set<string>;
  warnings: string[];

  // Duplicate detection
  duplicateExcludedIds: Set<string>; // Row IDs of lower-amount duplicates to exclude from submission
  duplicateGroupIds: Set<string>; // Row IDs of ALL rows belonging to any duplicate group

  // Loading state
  loading: LoadingState;

  // Filters
  filters: {
    property: string;
    minAmount: number;
    maxAmount: number;
    showZeroAmount: boolean;
    showMissingOccupancy: boolean;
    onlyMissingOccupancy: boolean;
    onlyDuplicates: boolean;
  };

  // Actions
  setEnvMode: (mode: EnvMode) => void;
  setChargeDate: (date: string) => void;
  setDescriptionTemplate: (template: string) => void;
  setRows: (rows: ChargeRow[], warnings?: string[]) => void;
  setLoading: (loading: Partial<LoadingState>) => void;
  setFilter: (key: keyof ChargesState['filters'], value: string | number | boolean) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  getSelectedRows: () => ChargeRow[];
  reset: () => void;
}

// Generate unique ID for a row
function getRowId(row: ChargeRow): string {
  return `${row.propertyName}|${row.unitName}|${row.tenantName}|${row._v2PropertyId}`;
}

// Compute duplicate groups: same tenant at same property/unit
function computeDuplicates(rows: ChargeRow[]): { excludedIds: Set<string>; groupIds: Set<string> } {
  const groups = new Map<string, ChargeRow[]>();

  for (const row of rows) {
    if (row.amount <= 0) continue; // Only rows with amount > 0 count
    const key = `${row.propertyName}|${row.unitName}|${row.tenantName}`;
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const excludedIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const members of groups.values()) {
    if (members.length < 2) continue; // Not a duplicate group
    // Sort by amount descending — keep the first (highest)
    members.sort((a, b) => b.amount - a.amount);
    for (let i = 0; i < members.length; i++) {
      const id = getRowId(members[i]);
      groupIds.add(id);
      if (i > 0) excludedIds.add(id); // All except highest are excluded
    }
  }

  return { excludedIds, groupIds };
}

// Apply filters to rows (excluding onlyDuplicates which is applied after duplicate computation)
function applyFilters(rows: ChargeRow[], filters: ChargesState['filters']): ChargeRow[] {
  return rows.filter(row => {
    if (filters.property && !row.propertyName.toLowerCase().includes(filters.property.toLowerCase())) {
      return false;
    }
    // Filter on 0-30 balance (not late fee amount)
    if (row._zeroTo30 < filters.minAmount) {
      return false;
    }
    if (filters.maxAmount > 0 && row._zeroTo30 > filters.maxAmount) {
      return false;
    }
    if (!filters.showZeroAmount && row.amount === 0) {
      return false;
    }
    if (!filters.showMissingOccupancy && !row._v0OccupancyId) {
      return false;
    }
    // Only show missing filter - shows ONLY rows with missing V0 ID
    if (filters.onlyMissingOccupancy && row._v0OccupancyId) {
      return false;
    }
    return true;
  });
}

const initialFilters = {
  property: '',
  minAmount: 0,
  maxAmount: 0, // 0 = no max limit
  showZeroAmount: true, // Show all rows initially, let user filter
  showMissingOccupancy: true,
  onlyMissingOccupancy: false,
  onlyDuplicates: false,
};

// Apply filters and compute duplicates, then optionally filter to only duplicate group rows
function computeFilteredState(rows: ChargeRow[], filters: ChargesState['filters']) {
  const baseFiltered = applyFilters(rows, filters);
  const { excludedIds, groupIds } = computeDuplicates(baseFiltered);
  const filteredRows = filters.onlyDuplicates
    ? baseFiltered.filter(row => groupIds.has(getRowId(row)))
    : baseFiltered;
  return { filteredRows, duplicateExcludedIds: excludedIds, duplicateGroupIds: groupIds };
}

const initialLoading: LoadingState = {
  isLoading: false,
  progress: 0,
  stage: '',
};

// Persisted state type (what gets saved to localStorage)
// Note: We only persist filters, envMode, and charge settings, not rows (too large for localStorage)
interface PersistedState {
  filters: ChargesState['filters'];
  envMode: EnvMode;
  chargeDate: string;
  descriptionTemplate: string;
}

// Get today's date in YYYY-MM-DD format
const getToday = () => new Date().toISOString().split('T')[0];

export const useChargesStore = create<ChargesState>()(
  persist(
    (set, get) => ({
      envMode: 'live' as EnvMode,
      chargeDate: getToday(),
      descriptionTemplate: 'IL Custom Late Fee - {date}',
      rows: [],
      filteredRows: [],
      selectedIds: new Set(),
      warnings: [],
      duplicateExcludedIds: new Set(),
      duplicateGroupIds: new Set(),
      loading: initialLoading,
      filters: initialFilters,

      setEnvMode: (mode) => {
        set({ envMode: mode, rows: [], filteredRows: [], selectedIds: new Set(), warnings: [], duplicateExcludedIds: new Set(), duplicateGroupIds: new Set() });
      },

      setChargeDate: (date) => {
        set({ chargeDate: date });
      },

      setDescriptionTemplate: (template) => {
        set({ descriptionTemplate: template });
      },

      setRows: (rows, warnings = []) => {
        const { filters } = get();
        const computed = computeFilteredState(rows, filters);
        set({
          rows,
          ...computed,
          warnings,
          selectedIds: new Set(),
        });
      },

      setLoading: (loading) => {
        set((state) => ({
          loading: { ...state.loading, ...loading },
        }));
      },

      setFilter: (key, value) => {
        set((state) => {
          const newFilters = { ...state.filters, [key]: value };
          const computed = computeFilteredState(state.rows, newFilters);
          return {
            filters: newFilters,
            ...computed,
            selectedIds: new Set(),
          };
        });
      },

      toggleSelection: (id) => {
        set((state) => {
          const newSelected = new Set(state.selectedIds);
          if (newSelected.has(id)) {
            newSelected.delete(id);
          } else {
            newSelected.add(id);
          }
          return { selectedIds: newSelected };
        });
      },

      selectAll: () => {
        const { filteredRows } = get();
        set({
          selectedIds: new Set(filteredRows.map(getRowId)),
        });
      },

      clearSelection: () => {
        set({ selectedIds: new Set() });
      },

      getSelectedRows: () => {
        const { filteredRows, selectedIds } = get();
        return filteredRows.filter(row => selectedIds.has(getRowId(row)));
      },

      reset: () => {
        set({
          rows: [],
          filteredRows: [],
          selectedIds: new Set(),
          warnings: [],
          duplicateExcludedIds: new Set(),
          duplicateGroupIds: new Set(),
          loading: initialLoading,
          filters: initialFilters,
        });
      },
    }),
    {
      name: 'bulk-charges-v3',
      storage: createJSONStorage(() => localStorage),
      // Only persist filters, envMode, and charge settings (rows are too large for localStorage)
      partialize: (state): PersistedState => ({
        filters: state.filters,
        envMode: state.envMode,
        chargeDate: state.chargeDate,
        descriptionTemplate: state.descriptionTemplate,
      }),
    }
  )
);

// Export helper function
export { getRowId };
