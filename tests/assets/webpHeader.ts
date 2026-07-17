// Minimal WebP header reader (RIFF container: VP8 / VP8L / VP8X chunks).
// Test-only tooling for tests/assets/environmentAssetFiles.test.ts — mirrors
// pngHeader.ts's scope (dimensions only, no external image-processing lib).
export interface WebpHeaderInfo {
  width: number;
  height: number;
}

const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');

export function readWebpHeader(buf: Buffer): WebpHeaderInfo {
  if (buf.length < 30 || !buf.subarray(0, 4).equals(RIFF_SIGNATURE) || !buf.subarray(8, 12).equals(WEBP_SIGNATURE)) {
    throw new Error('Not a decodable WebP file: missing the RIFF/WEBP signature.');
  }
  const fourCC = buf.subarray(12, 16).toString('ascii');
  const chunkData = buf.subarray(20);
  switch (fourCC) {
    case 'VP8L': {
      if (chunkData.readUInt8(0) !== 0x2f) {
        throw new Error('Not a decodable WebP file: invalid VP8L signature byte.');
      }
      const bits = chunkData.readUInt32LE(1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    case 'VP8 ': {
      // 3-byte frame tag, then the 3-byte start code (0x9d 0x01 0x2a), then
      // two 2-byte LE dimensions (low 14 bits = size, top 2 bits = scale).
      if (chunkData.readUInt8(3) !== 0x9d || chunkData.readUInt8(4) !== 0x01 || chunkData.readUInt8(5) !== 0x2a) {
        throw new Error('Not a decodable WebP file: invalid VP8 start code.');
      }
      return { width: chunkData.readUInt16LE(6) & 0x3fff, height: chunkData.readUInt16LE(8) & 0x3fff };
    }
    case 'VP8X':
      return { width: chunkData.readUIntLE(4, 3) + 1, height: chunkData.readUIntLE(7, 3) + 1 };
    default:
      throw new Error(`Not a decodable WebP file: unsupported chunk type "${fourCC}".`);
  }
}
