/**
 * imageUpload — send a compressed base64 data URL to the R2-backed Pages Function
 * and get back a public CDN URL to store on the menu doc (instead of the base64).
 *
 * Keeping images out of Firestore is what lets the customer `config/publicMenu`
 * bundle stay under the 1 MiB document limit. See functions/api/upload-image.js.
 */

import { auth } from './firebase';

const UPLOAD_ENDPOINT = '/api/upload-image';

/**
 * @param {string} dataUrl  a base64 data URL, e.g. "data:image/jpeg;base64,...."
 * @returns {Promise<string>} the public R2 URL of the stored image
 * @throws if the upload endpoint is unavailable or returns an error
 */
export async function uploadImageToR2(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('uploadImageToR2: expected a base64 data URL');
  }

  // The endpoint requires a valid Firebase ID token from this project.
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('ยังไม่ได้เข้าสู่ระบบ — ลองรีเฟรชหน้าแล้วอัปโหลดใหม่');

  const res = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dataUrl }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body — keep the status code
    }
    throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${detail}`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('อัปโหลดรูปไม่สำเร็จ: ไม่ได้รับ URL กลับมา');
  return url;
}

/** True if the value is an inline base64 image (i.e. needs migrating to R2). */
export function isBase64Image(value) {
  return typeof value === 'string' && value.startsWith('data:');
}
