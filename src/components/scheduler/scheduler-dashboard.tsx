'use client';

import { useState, useSyncExternalStore } from 'react';
import { useSchedulerStore, type SchedulerRun } from '@/store/scheduler-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Eye,
  Calendar,
  Zap,
  Info,
} from 'lucide-react';

function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function StatusBadge({ status }: { status: SchedulerRun['status'] }) {
  switch (status) {
    case 'success':
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Error
        </Badge>
      );
    case 'dry-run':
      return (
        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
          <Eye className="h-3 w-3 mr-1" />
          Dry Run
        </Badge>
      );
  }
}

export function SchedulerDashboard() {
  const { history, isRunning, runMode, addRun, setRunning, setRunMode, clearHistory } =
    useSchedulerStore();
  const mounted = useHasMounted();
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false);
  const [detailRun, setDetailRun] = useState<SchedulerRun | null>(null);

  const triggerRun = async (autoSubmit: boolean) => {
    setRunning(true);
    setConfirmDialog(false);

    try {
      const resp = await fetch('/api/scheduler/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: runMode, autoSubmit }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const result = await resp.json();

      addRun({
        id: crypto.randomUUID(),
        timestamp: result.timestamp || new Date().toISOString(),
        trigger: 'manual',
        mode: runMode,
        status: result.status,
        totalRows: result.totalRows || 0,
        validRows: result.validRows || 0,
        submittedRows: result.submittedRows || 0,
        skippedRows: result.skippedRows || 0,
        missingV0Count: result.missingV0Count || 0,
        totalAmount: result.totalAmount || 0,
        duration: result.duration || 0,
        warnings: result.warnings || [],
        error: result.error,
      });
    } catch (error) {
      addRun({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        trigger: 'manual',
        mode: runMode,
        status: 'error',
        totalRows: 0,
        validRows: 0,
        submittedRows: 0,
        skippedRows: 0,
        missingV0Count: 0,
        totalAmount: 0,
        duration: 0,
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleRunClick = (autoSubmit: boolean) => {
    if (autoSubmit) {
      setPendingAutoSubmit(true);
      setConfirmDialog(true);
    } else {
      triggerRun(false);
    }
  };

  const lastRun = history.length > 0 ? history[0] : null;

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Schedule Info Banner */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                Automatic Scheduling via Vercel Cron
              </p>
              <p className="text-muted-foreground">
                The scheduler is configured to run automatically on the <strong>6th of every month at 10:00 AM UTC</strong> via
                Vercel Cron Jobs. No login is required for automatic runs — authentication is handled via the <code>CRON_SECRET</code> environment variable.
              </p>
              <div className="flex flex-wrap gap-4 pt-1">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Schedule: <code>0 10 6 * *</code></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Control via env vars: <code>SCHEDULER_ENABLED</code>, <code>SCHEDULER_AUTO_SUBMIT</code>, <code>SCHEDULER_ENV_MODE</code>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Run Status */}
      {lastRun && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Last Run
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={lastRun.status} />
                  <Badge variant="outline" className="text-xs">{lastRun.mode}</Badge>
                  <Badge variant="outline" className="text-xs">{lastRun.trigger}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(lastRun.timestamp)} &middot; {formatDuration(lastRun.duration)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">${lastRun.totalAmount.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  {lastRun.submittedRows > 0
                    ? `${lastRun.submittedRows} charges submitted`
                    : `${lastRun.validRows} valid of ${lastRun.totalRows} total`}
                </p>
              </div>
            </div>
            {lastRun.error && (
              <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                {lastRun.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Run Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Play className="h-4 w-4 text-muted-foreground" />
            Manual Run
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Environment</Label>
              <Select value={runMode} onValueChange={(v) => setRunMode(v as 'live' | 'test')}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="test">Test</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleRunClick(false)}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Dry Run
              </Button>
              <Button
                onClick={() => handleRunClick(true)}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Run & Submit
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Dry Run</strong> fetches data and calculates charges without submitting.{' '}
            <strong>Run & Submit</strong> executes the full pipeline and posts charges to AppFolio.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Execution History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Execution History
            </CardTitle>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearHistory} className="h-8 text-xs">
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No runs yet. Use the controls above to trigger a manual run.
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Time</TableHead>
                    <TableHead className="w-[80px]">Trigger</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[60px]">Mode</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs">{formatTimestamp(run.timestamp)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{run.trigger}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{run.mode}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {run.submittedRows > 0 ? `${run.submittedRows}/${run.totalRows}` : `${run.validRows}/${run.totalRows}`}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        ${run.totalAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatDuration(run.duration)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDetailRun(run)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Submission
            </DialogTitle>
            <DialogDescription>
              This will run the full pipeline and submit charges to AppFolio ({runMode} mode).
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2 text-sm">
            <p>The pipeline will:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Fetch all aged receivables from AppFolio V2</li>
              <li>Calculate late fees based on Illinois rules</li>
              <li>Map occupancy IDs from V2 to V0</li>
              <li>Submit all valid charges to AppFolio V0</li>
            </ol>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingAutoSubmit) triggerRun(true);
              }}
              disabled={isRunning}
            >
              {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Confirm & Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Detail Dialog */}
      <Dialog open={!!detailRun} onOpenChange={() => setDetailRun(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Run Details
            </DialogTitle>
          </DialogHeader>
          {detailRun && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={detailRun.status} />
                <Badge variant="outline">{detailRun.mode}</Badge>
                <Badge variant="outline">{detailRun.trigger}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Time:</span>
                  <div className="font-medium">{formatTimestamp(detailRun.timestamp)}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Duration:</span>
                  <div className="font-medium">{formatDuration(detailRun.duration)}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Total Rows:</span>
                  <div className="font-medium">{detailRun.totalRows}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Valid Rows:</span>
                  <div className="font-medium">{detailRun.validRows}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Submitted:</span>
                  <div className="font-medium">{detailRun.submittedRows}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Skipped:</span>
                  <div className="font-medium">{detailRun.skippedRows}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Missing V0:</span>
                  <div className="font-medium">{detailRun.missingV0Count}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="text-muted-foreground">Total Amount:</span>
                  <div className="font-medium">${detailRun.totalAmount.toFixed(2)}</div>
                </div>
              </div>

              {detailRun.error && (
                <div className="p-2 bg-destructive/10 rounded text-destructive text-xs">
                  <strong>Error:</strong> {detailRun.error}
                </div>
              )}

              {detailRun.warnings.length > 0 && (
                <div className="p-2 bg-amber-500/10 rounded text-xs">
                  <strong className="text-amber-600">Warnings:</strong>
                  <ul className="mt-1 space-y-0.5 text-amber-600">
                    {detailRun.warnings.map((w, i) => (
                      <li key={i}>- {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailRun(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
