'use client';

import { useChargesStore } from '@/store/charges-store';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FlaskConical, Building2 } from 'lucide-react';

export function EnvModeToggle() {
  const { envMode, setEnvMode, rows } = useChargesStore();
  const isTest = envMode === 'test';

  const handleToggle = (checked: boolean) => {
    const newMode = checked ? 'test' : 'live';
    // Clear data when switching modes
    setEnvMode(newMode);
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg border bg-card">
      <div className="flex items-center gap-2">
        {isTest ? (
          <FlaskConical className="h-4 w-4 text-amber-500" />
        ) : (
          <Building2 className="h-4 w-4 text-green-500" />
        )}
        <Badge
          variant={isTest ? 'outline' : 'default'}
          className={isTest ? 'bg-amber-500/10 text-amber-500 border-amber-500/50' : 'bg-green-500/10 text-green-500 border-green-500/50'}
        >
          {isTest ? 'TEST' : 'LIVE'}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="env-mode" className="text-xs text-muted-foreground">
          Live
        </Label>
        <Switch
          id="env-mode"
          checked={isTest}
          onCheckedChange={handleToggle}
          disabled={rows.length > 0}
        />
        <Label htmlFor="env-mode" className="text-xs text-muted-foreground">
          Test
        </Label>
      </div>

      {rows.length > 0 && (
        <span className="text-xs text-muted-foreground">
          (clear data to switch)
        </span>
      )}
    </div>
  );
}
