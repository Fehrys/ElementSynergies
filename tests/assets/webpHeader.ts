// Minimal WebP header reader (RIFF container: VP8 / VP8L / VP8X chunks).
// Test-only tooling for tests/assets/environmentAssetFiles.test.ts — mirrors
// pngHeader.ts's former scope (dimensions only, no external image-processing
// lib), extended with a header-level alpha signal (see `hasAlpha` below).
export interface WebpHeaderInfo {
  width: number;
  height: number;
  // Whether the container's own header/bitstream flags an alpha channel.
  // This is read straight out of the header bits already being parsed for
  // width/height — it is NOT a full pixel decode, so it cannot prove every
  // pixel is fully opaque. What it DOES prove:
  // - 'VP8 ' (simple lossy): the format has no alpha plane at all, so this
  //   is always `false` — a hard guarantee.
  // - 'VP8L' (lossless): the spec's `alpha_is_used` bit is written by the
  //   encoder from the source pixels; `false` here is a strong "no alpha
  //   channel was encoded" signal. A `true` would mean an alpha channel
  //   exists (not necessarily that any pixel is actually transparent) — not
  //   produced by either current lot-01 asset.
  // - 'VP8X' (extended container): the flags byte's ALPHA bit says whether
  //   an ALPH chunk is present elsewhere in the file.
  // Confirming true, uniform full-opacity beyond this header signal would
  // require a full pixel decode, which this minimal reader deliberately does
  // not do (see tests/assets/environmentAssetFiles.test.ts for how the
  // result is used and documented).
  hasAlpha: boolean;
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
      // Bit layout after the signature byte (LE 32-bit): 14 bits width-1,
      // 14 bits height-1, 1 bit alpha_is_used, 3 bits version (reserved 0).
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        hasAlpha: ((bits >> 28) & 0x1) === 1,
      };
    }
    case 'VP8 ': {
      // 3-byte frame tag, then the 3-byte start code (0x9d 0x01 0x2a), then
      // two 2-byte LE dimensions (low 14 bits = size, top 2 bits = scale).
      // The simple lossy format never carries an alpha plane.
      if (chunkData.readUInt8(3) !== 0x9d || chunkData.readUInt8(4) !== 0x01 || chunkData.readUInt8(5) !== 0x2a) {
        throw new Error('Not a decodable WebP file: invalid VP8 start code.');
      }
      return {
        width: chunkData.readUInt16LE(6) & 0x3fff,
        height: chunkData.readUInt16LE(8) & 0x3fff,
        hasAlpha: false,
      };
    }
    case 'VP8X': {
      // Chunk data layout: 1 flags byte, 3 reserved bytes, 3-byte width-1,
      // 3-byte height-1. Flags byte bits (MSB→LSB): Rsv Rsv ICC Alpha Exif
      // XMP Anim Rsv — the Alpha bit (0x10) says an ALPH chunk is present.
      const flags = chunkData.readUInt8(0);
      return {
        width: chunkData.readUIntLE(4, 3) + 1,
        height: chunkData.readUIntLE(7, 3) + 1,
        hasAlpha: (flags & 0x10) !== 0,
      };
    }
    default:
      throw new Error(`Not a decodable WebP file: unsupported chunk type "${fourCC}".`);
  }
}
