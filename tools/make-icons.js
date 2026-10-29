// Generates icons/icon-{192,512}.png with no dependencies: black tile, three connected neon dots.
// Run: node tools/make-icons.js
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function icon(size) {
  const bg = [0x07, 0x08, 0x0a], fg = [0x39, 0xff, 0x88];
  // dots in a "connect the dots" path, coordinates in 0..1 (kept inside the maskable safe zone)
  const dots = [[0.34, 0.36], [0.66, 0.46], [0.40, 0.66]];
  const r = 0.075, w = 0.028;
  const segDist = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size, py = (y + 0.5) / size;
      let d = Infinity;
      dots.forEach((p) => { d = Math.min(d, Math.hypot(px - p[0], py - p[1]) - r); });
      d = Math.min(d, segDist(px, py, dots[0], dots[1]) - w / 2, segDist(px, py, dots[1], dots[2]) - w / 2);
      const a = Math.max(0, Math.min(1, 0.5 - d * size)); // 1px antialias
      for (let c = 0; c < 3; c++) row.push(Math.round(bg[c] + (fg[c] - bg[c]) * a));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
[192, 512].forEach((s) => fs.writeFileSync(path.join(out, `icon-${s}.png`), icon(s)));
console.log('icons written to', out);
