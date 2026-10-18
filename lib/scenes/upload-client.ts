'use client';

import { createClient } from '@/lib/supabase/client';
import type { UploadTarget } from './storage';

/** sha256 of a blob, hex. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Send bytes straight to storage (never through our server). */
export async function uploadToTarget(target: UploadTarget, blob: Blob, contentType: string): Promise<void> {
  if (target.kind === 'put') {
    const res = await fetch(target.url, { method: 'PUT', headers: target.headers, body: blob });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return;
  }
  const { error } = await createClient()
    .storage.from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, blob, { contentType, cacheControl: '31536000' });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}
