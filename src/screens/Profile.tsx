import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { processAvatar } from '../lib/image';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/Spinner';

const AVATAR_BUCKET = 'avatars';

export function Profile() {
  const { user, profile, refreshProfile } = useAuth();

  const [alias, setAlias] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Keep the alias field in sync once the profile loads.
  useEffect(() => {
    setAlias(profile?.alias ?? '');
  }, [profile?.alias]);

  // Revoke the object URL when it changes / unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!user) return <Spinner label="Loading…" />;

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!f) return;
    setError(null);
    setSaved(false);
    setProcessing(true);
    try {
      const out = await processAvatar(f);
      setPendingFile(out);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(out);
      });
    } catch (err) {
      setError(`Could not process that image: ${(err as Error).message}`);
    } finally {
      setProcessing(false);
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      let avatar_path = profile?.avatar_path ?? null;
      if (pendingFile) {
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, pendingFile, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw new Error(upErr.message);
        // Remove the previous file so avatars don't orphan.
        if (profile?.avatar_path) {
          await supabase.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
        }
        avatar_path = path;
      }
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ alias: alias.trim() || null, avatar_path })
        .eq('id', user.id);
      if (dbErr) throw new Error(dbErr.message);
      await refreshProfile();
      setPendingFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onRemovePhoto = async () => {
    setError(null);
    setSaved(false);
    // If it's just a not-yet-saved selection, clear it locally.
    if (pendingFile) {
      setPendingFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    if (!profile?.avatar_path) return;
    setSaving(true);
    try {
      await supabase.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_path: null })
        .eq('id', user.id);
      if (dbErr) throw new Error(dbErr.message);
      await refreshProfile();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const hasPhoto = !!previewUrl || !!profile?.avatar_path;

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={onSave} className="mx-auto max-w-md space-y-6 p-4 pb-8">
        <PageHeader title="Your profile" back="/" />

        <div className="flex flex-col items-center gap-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview"
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <Avatar
              alias={profile?.alias}
              email={profile?.email ?? user.email}
              avatarPath={profile?.avatar_path}
              size={96}
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={processing || saving}
              onClick={() => fileRef.current?.click()}
            >
              {processing ? 'Processing…' : hasPhoto ? 'Change photo' : 'Add photo'}
            </Button>
            {hasPhoto && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={onRemovePhoto}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={onPickFile}
          />
          <p className="text-center text-xs text-muted-foreground">
            Photos are cropped to a square, shrunk to 256px, and saved as a small JPEG.
            HEIC photos are converted automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="alias">Display name (alias)</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="e.g. Tsivia"
            maxLength={40}
          />
          <p className="text-xs text-muted-foreground">
            Shown instead of your email on care sessions. Leave blank to stay anonymous.
          </p>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <span className="text-xs uppercase tracking-wider">Signed in as</span>
          <p className="font-medium text-foreground">{profile?.email ?? user.email}</p>
        </div>

        {error && <Banner kind="error">{error}</Banner>}
        {saved && <Banner kind="success">Profile updated.</Banner>}

        <Button type="submit" disabled={saving || processing} size="xl" className="w-full">
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </form>
    </div>
  );
}
