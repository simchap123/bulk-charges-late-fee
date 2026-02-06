'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { ChargeRow } from '@/lib/types';
import { getPropertyGroup } from '@/lib/calculations/late-fee';
import { cn } from '@/lib/utils';
import { useChargesStore } from '@/store/charges-store';

// Custom cell components that can use hooks
function ChargeDateCell() {
  const chargeDate = useChargesStore((s) => s.chargeDate);
  return <span className="text-sm font-mono">{chargeDate}</span>;
}

function DescriptionCell() {
  const chargeDate = useChargesStore((s) => s.chargeDate);
  const template = useChargesStore((s) => s.descriptionTemplate);

  const formatted = new Date(chargeDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const description = template.replace('{date}', formatted);

  return (
    <span className="text-sm text-muted-foreground truncate max-w-[200px] block" title={description}>
      {description}
    </span>
  );
}

export const columns: ColumnDef<ChargeRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    accessorKey: 'propertyName',
    header: 'Property',
    cell: ({ row }) => {
      const propId = row.original._v2PropertyId;
      const group = getPropertyGroup(propId);
      return (
        <div className="flex flex-col gap-1">
          <span className="font-medium truncate max-w-[200px]" title={row.original.propertyName}>
            {row.original.propertyName}
          </span>
          <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
            {group}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'unitName',
    header: 'Unit',
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.unitName}</span>
    ),
  },
  {
    accessorKey: 'tenantName',
    header: 'Tenant',
    cell: ({ row }) => (
      <span className="truncate max-w-[180px] block" title={row.original.tenantName}>
        {row.original.tenantName}
      </span>
    ),
  },
  {
    accessorKey: 'amount',
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = row.original.amount;
      return (
        <div className={cn(
          "text-right font-mono tabular-nums",
          amount === 0 && "text-muted-foreground"
        )}>
          ${amount.toFixed(2)}
        </div>
      );
    },
  },
  {
    accessorKey: '_zeroTo30',
    header: () => <div className="text-right">0-30</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums text-muted-foreground">
        ${row.original._zeroTo30.toFixed(2)}
      </div>
    ),
  },
  {
    accessorKey: '_totalAmount',
    header: () => <div className="text-right">Total</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums text-muted-foreground">
        ${row.original._totalAmount.toFixed(2)}
      </div>
    ),
  },
  {
    id: 'chargeDate',
    header: 'Charge Date',
    cell: () => <ChargeDateCell />,
  },
  {
    accessorKey: '_v0OccupancyId',
    header: 'V0 Occ ID',
    cell: ({ row }) => {
      const v0Id = row.original._v0OccupancyId;
      return v0Id ? (
        <span className="font-mono text-xs text-muted-foreground truncate max-w-[100px] block" title={v0Id}>
          {v0Id.substring(0, 8)}...
        </span>
      ) : (
        <Badge variant="destructive" className="text-[10px]">Missing</Badge>
      );
    },
  },
  {
    id: 'description',
    header: 'Description',
    cell: () => <DescriptionCell />,
  },
];
