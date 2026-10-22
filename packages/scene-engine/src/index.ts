/**
 * @claypixels/scene-engine
 *
 * Shared three.js scene player and editor core, used by the Scene editor in
 * the claypixels admin (/admin/scenes) and the consumer player (/d/[code]).
 *
 * M0 only creates the package. M1 moves the hot spring player and editor
 * (main.js, editor.js, nav.js, backdrop.js, png16.js) here and swaps their
 * put()/save() file hooks for storage uploads.
 */

/** Version of the scene.json format this engine reads and writes. */
export const SCENE_FORMAT_VERSION = 1 as const;
