import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  kind?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Banner({ kind = 'info', children, className }: Props) {
  const styles = {
    error: 'bg-destructive/10 text-destructive border-destructive/30',
    success: 'bg-primary/10 text-primary border-primary/30',
    info: 'bg-card text-foreground border-border'
  }[kind];
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        styles,
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
