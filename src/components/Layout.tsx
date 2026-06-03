import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Map as MapIcon, Sprout, LogOut, Leaf } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './Avatar';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

export function Layout() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const nav = useNavigate();

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 py-2">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
            <Leaf className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">BJH Garden Club</span>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to="/profile"
                aria-label="Your profile"
                className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
              >
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {profile?.alias || profile?.email || user.email}
                </span>
                {isAdmin && <Badge>admin</Badge>}
                <Avatar
                  alias={profile?.alias}
                  email={profile?.email ?? user.email}
                  avatarPath={profile?.avatar_path}
                  size={28}
                />
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  nav('/');
                }}
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <Outlet />
      </main>

      <nav className="grid grid-cols-2 border-t border-border/80 bg-background">
        <TabLink to="/" label="Map" icon={<MapIcon className="h-4 w-4" />} />
        <TabLink to="/care" label="Care" icon={<Sprout className="h-4 w-4" />} />
      </nav>
    </div>
  );
}

function TabLink({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-12 flex-col items-center justify-center gap-0.5 font-sans text-[11px] transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
