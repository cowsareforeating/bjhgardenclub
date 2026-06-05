import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { processPhoto } from '../lib/image';
import { PHOTO_BUCKET, uploadCarePhotos } from '../lib/carePhotos';
import { useAuth } from '../context/AuthContext';
import type { ActivityType } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';

const MAX_PHOTOS = 12;

// HTML datetime-local needs `YYYY-MM-DDTHH:mm` in *local* time.
function localNow(): string {
  return toLocalInput(new Date());
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface NewPhoto {
  id: string;
  file: File;
  previewUrl: string | null; // null while processing (HEIC convert + downscale)
  converting: boolean;
  errorMsg?: string;
}

interface ExistingPhoto {
  photoId: number;
  storagePath: string;
  publicUrl: string;
  createdBy: string | null;
}

/**
 * The care-session form. Two modes:
 *  - default: create (`/care/new`) or full edit (`/care/:id/edit`, creator/admin).
 *  - `photoOnly` (`/care/:id/photos`): any signed-in member contributes photos and
 *    manages the ones they added — no session-field editing. Adding a photo
 *    auto-joins them to the session (DB trigger, migration 014).
 */
export function RecordCareSession({ photoOnly = false }: { photoOnly?: boolean } = {}) {
  const { id, sessionId } = useParams<{ id: string; sessionId?: string }>();
  const { user } = useAuth();
  const isEdit = !!sessionId;
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(isEdit);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<number[]>([]);
  const [performedAt, setPerformedAt] = useState<string>(localNow());
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [removedExistingPhotos, setRemovedExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'saving' | 'uploading' | 'deleting'>('idle');
  // Set when a recent session exists on this bed (collision modal at submit).
  const [collision, setCollision] = useState<{ when: string; byAlias: string | null } | null>(null);

  // Load activity-type lookup.
  useEffect(() => {
    supabase
      .from('activity_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setActivities((data ?? []) as ActivityType[]);
      });
  }, []);

  // In edit mode, hydrate the form from the existing session.
  useEffect(() => {
    if (!isEdit || !sessionId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('care_sessions')
        .select(
          '*, care_session_activities(activity_type_id), care_session_photos(id, storage_path, created_by)'
        )
        .eq('id', sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message ?? 'Could not load this care session.');
        setLoading(false);
        return;
      }
      setPerformedAt(toLocalInput(new Date(data.performed_at)));
      setNotes(data.notes ?? '');
      setSelectedActivityIds(
        (data.care_session_activities ?? []).map((a: { activity_type_id: number }) => a.activity_type_id)
      );
      setExistingPhotos(
        (data.care_session_photos ?? []).map(
          (p: { id: number; storage_path: string; created_by: string | null }) => ({
            photoId: p.id,
            storagePath: p.storage_path,
            publicUrl: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
            createdBy: p.created_by
          })
        )
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, sessionId]);

  // Release object URLs on unmount.
  useEffect(() => {
    return () => {
      photos.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleActivity = (aid: number) => {
    setSelectedActivityIds((cur) =>
      cur.includes(aid) ? cur.filter((x) => x !== aid) : [...cur, aid]
    );
  };

  const totalPhotos = photos.length + existingPhotos.length;

  const onPickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).slice(0, MAX_PHOTOS - totalPhotos);

    // Every photo is processed (HEIC→JPEG + downscale to keep uploads small).
    const staged: NewPhoto[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: null,
      converting: true
    }));
    setPhotos((cur) => [...cur, ...staged]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    staged.forEach((p) => runProcess(p));
  };

  const runProcess = async (p: NewPhoto) => {
    try {
      const out = await processPhoto(p.file);
      const previewUrl = URL.createObjectURL(out);
      setPhotos((cur) =>
        cur.map((x) => (x.id === p.id ? { ...x, file: out, previewUrl, converting: false } : x))
      );
    } catch {
      setPhotos((cur) =>
        cur.map((x) =>
          x.id === p.id
            ? {
                ...x,
                converting: false,
                errorMsg: 'Could not process this photo — remove it or try again.'
              }
            : x
        )
      );
    }
  };

  const removeNewPhoto = (photoId: string) => {
    setPhotos((cur) => {
      const removed = cur.find((p) => p.id === photoId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return cur.filter((p) => p.id !== photoId);
    });
  };

  const removeExistingPhoto = (photoId: number) => {
    setExistingPhotos((cur) => {
      const p = cur.find((x) => x.photoId === photoId);
      if (p) setRemovedExistingPhotos((r) => [...r, p]);
      return cur.filter((x) => x.photoId !== photoId);
    });
  };

  const onDelete = async () => {
    if (!isEdit || !sessionId) return;
    if (!confirm('Delete this care session? This cannot be undone.')) return;

    setStage('deleting');
    // Best-effort: remove storage objects so they don't orphan.
    const allPaths = [...existingPhotos, ...removedExistingPhotos].map((p) => p.storagePath);
    if (allPaths.length) {
      await supabase.storage.from(PHOTO_BUCKET).remove(allPaths);
    }
    // Care_session row cascades to activities + photos via FK.
    const { error: delErr } = await supabase.from('care_sessions').delete().eq('id', sessionId);
    if (delErr) {
      setStage('idle');
      setError(delErr.message);
      return;
    }
    nav(`/bed/${id}`);
  };

  // Attach the form's activities + photos to a session, then navigate. Used by
  // both edit and freshly-created sessions.
  const finishSave = async (workingId: string) => {
    const usableNewPhotos = photos.filter((p) => !p.errorMsg);

    // 2. Replace activity assignments. Cheaper than diffing; audit still records.
    //    Skipped in photoOnly mode — contributors don't edit activities (and RLS
    //    on care_session_activities would reject a non-owner anyway).
    if (isEdit && !photoOnly) {
      const { error: clearErr } = await supabase
        .from('care_session_activities')
        .delete()
        .eq('care_session_id', workingId);
      if (clearErr) {
        setStage('idle');
        setError(`Could not clear old activities: ${clearErr.message}`);
        return;
      }
    }
    if (!photoOnly && selectedActivityIds.length > 0) {
      const rows = selectedActivityIds.map((activity_type_id) => ({
        care_session_id: workingId,
        activity_type_id
      }));
      const { error: actErr } = await supabase.from('care_session_activities').insert(rows);
      if (actErr) {
        setStage('idle');
        setError(`Activities failed to save: ${actErr.message}`);
        return;
      }
    }

    // 3. Delete photos the user removed.
    if (removedExistingPhotos.length > 0) {
      const ids = removedExistingPhotos.map((p) => p.photoId);
      const paths = removedExistingPhotos.map((p) => p.storagePath);
      await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      const { error: delPhotoErr } = await supabase
        .from('care_session_photos')
        .delete()
        .in('id', ids);
      if (delPhotoErr) {
        setStage('idle');
        setError(`Could not remove old photos: ${delPhotoErr.message}`);
        return;
      }
    }

    // 4. Upload new photos (shared with the inline card adder — see carePhotos.ts).
    if (usableNewPhotos.length > 0) {
      setStage('uploading');
      let failures: string[];
      try {
        ({ failures } = await uploadCarePhotos(
          workingId,
          usableNewPhotos.map((p) => p.file)
        ));
      } catch (e) {
        setStage('idle');
        setError(e instanceof Error ? e.message : 'Photos failed to save.');
        return;
      }

      if (failures.length > 0) {
        // Surface the actual Supabase error — "Bucket not found", RLS denial,
        // file-size cap, etc. — instead of a generic count.
        // eslint-disable-next-line no-console
        failures.forEach((f) => console.error('Photo upload failed:', f));
        setStage('idle');
        setError(
          `${failures.length} photo${failures.length === 1 ? '' : 's'} failed to upload: ${failures[0]}`
        );
        return;
      }
    }

    setStage('idle');
    nav(`/bed/${id}`);
  };

  // Create-or-join via the dedup RPC, then attach content only if we created it.
  const createAndFinish = async (forceNew: boolean) => {
    setCollision(null);
    setStage('saving');
    const performedIso = new Date(performedAt).toISOString();
    const { data, error: rpcErr } = await supabase.rpc('log_care', {
      p_bed: id,
      p_performed_at: performedIso,
      p_force_new: forceNew
    });
    if (rpcErr || !data) {
      setStage('idle');
      setError(rpcErr?.message ?? 'Could not save session.');
      return;
    }
    const { session_id, created } = data as { session_id: string; created: boolean };
    if (!created) {
      // Joined an existing session — the RPC added us as a participant.
      setStage('idle');
      nav(`/bed/${id}`);
      return;
    }
    // We created the session; the RPC doesn't set notes, so do it here.
    if (notes.trim()) {
      await supabase.from('care_sessions').update({ notes: notes.trim() }).eq('id', session_id);
    }
    await finishSave(session_id);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!id) {
      setError('Missing tree bed id.');
      return;
    }
    if (!performedAt) {
      setError('Pick a date and time.');
      return;
    }
    if (photos.some((p) => p.converting)) {
      setError('Hold on — photos are still processing.');
      return;
    }

    // Photo-only contribution: just add/remove photos, no session-field writes.
    // The DB trigger auto-joins the contributor when a photo lands.
    if (photoOnly && sessionId) {
      setStage('saving');
      await finishSave(sessionId);
      return;
    }

    // Edit path is unchanged — update in place, then attach content.
    if (isEdit && sessionId) {
      setStage('saving');
      const { error: updErr } = await supabase
        .from('care_sessions')
        .update({ notes: notes.trim() || null, performed_at: new Date(performedAt).toISOString() })
        .eq('id', sessionId);
      if (updErr) {
        setStage('idle');
        setError(updErr.message);
        return;
      }
      await finishSave(sessionId);
      return;
    }

    // Create path: look for a recent session on this bed (±4h). If one exists,
    // let the user choose Join vs Log separately; otherwise create straight away.
    const iso = new Date(performedAt).toISOString();
    const t = Date.parse(iso);
    const { data: recent, error: recentErr } = await supabase
      .from('care_sessions')
      .select('id, performed_at, created_by')
      .eq('tree_bed_id', id)
      .gte('performed_at', new Date(t - 4 * 3600 * 1000).toISOString())
      .lte('performed_at', new Date(t + 4 * 3600 * 1000).toISOString())
      .order('performed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentErr) {
      setError(recentErr.message);
      return;
    }
    if (recent) {
      let byAlias: string | null = null;
      if (recent.created_by) {
        const { data: prof } = await supabase
          .from('public_profiles')
          .select('alias')
          .eq('id', recent.created_by)
          .maybeSingle();
        byAlias = (prof as { alias: string | null } | null)?.alias ?? null;
      }
      setCollision({ when: recent.performed_at, byAlias });
      return;
    }
    await createAndFinish(false);
  };

  const busy = stage !== 'idle';
  const anyConverting = photos.some((p) => p.converting);

  if (loading) return <Spinner label="Loading session…" />;

  return (
    <div className="h-full overflow-y-auto">
      {collision && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
            <h2 className="text-base font-semibold">Care already logged here</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {collision.byAlias ? `${collision.byAlias} logged` : 'Someone logged'} care at this bed on{' '}
              {new Date(collision.when).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
              . Join that session to add yourself, or log a separate one.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Joining won’t attach the photos or notes you entered here.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button type="button" size="lg" onClick={() => createAndFinish(false)}>
                Join — add me
              </Button>
              <Button type="button" size="lg" variant="secondary" onClick={() => createAndFinish(true)}>
                Log separately
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={() => setCollision(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-5 p-4 pb-8">
        <PageHeader
          title={photoOnly ? 'Add photos' : isEdit ? 'Edit care session' : 'Record care session'}
          back={id ? `/bed/${id}` : '/'}
        />

        {photoOnly && (
          <p className="text-sm text-muted-foreground">
            Add your own photos to this care session. You’ll be added to the people
            on it, and you can remove photos you added at any time.
          </p>
        )}

        {!photoOnly && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="when">When</Label>
              <Input
                id="when"
                type="datetime-local"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Activities — pick one or more</Label>
              <div className="flex flex-wrap gap-1.5">
                {activities.map((a) => {
                  const on = selectedActivityIds.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => toggleActivity(a.id)}
                      aria-pressed={on}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did you do? Anything else to flag?"
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label>
            Photos ({totalPhotos}/{MAX_PHOTOS})
          </Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          {totalPhotos > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {existingPhotos.map((p) => {
                // In photoOnly mode you can only remove photos you added. Full
                // edit (creator/admin) can remove any. RLS enforces this too.
                const canRemove = !photoOnly || p.createdBy === user?.id;
                return (
                  <div
                    key={`e-${p.photoId}`}
                    className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img src={p.publicUrl} alt="" className="h-full w-full object-cover" />
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => removeExistingPhoto(p.photoId)}
                        aria-label="Remove photo"
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-foreground/80 text-background hover:bg-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {photos.map((p) => (
                <div
                  key={`n-${p.id}`}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-md border bg-muted',
                    p.errorMsg ? 'border-destructive' : 'border-border'
                  )}
                >
                  {p.previewUrl ? (
                    <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-[10px]">Optimizing…</span>
                    </div>
                  )}
                  {p.errorMsg && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/70 p-1 text-center text-[10px] font-medium text-destructive-foreground">
                      {p.errorMsg}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeNewPhoto(p.id)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-foreground/80 text-background hover:bg-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={totalPhotos >= MAX_PHOTOS}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {totalPhotos === 0 ? 'Add photos' : 'Add more photos'}
          </Button>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <Button type="submit" disabled={busy || anyConverting} size="xl" className="w-full">
          {anyConverting
            ? 'Optimizing photos…'
            : stage === 'uploading'
            ? 'Uploading photos…'
            : stage === 'saving'
            ? 'Saving…'
            : stage === 'deleting'
            ? 'Deleting…'
            : photoOnly
            ? 'Save photos'
            : isEdit
            ? 'Save changes'
            : 'Save session'}
        </Button>

        {isEdit && !photoOnly && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete session
          </Button>
        )}
      </form>
    </div>
  );
}
