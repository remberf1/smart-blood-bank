import * as React from 'react';
import { LucideIcon } from 'lucide-react';

// Consistent loading spinner for page/section loads.
export function Loading({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-16 text-muted-foreground ${className}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// Consistent empty state for tables/lists with nothing to show.
export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="py-14 text-center text-muted-foreground">
      {Icon && <Icon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />}
      <p className="font-medium text-foreground/70">{title}</p>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
    </div>
  );
}
