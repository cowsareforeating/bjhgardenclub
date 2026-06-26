// TEMPORARY — delete this file and the /admin/backfill-thumbs route in App.tsx
// once the backfill is confirmed complete.

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { processPhoto } from '../lib/image';
import { PHOTO_BUCKET } from '../lib/carePhotos';
import { Button } from '../components/ui/button';

const CONCURRENCY = 3;

function thumbPathFor(fullPath: string): string {
  const slash = fullPath.lastIndexOf('/');
  return slash === -1
    ? `thumbs/${fullPath}`
    : `${fullPath.slice(0, slash)}/thumbs/${fullPath.slice(slash + 1)}`;
}

type JobStatus = 'ok' | 'skipped' | 'error';
interface Job { path: string; status: JobStatus; msg?: string }

type RunState = 'idle' | 'running' | 'done';

export function BackfillThumbs() {
  const { isAdmin, loading } = useAuth();
  const [runState, setRunState] = useState<RunState>('idle');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  function push(job: Job) {
    setJobs((prev) => [...prev, job]);
  }

  async function processOne(path: string): Promise<Job> {
    const thumbPath = thumbPathFor(path);
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .download(path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed');

      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
      const thumb = await processPhoto(file, 300, 0.75);

      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(thumbPath, thumb, { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' });

      if (upErr) {
        // Supabase returns "The resource already exists" or statusCode 409 for duplicates.
        const isDuplicate =
          upErr.message?.toLowerCase().includes('already exists') ||
          (upErr as any).statusCode === '409' ||
          (upErr as any).error === 'Duplicate';
        if (isDuplicate) return { path, status: 'skipped', msg: 'already exists' };
        throw new Error(upErr.message);
      }

      return { path, status: 'ok' };
    } catch (e) {
      return { path, status: 'error', msg: String(e) };
    }
  }

  async function run() {
    setRunState('running');
    setJobs([]);

    const { data: photos, error } = await supabase
      .from('care_session_photos')
      .select('storage_path');

    if (error || !photos) {
      push({ path: '(query)', status: 'error', msg: error?.message ?? 'no data' });
      setRunState('done');
      return;
    }

    const paths = photos.map((p: { storage_path: string }) => p.storage_path);
    setTotal(paths.length);

    // Pool of CONCURRENCY workers running in parallel.
    const queue = [...paths];
    async function worker() {
      while (queue.length > 0) {
        const path = queue.shift()!;
        push(await processOne(path));
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunState('done');
  }

  const ok = jobs.filter((j) => j.status === 'ok').length;
  const skipped = jobs.filter((j) => j.status === 'skipped').length;
  const errors = jobs.filter((j) => j.status === 'error');
  const done = jobs.length;

  return (
    <div className="mx-auto max-w-lg space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold">Backfill photo thumbnails</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generates 300px thumbnails for all existing care session photos. Already-existing
          thumbs are skipped. Safe to re-run.
        </p>
      </div>

      {runState === 'idle' && (
        <Button onClick={run}>Start backfill</Button>
      )}

      {runState === 'running' && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {done} / {total} processed…
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {ok} created · {skipped} skipped · {errors.length} errors
          </p>
        </div>
      )}

      {runState === 'done' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Done — {ok} thumbnails created, {skipped} already existed
            {errors.length > 0 ? `, ${errors.length} errors` : ''}.
          </p>
          {errors.length > 0 && (
            <ul className="space-y-1 rounded-md bg-destructive/10 p-3">
              {errors.map((e, i) => (
                <li key={i} className="break-all text-xs text-destructive">
                  {e.path}: {e.msg}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            You can now delete <code>src/screens/BackfillThumbs.tsx</code> and remove the
            route from <code>App.tsx</code>.
          </p>
        </div>
      )}
    </div>
  );
}
