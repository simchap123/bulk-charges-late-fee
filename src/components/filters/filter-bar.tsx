'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useChargesStore } from '@/store/charges-store';
import { Search, DollarSign } from 'lucide-react';

export function FilterBar() {
  const { filters, setFilter } = useChargesStore();

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/30 rounded-lg border">
      {/* Property Search */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search properties..."
          value={filters.property}
          onChange={(e) => setFilter('property', e.target.value)}
          className="h-9 w-[200px]"
        />
      </div>

      {/* 0-30 Balance Filter */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">0-30:</span>
        <Input
          type="number"
          placeholder="Min $"
          value={filters.minAmount || ''}
          onChange={(e) => setFilter('minAmount', parseFloat(e.target.value) || 0)}
          className="h-9 w-[90px]"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="number"
          placeholder="Max $"
          value={filters.maxAmount || ''}
          onChange={(e) => setFilter('maxAmount', parseFloat(e.target.value) || 0)}
          className="h-9 w-[90px]"
        />
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Show Zero Amount */}
      <div className="flex items-center gap-2">
        <Switch
          id="show-zero"
          checked={filters.showZeroAmount}
          onCheckedChange={(checked) => setFilter('showZeroAmount', checked)}
        />
        <Label htmlFor="show-zero" className="text-sm cursor-pointer">
          Show $0 amounts
        </Label>
      </div>

      {/* Show Missing Occupancy */}
      <div className="flex items-center gap-2">
        <Switch
          id="show-missing"
          checked={filters.showMissingOccupancy}
          onCheckedChange={(checked) => setFilter('showMissingOccupancy', checked)}
        />
        <Label htmlFor="show-missing" className="text-sm cursor-pointer">
          Show missing V0 IDs
        </Label>
      </div>

      {/* Only Missing Occupancy - to isolate problem rows */}
      <div className="flex items-center gap-2">
        <Switch
          id="only-missing"
          checked={filters.onlyMissingOccupancy}
          onCheckedChange={(checked) => setFilter('onlyMissingOccupancy', checked)}
        />
        <Label htmlFor="only-missing" className="text-sm cursor-pointer text-destructive">
          ONLY missing V0 IDs
        </Label>
      </div>
    </div>
  );
}
