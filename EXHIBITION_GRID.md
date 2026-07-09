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
4. Configure each cell's **texture mode** and **rotation** (see below).
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
  - **Newest first** — jumps to the newest upload the moment it arrives.
  - **Cycle in order** — advances through uploads on a fixed interval.
  - **Random** — picks a random upload on a fixed interval.

A single grid can freely mix locked and user-uploads cells.

## Show-time controls (hotkeys)

While the fullscreen show page has focus:

| Key     | Action                                              |
| ------- | ---------------------------------------------------- |
| `Space` | Pause / resume rotation on every cell                |
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
