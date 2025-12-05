/**
 * Texture processing types for ArUco marker detection and cropping
 */

export interface ProcessedTexture {
  dataUrl: string;
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
}

export interface TextureProcessingOptions {
  targetSize?: number;
  enableQRDetection?: boolean;
  manualCorners?: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
}
