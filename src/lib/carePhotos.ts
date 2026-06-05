// Shared care-session photo upload path, used by both the full edit screen
// (RecordCareSession) and the inline "Add photo" control on a care card.
//
// Callers pass already-processed Files (HEIC→JPEG + downscale via processPhoto):
// the edit screen processes at selection time for previews, the inline adder
// processes just before calling here.

import { supabase } from './supabase';

export const PHOTO_BUCKET = 'care-photos';

export interface UploadedCarePhoto {
  id: number;
  storage_path: string;
}

export interface CarePhotoUploadResult {
  uploaded: UploadedCarePhoto[];
  // Human-readable reasons for any files that failed to upload (storage errors:
  // bucket missing, RLS denial, size cap, …). Successful files are still saved.
  failures: string[];
}

/**
 * Upload each file to the `care-photos` bucket and insert a care_session_photos
 * row per successful upload. Returns the inserted rows (with ids, for optimistic
 * rendering) plus any per-file upload failures.
 *
 * A DB trigger (migration 014) auto-joins the uploader to the session's face
 * pile. `created_by` defaults to auth.uid() server-side, so contributions are
 * always attributed to the real uploader.
 *
 * Throws only if the DB insert itself fails; per-file storage failures are
 * collected in `failures` so a partial batch still saves what it can.
 */
export async function uploadCarePhotos(
  sessionId: string,
  files: File[]
): Promise<CarePhotoUploadResult> {
  if (files.length === 0) return { uploaded: [], failures: [] };

  const uploads = files.map(async (file) => {
    const extFromName = file.name.includes('.') ? file.name.split('.').pop() : '';
    const extFromType = file.type.split('/')[1];
    const ext = (extFromName || extFromType || 'jpg').toLowerCase();
    const path = `${sessionId}/${crypto.randomUUID()}.${ext}`;
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
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

  let uploaded: UploadedCarePhoto[] = [];
  if (successfulPaths.length > 0) {
    const { data, error: photoErr } = await supabase
      .from('care_session_photos')
      .insert(successfulPaths.map((p) => ({ care_session_id: sessionId, storage_path: p })))
      .select('id, storage_path');
    if (photoErr) {
      throw new Error(`Photos uploaded but the database insert failed: ${photoErr.message}`);
    }
    uploaded = data ?? [];
  }

  return { uploaded, failures };
}

/** Public URL for a stored care photo. */
export function carePhotoUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
