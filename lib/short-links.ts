/**
 * Short link generation for upload URLs
 * Converts long URLs like /upload/viewer_xxx/model_yyy to /u/abc123
 */

import { customAlphabet } from 'nanoid';

// Use URL-safe alphabet without confusing characters (0, O, I, l)
// 4 characters = 57^4 = 10.5 million combinations
const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 4);

/**
 * Generate a short code for a model
 */
export function generateShortCode(): string {
  return nanoid();
}

/**
 * Create short upload URL
 */
export function createShortUploadUrl(baseUrl: string, shortCode: string): string {
  return `${baseUrl}/u/${shortCode}`;
}

/**
 * Create short viewer URL
 */
export function createShortViewerUrl(baseUrl: string, shortCode: string): string {
  return `${baseUrl}/v/${shortCode}`;
}

/**
 * Parse upload URL to extract viewerId and modelId
 */
export function parseUploadUrl(url: string): { viewerId: string; modelId: string } | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Expected: ['upload', viewerId, modelId]
    if (pathParts[0] === 'upload' && pathParts[1] && pathParts[2]) {
      return {
        viewerId: pathParts[1],
        modelId: pathParts[2]
      };
    }

    return null;
  } catch {
    return null;
  }
}
