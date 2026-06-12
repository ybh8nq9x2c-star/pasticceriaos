// =============================================================================
// <OrgBadge> — card compatta in fondo alla sidebar: iniziali org + nome +
// tipo workspace. Include l'uscita (sign out) come azione secondaria.
// =============================================================================

import { LogOut } from 'lucide-react';
import { signOutAction } from '@/modules/identity/actions';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export function OrgBadge({
  orgName,
  email,
  workspaceLabel,
  collapsed = false,
}: {
  orgName: string;
  email: string;
  workspaceLabel: string;
  /** true su tablet (sidebar icone-only): mostra solo iniziali + esci. */
  collapsed?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-md border border-border bg-surface-2 p-2.5',
        collapsed && 'flex-col gap-2 p-2',
      )}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center w-8 h-8 rounded-md bg-primary-light text-primary text-sm font-semibold shrink-0"
      >
        {(orgName.trim().charAt(0) || '?').toUpperCase()}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink truncate" title={orgName}>
            {orgName}
          </span>
          <span className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="primary" size="sm">{workspaceLabel}</Badge>
          </span>
          <span className="block text-xs text-ink-faint truncate mt-1" title={email}>
            {email}
          </span>
        </span>
      )}
      <form action={signOutAction} className={cn(!collapsed && 'self-start')}>
        <button
          type="submit"
          aria-label="Esci dall'account"
          title="Esci"
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-faint hover:text-danger hover:bg-danger-light transition-colors"
        >
          <LogOut size={14} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
