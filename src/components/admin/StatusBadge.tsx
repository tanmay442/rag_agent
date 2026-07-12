import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusTone = 'outline' | 'solid' | 'strong';

const toneStyles: Record<StatusTone, string> = {
  outline: 'border-border-subtle text-muted-foreground',
  solid: 'border-transparent bg-secondary text-foreground',
  strong: 'border-foreground/40 text-foreground',
};

interface StatusBadgeProps {
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function StatusBadge({ tone = 'outline', dot = false, className, children }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(toneStyles[tone], className)}>
      {dot ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </Badge>
  );
}

export type KnownStatus =
  | 'queued'
  | 'ingesting'
  | 'done'
  | 'failed'
  | 'created'
  | 'open'
  | 'in_progress'
  | 'closed'
  | 'live'
  | 'deleted'
  | 'admin'
  | 'user';

const STATUS_TONE: Record<KnownStatus, { tone: StatusTone; dot?: boolean }> = {
  queued: { tone: 'outline' },
  ingesting: { tone: 'strong', dot: true },
  done: { tone: 'solid' },
  failed: { tone: 'strong', dot: true },
  created: { tone: 'outline' },
  open: { tone: 'outline' },
  in_progress: { tone: 'strong', dot: true },
  closed: { tone: 'solid' },
  live: { tone: 'solid' },
  deleted: { tone: 'strong', dot: true },
  admin: { tone: 'strong' },
  user: { tone: 'outline' },
};

export function statusBadgeProps(status: string): { tone: StatusTone; dot?: boolean } {
  return STATUS_TONE[status as KnownStatus] ?? { tone: 'outline' };
}
