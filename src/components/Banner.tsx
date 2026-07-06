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
    info: 'bg-blue-950 text-blue-100 border-blue-800'
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-1 text-sm', styles, className)}
    >
      {children}
    </div>
  );
}
