'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useChargesStore, getRowId } from '@/store/charges-store';
import { useChargesData } from '@/hooks/useChargesData';
import { CSV_HEADERS } from '@/lib/appfolio/constants';
import type { ChargeRow } from '@/lib/types';
import {
  RefreshCw,
  Download,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

function rowsToCsv(rows: ChargeRow[]): string {
  const BOM = '\uFEFF';
  const lines: string[] = [CSV_HEADERS.join(',')];

  for (const r of rows) {
    const values = [
      r.propertyName,
      r.unitName,
      r.occupancyUid,
      r.tenantName,
      r.occupancyId,
      r.amount.toFixed(2),
      r.chargeDate,
      r.postingDate,
      r.glAccountNumber,
      r.description,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(values.join(','));
  }

  return BOM + lines.join('\n');
}

export function ActionBar() {
  const {
    filteredRows,
    selectedIds,
    selectAll,
    clearSelection,
    loading,
    envMode,
    chargeDate,
    descriptionTemplate,
    setChargeDate,
    setDescriptionTemplate,
  } = useChargesStore();
  const { loadData } = useChargesData();
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);

  const selectedRows = filteredRows.filter(row => selectedIds.has(getRowId(row)));
  const hasSelection = selectedRows.length > 0;
  const validForBulk = selectedRows.filter(r => r._v0OccupancyId && r.amount > 0);
  const invalidCount = selectedRows.length - validForBulk.length;

  // Generate sample payload for preview (READ-ONLY - NO POST!)
  // GL Account ID is server-side only, show placeholder in preview
  const GL_ACCOUNT_PLACEHOLDER = `[Server: ${envMode === 'test' ? 'TEST_' : ''}BULK_GL_ACCOUNT_ID]`;

  // Format description with date placeholder
  const formatDescription = (template: string, date: string) => {
    const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
    return template.replace('{date}', formatted);
  };

  const generatePayloadPreview = () => {
    const sampleRows = validForBulk.slice(0, 5); // Show max 5 samples
    const desc = formatDescription(descriptionTemplate, chargeDate);

    return {
      data: sampleRows.map(r => ({
        AmountDue: r.amount.toFixed(2),
        ChargedOn: chargeDate,
        Description: desc,
        GlAccountId: GL_ACCOUNT_PLACEHOLDER,
        OccupancyId: r._v0OccupancyId,
        ReferenceId: crypto.randomUUID(), // Show actual UUID format
      }))
    };
  };

  const copyPayload = () => {
    const payload = generatePayloadPreview();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success('Payload copied to clipboard');
  };

  const handleExport = async () => {
    const rowsToExport = hasSelection ? selectedRows : filteredRows;
    if (rowsToExport.length === 0) {
      toast.error('No rows to export');
      return;
    }

    setIsExporting(true);
    try {
      const csv = rowsToCsv(rowsToExport);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulk-charges-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rowsToExport.length} rows`);
    } catch (error) {
      toast.error('Export failed');
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkCreate = async () => {
    if (validForBulk.length === 0) {
      toast.error('No valid rows to create charges for');
      return;
    }

    setIsBulkCreating(true);
    try {
      const desc = formatDescription(descriptionTemplate, chargeDate);
      const rowsWithOverrides = validForBulk.map(r => ({
        ...r,
        _chargeDateIso: chargeDate,
        description: desc,
      }));

      const response = await fetch('/api/v0/charges/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Env-Mode': envMode,
        },
        body: JSON.stringify({ rows: rowsWithOverrides }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Bulk create failed');
      }

      const result = await response.json();
      toast.success(`Successfully created ${validForBulk.length} charges`, {
        description: result.message || 'Charges have been submitted to AppFolio',
      });
      clearSelection();
    } catch (error) {
      toast.error('Bulk create failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsBulkCreating(false);
      setConfirmDialog(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            onClick={loadData}
            disabled={loading.isLoading}
            variant="default"
          >
            {loading.isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {loading.isLoading ? loading.stage || 'Loading...' : 'Load Data'}
          </Button>

          {filteredRows.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={selectAll}
                disabled={selectedIds.size === filteredRows.length}
              >
                Select All ({filteredRows.length})
              </Button>
              {hasSelection && (
                <Button variant="ghost" onClick={clearSelection}>
                  Clear Selection
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filteredRows.length === 0 || isExporting}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export {hasSelection ? `(${selectedRows.length})` : 'All'}
          </Button>

          <Button
            variant="outline"
            onClick={() => setPreviewDialog(true)}
            disabled={validForBulk.length === 0}
          >
            <Eye className="mr-2 h-4 w-4" />
            Preview Payload
          </Button>

          <Button
            onClick={() => setConfirmDialog(true)}
            disabled={!hasSelection || validForBulk.length === 0 || isBulkCreating}
            variant={hasSelection && validForBulk.length > 0 ? 'default' : 'outline'}
          >
            {isBulkCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Create Charges ({validForBulk.length})
          </Button>
        </div>
      </div>

      {/* Loading Progress */}
      {loading.isLoading && loading.progress > 0 && (
        <div className="w-full bg-muted rounded-full h-2 mt-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${loading.progress}%` }}
          />
        </div>
      )}

      {/* Charge Settings - Always Visible */}
      {filteredRows.length > 0 && (
        <div className="flex flex-wrap items-end gap-4 p-3 border rounded-lg bg-card mt-3">
          <div className="space-y-1">
            <Label htmlFor="charge-date-main" className="text-xs font-medium">Charge Date</Label>
            <Input
              id="charge-date-main"
              type="date"
              value={chargeDate}
              onChange={(e) => setChargeDate(e.target.value || new Date().toISOString().split('T')[0])}
              className="w-40 h-9"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[250px]">
            <Label htmlFor="description-main" className="text-xs font-medium">
              Description Template <span className="text-muted-foreground">(use {'{date}'} for date)</span>
            </Label>
            <Input
              id="description-main"
              value={descriptionTemplate}
              onChange={(e) => setDescriptionTemplate(e.target.value)}
              placeholder="IL Custom Late Fee - {date}"
              className="h-9"
            />
          </div>
          <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded h-9 flex items-center">
            Preview: <strong className="ml-1">{formatDescription(descriptionTemplate, chargeDate)}</strong>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Create Bulk Charges
            </DialogTitle>
            <DialogDescription>
              You are about to create charges in AppFolio. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{validForBulk.length} valid charges will be created</span>
            </div>

            {invalidCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                <span>{invalidCount} rows will be skipped (missing V0 ID or $0 amount)</span>
              </div>
            )}

            {/* Editable Fields */}
            <div className="space-y-3 border rounded-md p-3">
              <div className="space-y-1.5">
                <Label htmlFor="charge-date">Charge Date</Label>
                <Input
                  id="charge-date"
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description Template</Label>
                <Input
                  id="description"
                  value={descriptionTemplate}
                  onChange={(e) => setDescriptionTemplate(e.target.value)}
                  placeholder="IL Custom Late Fee - {date}"
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{date}'} for formatted date (e.g., 02/01/2026)
                </p>
              </div>
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Preview: <strong>{formatDescription(descriptionTemplate, chargeDate)}</strong>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="font-medium mb-1">Total Amount:</p>
              <p className="text-2xl font-bold">
                ${validForBulk.reduce((sum, r) => sum + r.amount, 0).toFixed(2)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkCreate} disabled={isBulkCreating}>
              {isBulkCreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Confirm & Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payload Preview Dialog - READ ONLY, NO POST */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Payload Preview (Read Only)
            </DialogTitle>
            <DialogDescription>
              Sample of {Math.min(5, validForBulk.length)} out of {validForBulk.length} charges.
              This is what will be sent to AppFolio V0 API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                POST /api/v0/charges/bulk
              </span>
              <Button variant="outline" size="sm" onClick={copyPayload}>
                <Copy className="mr-2 h-3 w-3" />
                Copy JSON
              </Button>
            </div>

            <div className="bg-muted p-4 rounded-md overflow-auto max-h-[400px]">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {JSON.stringify(generatePayloadPreview(), null, 2)}
              </pre>
            </div>

            <div className="text-sm space-y-2">
              <p><strong>Fields explained:</strong></p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><code>AmountDue</code> - Late fee amount (calculated)</li>
                <li><code>ChargedOn</code> - Charge date (from aged receivables)</li>
                <li><code>Description</code> - IL Custom Late Fee - MM/01/YYYY</li>
                <li><code>GlAccountId</code> - GL Account from server env (BULK_GL_ACCOUNT_ID)</li>
                <li><code>OccupancyId</code> - V0 Occupancy ID (mapped from V2)</li>
                <li><code>ReferenceId</code> - Unique UUID per charge</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
