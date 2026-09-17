import type { ExhibitionConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { getStorageThumbnailUrl } from '@/lib/storage';
import { resolveCellTexture } from './use-cell-texture';

export interface ExhibitionAsset {
  kind: 'model' | 'texture';
  url: string;
  modelId: string;
  textureId: string;
}

function isNetworkUrl(url: string | null | undefined): url is string {
  return !!url && !url.startsWith('blob:') && !url.startsWith('data:') && !url.startsWith('local://');
}

/**
 * Every file the exhibition can display: each cell's model, and every texture
 * it can show at the grid's starting quality level — the locked texture for
 * 'original-locked' cells, the whole upload pool (or the template when there
 * are no uploads) for 'user-uploads' cells. URLs must match exactly what the
 * grid requests (see resolveCellTexture), since the cache is keyed by URL.
 */
export function collectExhibitionAssets(
  config: Pick<ExhibitionConfig, 'cells' | 'tunables'>,
  modelsById: Record<string, ViewerModelWithAllTextures>
): ExhibitionAsset[] {
  const { tunables } = config;
  const maxDim = tunables.qualityStepDownTextureDims[0] ?? tunables.defaultTextureMaxDim;
  const assets = new Map<string, ExhibitionAsset>();
  const add = (asset: ExhibitionAsset) => {
    if (isNetworkUrl(asset.url) && !assets.has(asset.url)) assets.set(asset.url, asset);
  };

  for (const cell of config.cells) {
    const model = modelsById[cell.modelId];
    if (!model) continue;
    add({ kind: 'model', url: model.model_file_url, modelId: model.id, textureId: '' });

    if (cell.textureMode === 'user-uploads' && model.textures.length > 0) {
      // Same URL resolveCellTexture builds for each upload, without re-sorting the pool per index.
      for (const texture of model.textures) {
        const url = getStorageThumbnailUrl(texture.corrected_texture_url, { width: maxDim, quality: tunables.textureQuality });
        add({ kind: 'texture', url, modelId: model.id, textureId: texture.id });
      }
    } else {
      const { url, textureId } = resolveCellTexture(cell, model, 0, maxDim, tunables.textureQuality);
      if (url) add({ kind: 'texture', url, modelId: model.id, textureId });
    }
  }

  return Array.from(assets.values());
}
