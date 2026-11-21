import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function encodeRawPixelsToPng(
  width: number,
  height: number,
  channels: 3 | 4,
  rawPixels: Buffer
): Buffer {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w < 1 || h < 1 || w > 256 || h > 256) {
    throw new Error('Invalid image dimensions (must be 1..256)');
  }
  const expectedBytes = w * h * channels;
  if (rawPixels.length < expectedBytes) {
    throw new Error(`Incomplete pixel buffer: got ${rawPixels.length}, expected ${expectedBytes}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = channels === 4 ? 6 : 2; // 6 = RGBA, 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = w * channels;
  const scanlines = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const dstOff = y * (stride + 1);
    scanlines[dstOff] = 0; // filter: None
    rawPixels.copy(scanlines, dstOff + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}
