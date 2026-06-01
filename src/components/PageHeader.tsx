import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface Props {
  title: string;
  /**
   * Fallback path when there's no in-app history (e.g. user landed on this
   * screen via a shared URL). When the user navigated in from another screen,
   * we always use the browser back stack so the previous screen restores its
   * own state (search query, tab selection, scroll position).
   */
  back?: boolean | string;
  /** Optional right-aligned slot (e.g. a Save button). */
  right?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, back, right, className }: Props) {
  const nav = useNavigate();
  const location = useLocation();
  // location.key === 'default' on the very first entry after a fresh page load.
  // Any in-app navigation gives the new location a unique key.
  const hasHistory = location.key !== 'default';

  const onBack = () => {
    if (hasHistory) {
      nav(-1);
      return;
    }
    if (typeof back === 'string') nav(back);
    else nav('/');
  };

  return (
    <div className={cn('flex items-center gap-1.5 pb-1 pt-0.5', className)}>
      {back && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="-ml-2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
