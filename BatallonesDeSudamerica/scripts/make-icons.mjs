// Genera iconos PNG (sin dependencias) con un escudo voxel sobre fondo azul noche.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Diseño: fondo degradado, sol, silueta voxel de Sudamérica en verde y tres estandartes.
const SA = [
  '....XXXX........', '...XXXXXXX......', '..XXXXXXXXXX....', '..XXXXXXXXXXX...', '...XXXXXXXXXXX..', '...XXXXXXXXXXX..',
  '....XXXXXXXXXX..', '....XXXXXXXXX...', '....XXXXXXXX....', '.....XXXXXX.....', '.....XXXXX......', '......XXXX......',
  '......XXX.......', '......XX........', '......XX........', '.......X........',
];
function pixel(u, v) {
  let r = 10 + 40 * (1 - v), g = 20 + 60 * (1 - v), b = 60 + 90 * (1 - v), a = 255;
  const gx = Math.floor((u - 0.12) / 0.76 * 16), gy = Math.floor((v - 0.1) / 0.8 * 16);
  const dsun = Math.hypot(u - 0.78, v - 0.2);
  if (dsun < 0.09) { r = 255; g = 209; b = 102; }
  if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16 && SA[gy][gx] === 'X') {
    const shade = 0.75 + ((gx * 7 + gy * 13) % 5) * 0.06;
    r = 60 * shade; g = 160 * shade; b = 70 * shade;
    if (gy < 3) { r = 220 * shade; g = 60 * shade; b = 50 * shade; }      // rojo romano al norte
    if (gy >= 6 && gy < 9 && gx < 7) { r = 245 * shade; g = 165 * shade; b = 20 * shade; } // dorado inca
    if (gy >= 11) { r = 46 * shade; g = 196 * shade; b = 182 * shade; }   // turquesa rapanui
  }
  return [r | 0, g | 0, b | 0, a];
}
mkdirSync('public', { recursive: true });
for (const s of [180, 192, 512]) writeFileSync(`public/icon-${s}.png`, png(s, pixel));
console.log('Iconos generados: 180, 192, 512');
