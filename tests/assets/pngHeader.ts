// Minimal PNG header reader (IHDR chunk only). Test-only tooling for
// tests/assets/environmentAssetFiles.test.ts — not a runtime module, so it
// deliberately does not depend on any image-processing library the project
// doesn't already have.
export interface PngHeaderInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  // PNG color types 4 (grayscale+alpha) and 6 (truecolor+alpha) carry a real
  // per-pixel alpha channel. Type 3 (palette) can carry a tRNS chunk for
  // color-key/partial-palette transparency, which is NOT a full alpha
  // channel and is intentionally NOT reported as `hasAlpha` here.
  hasAlpha: boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngHeader(buf: Buffer): PngHeaderInfo {
  if (buf.length < 29 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a decodable PNG file: missing the 8-byte PNG signature.');
  }
  const chunkType = buf.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    throw new Error(`Not a decodable PNG file: expected an IHDR chunk first, found "${chunkType}".`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  return { width, height, bitDepth, colorType, hasAlpha: colorType === 4 || colorType === 6 };
}
