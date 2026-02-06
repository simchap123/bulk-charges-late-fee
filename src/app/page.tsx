'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { useChargesStore, getRowId } from '@/store/charges-store';
import { DataTable } from '@/components/charges-table/data-table';
import { columns } from '@/components/charges-table/columns';
import { FilterBar } from '@/components/filters/filter-bar';
import { ActionBar } from '@/components/actions/action-bar';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, DollarSign, Users, Building, Info, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { RowSelectionState } from '@tanstack/react-table';

// Hydration-safe hook
function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

const LATE_FEE_RULES = `Late Fee Rules (Illinois):

• City of Chicago properties: $10 for the first $500 of monthly rent, plus 5% of any amount exceeding $500.

• All other Illinois properties (Cook County suburbs, Kane County, etc.): $10 for the first $1,000 of monthly rent, plus 5% of any amount exceeding $1,000.`;

export default function Home() {
  const { filteredRows, warnings, selectedIds, toggleSelection, clearSelection } = useChargesStore();
  const mounted = useHasMounted();

  const copyRules = useCallback(() => {
    navigator.clipboard.writeText(LATE_FEE_RULES);
    toast.success('Rules copied to clipboard');
  }, []);

  // Convert Set-based selection to TanStack Table's RowSelectionState
  const rowSelection: RowSelectionState = {};
  filteredRows.forEach((row, index) => {
    if (selectedIds.has(getRowId(row))) {
      rowSelection[index] = true;
    }
  });

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    // Clear all first
    clearSelection();
    // Then select the new ones
    Object.keys(newSelection).forEach(indexStr => {
      const index = parseInt(indexStr);
      if (newSelection[index] && filteredRows[index]) {
        toggleSelection(getRowId(filteredRows[index]));
      }
    });
  };

  // Calculate stats
  const totalAmount = filteredRows.reduce((sum, r) => sum + r.amount, 0);
  const uniqueProperties = new Set(filteredRows.map(r => r.propertyName)).size;
  const uniqueTenants = filteredRows.length;
  const missingOccupancy = filteredRows.filter(r => !r._v0OccupancyId).length;

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Main Content */}
      <main className="container px-4 py-6 space-y-6">
        {/* Stats Cards */}
        {filteredRows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalAmount.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  from {filteredRows.length} charges
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Properties</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{uniqueProperties}</div>
                <p className="text-xs text-muted-foreground">
                  unique properties
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tenants</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{uniqueTenants}</div>
                <p className="text-xs text-muted-foreground">
                  pending charges
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Issues</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{missingOccupancy}</div>
                <p className="text-xs text-muted-foreground">
                  missing V0 IDs
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Warnings</span>
            </div>
            <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1">
              {warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <ActionBar />

        <Separator />

        {/* Filters */}
        {filteredRows.length > 0 && <FilterBar />}

        {/* Table */}
        {filteredRows.length > 0 ? (
          <DataTable
            columns={columns}
            data={filteredRows}
            rowSelection={rowSelection}
            onRowSelectionChange={handleRowSelectionChange}
          />
        ) : (
          <Card className="mt-8">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Data Loaded</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Click &quot;Load Data&quot; to fetch aged receivables from AppFolio and calculate late fees.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Late Fee Rules - Always Visible */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                Illinois Late Fee Rules
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={copyRules} className="h-8">
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm space-y-3">
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/30">
                  Chicago
                </Badge>
                <p className="text-muted-foreground">
                  <strong>$10</strong> for the first <strong>$500</strong> of monthly rent, plus <strong>5%</strong> of any amount exceeding $500.
                </p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 bg-green-500/10 text-green-600 border-green-500/30">
                  Cook County+
                </Badge>
                <p className="text-muted-foreground">
                  <strong>$10</strong> for the first <strong>$1,000</strong> of monthly rent, plus <strong>5%</strong> of any amount exceeding $1,000.
                  <span className="text-xs block mt-1 opacity-75">(Includes Cook County suburbs, Kane County, and all other IL properties)</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="container px-4 text-center text-xs text-muted-foreground">
          Bulk Charges Builder v1.0 &middot; Data is fetched from AppFolio APIs
        </div>
      </footer>
    </div>
  );
}
