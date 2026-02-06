'use client';

import { Header } from '@/components/layout/header';
import { SchedulerDashboard } from '@/components/scheduler/scheduler-dashboard';

export default function SchedulerPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Scheduler</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure and monitor automatic late fee charge execution.
          </p>
        </div>
        <SchedulerDashboard />
      </main>
      <footer className="border-t py-4">
        <div className="container px-4 text-center text-xs text-muted-foreground">
          Bulk Charges Builder v1.0 &middot; Scheduler powered by Vercel Cron
        </div>
      </footer>
    </div>
  );
}
