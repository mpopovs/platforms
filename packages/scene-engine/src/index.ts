/**
 * @claypixels/scene-engine
 *
 * The hot spring player and layout editor (three.js r186, WebGPU with WebGL
 * fallback), packaged for the Scene editor (/admin/scenes) and the player.
 * Browser-only: import it dynamically from a client component.
 */
export { SCENE_FORMAT_VERSION } from './manifest';
export type { SceneManifest } from './manifest';

export interface MountOptions {
  /** URL prefix all scene files are read from, e.g. /api/scenes/<id>/files/draft */
  base: string;
  /** Where capybara GLBs live; defaults to `${base}/capys` */
  capysBase?: string;
  /** Show the layout editor */
  edit?: boolean;
  /** Debug flags: webgl, backdrop, camera, splat, parallax */
  params?: Record<string, string | number | boolean | undefined>;
  /** Save a file of the scene (editor Files tab and Save). Returns a time label. */
  saveFile?: (name: string, body: Blob | string, type: string) => Promise<string>;
  /** Depth model for "2.5D from a picture" (ONNX, Depth Anything V2 Small); defaults to Hugging Face */
  depthModelUrl?: string;
  /** AI fill model (LaMa ONNX, 512 x 512) for what is hidden behind objects; defaults to Hugging Face */
  inpaintModelUrl?: string;
  /** Where onnxruntime-web loads its .wasm/.mjs files from; defaults to jsDelivr */
  ortWasmPaths?: string;
}

export interface SceneHandle {
  ready: Promise<void>;
  destroy(): void;
}

export async function mountScene(container: HTMLElement, options: MountOptions): Promise<SceneHandle> {
  const mod = (await import('./engine/main.js')) as unknown as { mountScene: (c: HTMLElement, o: MountOptions) => SceneHandle };
  return mod.mountScene(container, options);
}
