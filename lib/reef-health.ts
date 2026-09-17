/**
 * Reef health — recent-activity model.
 *
 * Health ∈ [floor, 1]. Each upload contributes a value that decays
 * exponentially with age, so the reef thrives while children keep coloring and
 * slowly bleaches back toward the floor when activity stops. See
 * `reef-runtime-config.ts` for the tunables.
 */

import {
  REEF_HEALTH_HALF_LIFE_MS,
  REEF_HEALTH_TARGET_SCORE,
  REEF_HEALTH_FLOOR,
} from './reef-runtime-config';

export interface ReefHealthOptions {
  halfLifeMs?: number;
  targetScore?: number;
  floor?: number;
  now?: number;
}

/**
 * Compute reef health from the timestamps (ms since epoch) of recent uploads.
 * Future-dated and invalid timestamps are ignored.
 */
export function computeReefHealth(
  uploadTimestamps: number[],
  options: ReefHealthOptions = {},
): number {
  const {
    halfLifeMs = REEF_HEALTH_HALF_LIFE_MS,
    targetScore = REEF_HEALTH_TARGET_SCORE,
    floor = REEF_HEALTH_FLOOR,
    now = Date.now(),
  } = options;

  const decayConst = Math.LN2 / halfLifeMs;
  let score = 0;

  for (const t of uploadTimestamps) {
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (age < 0) continue; // future timestamp — ignore
    score += Math.exp(-decayConst * age);
  }

  const normalized = targetScore > 0 ? score / targetScore : 0;
  return Math.min(1, Math.max(floor, normalized));
}

/** Parse an ISO/string/number timestamp to ms; returns NaN when unparseable. */
export function toMillis(value: string | number | null | undefined): number {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}
