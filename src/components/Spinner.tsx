import { Loader2 } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {label && <p className="mt-3 text-sm">{label}</p>}
    </div>
  );
}
