/**
 * Texture processing types for ArUco marker detection and cropping
 */

export interface ProcessedTexture {
  dataUrl: string;
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
  /** IDs of all ArUco markers detected in the image (used for model auto-detection in Mode 2) */
  detectedMarkerIds?: number[];
  /** The resolved marker base ID (lowest multiple-of-4 base whose full group was found) */
  detectedMarkerBase?: number;
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
