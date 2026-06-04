// Share a logged care session out to WhatsApp (or any app), preferring to
// attach the photo itself via the Web Share API, with graceful fallbacks.

interface ShareCareArgs {
  /** Caption text (without the URL). */
  text: string;
  /** Link back to the bed in the app. */
  url: string;
  /** Public URL of a photo to attach, if any. */
  photoUrl?: string | null;
  fileName?: string;
}

/**
 * Tries, in order:
 *  1. Native share sheet WITH the photo file (so WhatsApp gets the image) —
 *     only when the platform reports it can share files.
 *  2. Native share sheet with text + link (no image).
 *  3. WhatsApp click-to-chat with text + link (text only).
 * Returns silently if the user cancels.
 */
export async function shareCareSession({ text, url, photoUrl, fileName = 'care.jpg' }: ShareCareArgs): Promise<void> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  // The link is embedded in the message text (no separate `url` field), so the
  // caption and link always travel together — apps like WhatsApp don't drop one.
  const message = `${text}\n${url}`;

  // 1. Share the photo as a file when supported.
  if (photoUrl && nav?.canShare) {
    try {
      const res = await fetch(photoUrl);
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], text: message });
          return;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // user dismissed
      // otherwise fall through to text sharing
    }
  }

  // 2. Native share sheet, text only (link embedded in the text).
  if (nav?.share) {
    try {
      await nav.share({ text: message });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // fall through
    }
  }

  // 3. WhatsApp click-to-chat.
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
