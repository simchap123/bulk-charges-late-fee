'use client';

import { useCallback } from 'react';
import { useChargesStore } from '@/store/charges-store';
import { buildOccupancyMaps, buildChargeRows, retryMappingWithWideTenants } from '@/lib/calculations/occupancy-mapping';
import type { AgedReceivablesRow, V2TenantDirectoryRow, V0Tenant } from '@/lib/types';

const TABLE_GL_ACCOUNT_NUMBER = process.env.NEXT_PUBLIC_TABLE_GL_ACCOUNT_NUMBER || '4815-000';

export function useChargesData() {
  const { setRows, setLoading, loading, envMode } = useChargesStore();

  // Helper to fetch with env mode header
  const fetchWithMode = async (url: string) => {
    const res = await fetch(url, {
      headers: { 'X-Env-Mode': envMode },
    });
    return res.json();
  };

  const loadData = useCallback(async () => {
    setLoading({ isLoading: true, progress: 0, stage: 'Starting...' });

    try {
      const warnings: string[] = [];

      // ===== PHASE 1: Load aged receivables FIRST and display immediately =====
      setLoading({ progress: 10, stage: `Fetching aged receivables (${envMode})...` });

      const agedRes = await fetchWithMode('/api/v2/aged-receivables');

      if (agedRes.error) {
        warnings.push(`Aged receivables: ${agedRes.error}`);
      }

      const aged: AgedReceivablesRow[] = agedRes.data || [];

      if (aged.length === 0) {
        setLoading({ isLoading: false, progress: 100, stage: '' });
        setRows([], [...warnings, 'No aged receivables data returned']);
        return;
      }

      setLoading({ progress: 40, stage: 'Calculating late fees...' });

      // Build initial rows with late fees (no V0 mapping yet)
      // Pass empty arrays for tenant data - we'll update later
      const emptyMaps = buildOccupancyMaps([], []);
      let rows = buildChargeRows(aged, emptyMaps, TABLE_GL_ACCOUNT_NUMBER);

      // Show data immediately! User can see late fees now.
      setLoading({ progress: 50, stage: 'Loading tenant mapping in background...' });
      setRows(rows, [...warnings, 'Loading tenant mapping for charge submission...']);

      // ===== PHASE 2: Load tenant mapping in background =====
      const [tenantDirRes, v0TenantsRes] = await Promise.all([
        fetchWithMode('/api/v2/tenant-directory'),
        fetchWithMode('/api/v0/tenants?days=31'),
      ]);

      if (tenantDirRes.error) {
        warnings.push(`Tenant directory: ${tenantDirRes.error}`);
      }
      if (v0TenantsRes.error) {
        warnings.push(`V0 tenants: ${v0TenantsRes.error}`);
      }

      const tenantDir: V2TenantDirectoryRow[] = tenantDirRes.data || [];
      const v0Tenants: V0Tenant[] = v0TenantsRes.data || [];

      setLoading({ progress: 70, stage: 'Building occupancy maps...' });

      // Rebuild rows with proper V0 mapping
      const maps = buildOccupancyMaps(v0Tenants, tenantDir);
      rows = buildChargeRows(aged, maps, TABLE_GL_ACCOUNT_NUMBER);

      setLoading({ progress: 85, stage: 'Resolving missing occupancies...' });

      // Check if any rows are missing V0 occupancy ID
      const missingCount = rows.filter(r => !r._v0OccupancyId).length;
      if (missingCount > 0 && missingCount < rows.length) {
        // Try wider tenant query only if some are missing
        try {
          setLoading({ progress: 90, stage: 'Fetching additional tenant data...' });
          const wideRes = await fetchWithMode('/api/v0/tenants?wide=true');
          if (!wideRes.error && wideRes.data) {
            rows = retryMappingWithWideTenants(rows, wideRes.data);
          }
        } catch (e) {
          console.error('Wide tenant fetch failed:', e);
        }
      }

      // Final update with complete mapping
      const finalMissingCount = rows.filter(r => !r._v0OccupancyId).length;
      if (finalMissingCount > 0) {
        warnings.push(`${finalMissingCount} rows missing V0 occupancy ID (cannot submit these)`);
      }

      setLoading({ progress: 100, stage: 'Complete' });
      setRows(rows, warnings.length > 0 ? warnings : undefined);

    } catch (error) {
      console.error('Load data error:', error);
      setRows([], [error instanceof Error ? error.message : 'Unknown error loading data']);
    } finally {
      setLoading({ isLoading: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRows, setLoading, envMode]);

  return { loadData, loading };
}
