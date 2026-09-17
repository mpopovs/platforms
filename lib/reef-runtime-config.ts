/**
 * Living Reef viewer — runtime tunables.
 *
 * The reef is a fullscreen underwater scene where every child's colored
 * creature (uploaded through the normal worksheet → ArUco → texture pipeline)
 * swims in alive. The reef's *health* rises with recent coloring activity and
 * slowly fades when the room goes quiet, so each new group of children gets to
 * bring the reef back to life.
 *
 * All values here are safe to tweak without touching component code. This file
 * mirrors the convention of `viewer-runtime-config.ts`.
 */

// ─── Data polling ─────────────────────────────────────────────────────────────
/** How often to poll for new creatures (uploaded textures). */
export const REEF_POLL_INTERVAL_MS = 30_000;

// ─── Population ─────────────────────────────────────────────────────────────
/**
 * Maximum creatures rendered at once. Newest uploads win when over the cap.
 * Modern-GPU target, so this can be generous; drop it if FPS suffers on the
 * actual show machine.
 */
export const REEF_MAX_CREATURES = 40;

// ─── Reef health (recent-activity model) ──────────────────────────────────────
/**
 * Each recent upload contributes to a health score that decays exponentially.
 * With HALF_LIFE_MS = 8min, an upload's contribution halves every 8 minutes,
 * so the reef stays vibrant while children keep coloring and gently bleaches
 * back over ~20–30 min of inactivity.
 */
export const REEF_HEALTH_HALF_LIFE_MS = 8 * 60_000;
/**
 * Summed decayed contributions needed to reach full health (1.0). Roughly
 * "how many fresh colorings it takes to fully revive the reef".
 */
export const REEF_HEALTH_TARGET_SCORE = 6;
/**
 * Health never drops below this, so a long-idle reef still shows a faint,
 * hopeful amount of life rather than going fully dead/black.
 */
export const REEF_HEALTH_FLOOR = 0.12;
/** Seconds for the on-screen reef to visually ease toward a new health value. */
export const REEF_HEALTH_EASE_SECONDS = 6;

// ─── Motion ─────────────────────────────────────────────────────────────────
/** Baseline fish swim speed (world units / sec). */
export const REEF_FISH_SPEED = 0.9;
/** How long (ms) a freshly arrived creature takes to scale/fade in. */
export const REEF_ENTRANCE_MS = 1600;

// ─── Scene bounds (world units) ───────────────────────────────────────────────
/** Half-extents of the swimmable volume, centered on the origin. */
export const REEF_BOUNDS = { x: 7, y: 3.2, z: 3.5 } as const;

// ─── Creature kinds ───────────────────────────────────────────────────────────
export type CreatureKind = 'fish' | 'plant' | 'coral';

/**
 * Best-effort classification of a model into a reef creature kind from its
 * name. Everything unrecognized swims as a fish.
 */
export function classifyCreatureKind(modelName: string | undefined | null): CreatureKind {
  const n = (modelName || '').toLowerCase();
  if (/(plant|seaweed|kelp|algae|weed|grass|zāle|aug)/.test(n)) return 'plant';
  if (/(coral|anemone|sponge|reef|korall)/.test(n)) return 'coral';
  return 'fish';
}
