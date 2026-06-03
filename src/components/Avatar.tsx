import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const AVATAR_BUCKET = 'avatars';

/** Public URL for an avatar storage path, or null. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

function initials(alias?: string | null, email?: string | null): string {
  const src = alias?.trim() || email?.trim() || '?';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Round profile circle. Renders the avatar image (cropped square, shown round
 * via CSS) or falls back to initials from the alias/email.
 */
export function Avatar({
  alias,
  email,
  avatarPath,
  size = 32,
  className
}: {
  alias?: string | null;
  email?: string | null;
  avatarPath?: string | null;
  size?: number;
  className?: string;
}) {
  const url = avatarUrl(avatarPath);
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-primary',
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden={!alias}
    >
      {url ? (
        <img
          src={url}
          alt={alias ?? 'Profile'}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.4) }} className="font-sans font-semibold leading-none">
          {initials(alias, email)}
        </span>
      )}
    </span>
  );
}
