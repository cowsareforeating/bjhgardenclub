import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isHeic, convertHeicToJpeg } from '../lib/heic';
import type { ActivityType } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';

const PHOTO_BUCKET = 'care-photos';
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
  previewUrl: string | null; // null while a HEIC is converting
  converting: boolean;
  errorMsg?: string;
}

interface ExistingPhoto {
  photoId: number;
  storagePath: string;
  publicUrl: string;
}

export function RecordCareSession() {
  const { id, sessionId } = useParams<{ id: string; sessionId?: string }>();
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
          '*, care_session_activities(activity_type_id), care_session_photos(id, storage_path)'
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
        (data.care_session_photos ?? []).map((p: { id: number; storage_path: string }) => ({
          photoId: p.id,
          storagePath: p.storage_path,
          publicUrl: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(p.storage_path).data.publicUrl
        }))
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

    const staged: NewPhoto[] = incoming.map((file) => {
      const heic = isHeic(file);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: heic ? null : URL.createObjectURL(file),
        converting: heic
      };
    });
    setPhotos((cur) => [...cur, ...staged]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    staged
      .filter((p) => p.converting)
      .forEach((p) => {
        runHeicConversion(p);
      });
  };

  const runHeicConversion = async (p: NewPhoto) => {
    try {
      const converted = await convertHeicToJpeg(p.file);
      const previewUrl = URL.createObjectURL(converted);
      setPhotos((cur) =>
        cur.map((x) =>
          x.id === p.id ? { ...x, file: converted, previewUrl, converting: false } : x
        )
      );
    } catch {
      setPhotos((cur) =>
        cur.map((x) =>
          x.id === p.id
            ? {
                ...x,
                converting: false,
                errorMsg: 'Could not convert HEIC — remove this photo or try again.'
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
      setError('Hold on — photos are still converting.');
      return;
    }

    const usableNewPhotos = photos.filter((p) => !p.errorMsg);
    const performedIso = new Date(performedAt).toISOString();

    setStage('saving');

    // 1. Insert or update the care_session.
    let workingId: string;
    if (isEdit && sessionId) {
      const { error: updErr } = await supabase
        .from('care_sessions')
        .update({ notes: notes.trim() || null, performed_at: performedIso })
        .eq('id', sessionId);
      if (updErr) {
        setStage('idle');
        setError(updErr.message);
        return;
      }
      workingId = sessionId;
    } else {
      const { data: session, error: insertErr } = await supabase
        .from('care_sessions')
        .insert({
          tree_bed_id: id,
          notes: notes.trim() || null,
          performed_at: performedIso
        })
        .select('id')
        .single();
      if (insertErr || !session) {
        setStage('idle');
        setError(insertErr?.message ?? 'Could not save session.');
        return;
      }
      workingId = session.id;
    }

    // 2. Replace activity assignments. Cheaper than diffing; audit still records.
    if (isEdit) {
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
    if (selectedActivityIds.length > 0) {
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

    // 4. Upload new photos.
    if (usableNewPhotos.length > 0) {
      setStage('uploading');
      const uploads = usableNewPhotos.map(async ({ file }) => {
        const extFromName = file.name.includes('.') ? file.name.split('.').pop() : '';
        const extFromType = file.type.split('/')[1];
        const ext = (extFromName || extFromType || 'jpg').toLowerCase();
        const path = `${workingId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        return path;
      });

      const results = await Promise.allSettled(uploads);
      const successfulPaths = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value);
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );

      if (successfulPaths.length > 0) {
        const { error: photoErr } = await supabase
          .from('care_session_photos')
          .insert(successfulPaths.map((p) => ({ care_session_id: workingId, storage_path: p })));
        if (photoErr) {
          setStage('idle');
          setError(`Photos uploaded but the database insert failed: ${photoErr.message}`);
          return;
        }
      }

      if (failures.length > 0) {
        // Surface the actual Supabase error — "Bucket not found", RLS denial,
        // file-size cap, etc. — instead of a generic count.
        const firstReason =
          failures[0].reason instanceof Error
            ? failures[0].reason.message
            : String(failures[0].reason);
        // Log every failure to the console for further debugging.
        // eslint-disable-next-line no-console
        failures.forEach((f) => console.error('Photo upload failed:', f.reason));
        setStage('idle');
        setError(
          `${failures.length} photo${failures.length === 1 ? '' : 's'} failed to upload: ${firstReason}`
        );
        return;
      }
    }

    setStage('idle');
    nav(`/bed/${id}`);
  };

  const busy = stage !== 'idle';
  const anyConverting = photos.some((p) => p.converting);

  if (loading) return <Spinner label="Loading session…" />;

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-4 p-4 pb-8">
        <PageHeader
          title={isEdit ? 'Edit care session' : 'Record care session'}
          back={id ? `/bed/${id}` : '/'}
        />

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
              {existingPhotos.map((p) => (
                <div
                  key={`e-${p.photoId}`}
                  className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                >
                  <img src={p.publicUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExistingPhoto(p.photoId)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-foreground/80 text-background hover:bg-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
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
                      <span className="text-[10px]">Converting…</span>
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
            ? 'Converting photos…'
            : stage === 'uploading'
            ? 'Uploading photos…'
            : stage === 'saving'
            ? 'Saving…'
            : stage === 'deleting'
            ? 'Deleting…'
            : isEdit
            ? 'Save changes'
            : 'Save session'}
        </Button>

        {isEdit && (
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
