# Exhibition Grid

A fullscreen, multi-model "split-screen" show mode for displaying up to 20
3D models simultaneously on a single computer connected to a gallery/show
display — separate from the regular single-model `/viewer` and the TV kiosk
mode, and fully additive (it doesn't change either of those).

## Setting up an exhibition

1. Sign in and open **Exhibition Grid** from the profile menu (`/admin/exhibition`).
2. Pick a **Layout** — uniform grids (`1x2` up to `4x5` = 20 cells) or an
   asymmetric "hero + N" layout (one large cell plus several smaller ones).
3. Click a grid cell, then pick a **Viewer** and **Model** for it in the side
   panel. Repeat for every cell you want to use — you don't have to fill the
   whole grid.
4. Configure each cell's **texture mode** and **rotation** (see below), and
   optionally adjust the **Object size** and **Waterfall** scroll for the
   whole grid.
5. Check the **live preview** at the bottom of the page — it renders the
   actual grid at a smaller scale.
6. Give the exhibition a **Name** and click **Save**. A show URL appears:

   ```
   https://claypixels.eu/exhibition?token=<long-random-token>
   ```

7. Open that URL **fullscreen** (press `F` or your browser's fullscreen
   shortcut) on the gallery computer. No login is required there — the token
   in the URL is the only credential, so keep it private. Use **Regenerate
   token** in the curation page if you ever need to invalidate an old link.
8. You can reload/reopen this show URL any time — the grid preloads every
   model and texture (with a progress screen) before it appears, so nothing
   pops in mid-load.

## Texture modes (per cell)

Each cell independently shows one of:

- **Original (locked)** — always shows one specific texture you pick in the
  curation UI (or the model's default template if you don't pick one). This
  is enforced in code, not just the UI: a locked cell never reads from the
  visitor-upload pool, so it can't accidentally start cycling community
  photos mid-show.
- **User uploads** — cycles through the model's uploaded textures pool,
  refreshed live during the show. Per cell you choose:
  - **Newest first** — shows the newest upload and changes only when a new
    one arrives (no timer).
  - **Cycle in order** — advances through uploads every
    **Change texture every (seconds)**.
  - **Random** — picks a random upload every
    **Change texture every (seconds)**.

  Each grid tile shows its timing, e.g. `uploads · 12s` or `uploads · newest`.

A single grid can freely mix locked and user-uploads cells.

### Random timing

Cells with the same interval normally change texture at the same moment. Tick
**Texture change timing → Random** to make every change wait a random 50–150%
of that cell's own interval (e.g. 6–18 s for 12 s), so objects change at
different moments. On average each cell still changes about as often as its
interval says.

## Object size

The **Object size** slider (below the layout picker) makes every model in the
grid bigger or smaller at once, from 20% to 300% of its normal size. At 100%
each model is automatically fitted to its cell; above that, large models can
be cropped at their cell's edges.

## Background colour

**Background** (next to Object size) sets the colour behind the models and in
the thin gaps between cells. The default is black.

## Blink on texture change

Tick **Blink on texture change** to make a model disappear briefly whenever its
cell switches to a different texture (cycling, a new upload, or the `N` hotkey),
then reappear with the new texture. **Blink length** sets how many frames the
cell stays empty (showing the background colour), from 1 to 120. The readout
gives the time at 60 fps; on a faster display the same number of frames is
shorter.

Locked cells don't blink, and neither do automatic texture-quality changes
(same texture at another resolution). With the option off, textures swap
without any gap.

## Waterfall scroll

Tick **Waterfall** to make the whole grid slide downward in an endless loop:
rows leaving the bottom of the screen come back in at the top.

- **Waterfall speed** sets how fast it moves. The readout shows the time for
  one full loop (at the default speed and no space, 20s).
- **Space between loops** adds empty space after the last row before the grid
  repeats, from none (seamless) up to a full screen height. Adding space
  doesn't change how fast the models move; each loop just takes longer.

Both are relative to the screen height, so the live preview moves exactly like
the fullscreen show.

Remember to click **Save** — open show pages pick up size and waterfall
changes when they're reloaded.

## Working without internet

The show page saves everything it can display in the browser, so a lost
connection doesn't interrupt the show:

- While online it downloads every model and **every** texture a cell can show
  — including all uploads a "User uploads" cell cycles through, not just the
  one on screen — plus a copy of the exhibition settings and model lists.
- If the connection drops, the show keeps running from those saved files.
  Uploads made while offline appear once the connection returns (it's checked
  every 20 seconds).
- The page can also be **reloaded without internet**, as long as it was opened
  on that computer while online before. (Reloading offline relies on the
  service worker, which is only active in production builds, not `next dev`.)
- A deleted exhibition, or a show URL whose token was regenerated, stops
  working the next time the page loads while online.

Saved content is kept for at least 7 days. The show re-confirms what it uses
while it runs online, and only removes files it hasn't needed for 7 days (for
example deleted uploads) — never while offline.

### Connection indicator

Tick **Connection indicator** on the curation page to show a small dot in the
bottom-left corner of the show (and the live preview):

| Dot   | Meaning                                                        |
| ----- | -------------------------------------------------------------- |
| Green | Online — everything is saved for offline use                  |
| Amber | Online — still saving content (don't rely on offline yet)     |
| Red   | Offline — showing saved content                                |

Hover the dot for details (e.g. how many files are saved). Untick the box
and save to hide it.

## Show-time controls (hotkeys)

While the fullscreen show page has focus:

| Key     | Action                                              |
| ------- | ---------------------------------------------------- |
| `Space` | Pause / resume rotation on every cell and the waterfall scroll |
| `N`     | Force every "user uploads" cell to its next texture   |
| `F`     | Toggle browser fullscreen                             |

The mouse cursor auto-hides after a few seconds of no movement and
reappears on the next move.

## Performance notes

- Rendering uses **one shared WebGL context** for all cells (via
  `@react-three/drei`'s `View`), not one canvas per model — this avoids
  hitting the browser's WebGL-context limit at higher cell counts.
- Textures are requested through the self-hosted Supabase image-transform
  endpoint at a capped resolution (2048px by default) instead of full
  resolution, and every model/texture is preloaded into the browser's
  IndexedDB cache before the grid appears.
- If the frame rate drops below the configured floor (30fps by default),
  the grid automatically steps **one cell at a time** down a texture-
  resolution ladder (2048 → 1024 → 768 → 512px) rather than degrading
  everything at once, and steps cells back up once frame rate recovers.
- Use `npm run exhibition-stress-test -- --user-id <uuid>` to generate a
  20-cell exhibition (reusing/repeating your existing models if you have
  fewer than 20) so you can rehearse on the actual show computer and watch
  how it behaves under full load before the real event.

## For developers

- Types & tunables: [lib/types/exhibition.ts](lib/types/exhibition.ts)
- Data access: [lib/exhibition.ts](lib/exhibition.ts)
- Grid renderer: [components/exhibition/](components/exhibition/)
- Show route: [app/exhibition/page.tsx](app/exhibition/page.tsx)
- Curation UI: [app/admin/exhibition/](app/admin/exhibition/)
- DB migration (must be applied manually via the Supabase SQL editor, like
  the other migrations in this repo):
  [supabase/migrations/20260709000001_create_exhibition_configs.sql](supabase/migrations/20260709000001_create_exhibition_configs.sql)
