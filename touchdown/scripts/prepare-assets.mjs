// Downloads NASA Moon/Earth maps and converts them to web textures.
// Usage: node scripts/prepare-assets.mjs   (idempotent, runs from any cwd)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.cache');
const tex = path.join(root, 'public', 'textures');
const models = path.join(root, 'public', 'models');
for (const d of [cache, tex, models]) fs.mkdirSync(d, { recursive: true });

const SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/';
const EARTH_URLS = [
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg',
  'https://svs.gsfc.nasa.gov/vis/a000000/a003600/a003615/flat_earth_Largest_still.0330.jpg',
];
const fail = (m) => { console.error('ERROR: ' + m); process.exit(1); };

// Stream a URL to disk. Returns false on non-200 / non-image when `imageOnly`.
async function download(url, file, { minBytes = 0, imageOnly = false, soft = false } = {}) {
  if (fs.existsSync(file) && fs.statSync(file).size > Math.max(minBytes, 1)) {
    console.log(`cached  ${path.basename(file)} (${fs.statSync(file).size} bytes)`);
    return true;
  }
  console.log(`fetch   ${url}`);
  const res = await fetch(url).catch((e) => ({ ok: false, status: String(e) }));
  const type = res.headers?.get('content-type') ?? '';
  if (res.status !== 200 || (imageOnly && !type.startsWith('image/'))) {
    if (soft) { console.log(`  skip: HTTP ${res.status} ${type}`); return false; }
    fail(`bad download ${url}: HTTP ${res.status} ${type}`);
  }
  const part = file + '.part';
  let n = 0, last = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { n += c.length; if (n - last > 8e6) { last = n; console.log(`  ${(n / 1e6).toFixed(1)} MB`); } });
  await pipeline(body, fs.createWriteStream(part));
  if (n < minBytes) { fs.rmSync(part); fail(`${url} too small (${n} bytes)`); }
  fs.renameSync(part, file);
  console.log(`  done ${n} bytes`);
  return true;
}

const colorTif = path.join(cache, 'lroc_color_poles_8k.tif');
const demTif = path.join(cache, 'ldem_16_uint.tif');
await download(SVS + 'lroc_color_poles_8k.tif', colorTif, { minBytes: 1e6 });
await download(SVS + 'ldem_16_uint.tif', demTif, { minBytes: 1e6 });

let earthUrl = null;
const earthFile = path.join(cache, 'earth_source.jpg');
const earthMarker = earthFile + '.url';
if (fs.existsSync(earthFile) && fs.existsSync(earthMarker)) {
  earthUrl = fs.readFileSync(earthMarker, 'utf8').trim();
  console.log(`cached  earth_source.jpg (${earthUrl})`);
} else {
  for (const u of EARTH_URLS) {
    if (await download(u, earthFile, { imageOnly: true, soft: true })) { earthUrl = u; fs.writeFileSync(earthMarker, u); break; }
  }
  if (!earthUrl) console.log('No Earth source worked: earth_2k.jpg skipped.');
}

// ---- Moon colour ----
const jpg = (q, extra = {}) => ({ quality: q, mozjpeg: true, ...extra });
const colorIn = () => sharp(colorTif, { limitInputPixels: false }).removeAlpha().toColourspace('srgb');
await colorIn().jpeg(jpg(88)).toFile(path.join(tex, 'moon_color_8k.jpg'));
await colorIn().resize(4096, 2048, { kernel: 'lanczos3' }).jpeg(jpg(88)).toFile(path.join(tex, 'moon_color_4k.jpg'));

// ---- Moon slope map ----
const { data: raw, info } = await sharp(demTif, { limitInputPixels: false }).toColourspace('grey16') /* without this sharp converts the grey16 TIFF to 3-channel sRGB and squashes DN to ~8 bit */.raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
console.log(`DEM: ${info.width}x${info.height} channels=${info.channels} depth=${info.depth}`);
if (!String(info.depth).startsWith('ushort')) fail(`DEM is not 16-bit (depth=${info.depth})`);
const W = info.width, H = info.height, C = info.channels;
const dn = new Uint16Array(raw.buffer, raw.byteOffset, W * H * C);
let dnMin = 65535, dnMax = 0;
for (let i = 0; i < W * H; i++) { const v = dn[i * C]; if (v < dnMin) dnMin = v; if (v > dnMax) dnMax = v; }
console.log(`DEM DN min=${dnMin} max=${dnMax}`);

// h(x,y) = DN * 0.5 m. x grows east, y grows south; row y has lat = 90 - (y+0.5)*180/H.
// Metres per pixel: north = PI*R/H; east = north*cos(lat) (cos clamped >= 0.02).
// Central differences: x wraps (periodic longitude), y clamped at the poles.
//   dhdE = (h(x+1)-h(x-1)) / (2 dEast);  dhdN = (h(y-1)-h(y+1)) / (2 dNorth)  (north is up = smaller y)
// Encode with gain G: R = 0.5 - 0.5*G*dhdE, G = 0.5 - 0.5*G*dhdN, B = 255 (flat ground = 127.5).
const GAIN = 2.5, R_MOON = 1737400, dNorth = (Math.PI * R_MOON) / H;
const h = (x, y) => 0.5 * dn[(Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)) * C];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const slope = Buffer.alloc(W * H * 3);
let sumR = 0, sumG = 0, strong = 0;
for (let y = 0; y < H; y++) {
  const lat = (90 - ((y + 0.5) * 180) / H) * (Math.PI / 180);
  const dEast = dNorth * Math.max(0.02, Math.cos(lat));
  for (let x = 0; x < W; x++) {
    const dhdE = (h(x + 1, y) - h(x - 1, y)) / (2 * dEast);
    const dhdN = (h(x, y - 1) - h(x, y + 1)) / (2 * dNorth);
    const r = Math.round(255 * clamp01(0.5 - 0.5 * GAIN * dhdE));
    const g = Math.round(255 * clamp01(0.5 - 0.5 * GAIN * dhdN));
    const o = (y * W + x) * 3;
    slope[o] = r; slope[o + 1] = g; slope[o + 2] = 255;
    sumR += r; sumG += g; if (Math.abs(r - 127.5) > 20) strong++;
  }
}
console.log(`slope native stats: meanR=${(sumR / (W * H)).toFixed(2)} meanG=${(sumG / (W * H)).toFixed(2)} frac|R-127.5|>20=${(strong / (W * H)).toFixed(4)}`);
await sharp(slope, { raw: { width: W, height: H, channels: 3 } })
  .resize(4096, 2048, { kernel: 'lanczos3' })
  .jpeg(jpg(92, { chromaSubsampling: '4:4:4' })).toFile(path.join(tex, 'moon_slope_4k.jpg'));

// ---- Earth ----
if (earthUrl) {
  await sharp(earthFile, { limitInputPixels: false }).resize(2048, 1024, { kernel: 'lanczos3' }).jpeg(jpg(86)).toFile(path.join(tex, 'earth_2k.jpg'));
}

fs.writeFileSync(path.join(models, 'ATTRIBUTION.txt'), `Starship model: I_am_Darth, Thingiverse thing 7369010, CC BY-NC-SA (version not stated in the supplied archive). Adapted: upper stage extracted and assembled. Non-commercial use only.
Moon colour and elevation: NASA's Scientific Visualization Studio, CGI Moon Kit (SVS 4720), from LRO LROC and LOLA data. The colour map is made for looks, not for science.
Earth map: NASA's Scientific Visualization Studio (${earthUrl ?? 'not included'}).
The flight is illustrative. Sun and Earth directions come from the project dataset.
`);

// ---- Report ----
for (const f of ['moon_color_8k', 'moon_color_4k', 'moon_slope_4k', 'earth_2k']) {
  const p = path.join(tex, f + '.jpg');
  if (!fs.existsSync(p)) continue;
  const m = await sharp(p).metadata();
  console.log(`${p} ${m.width}x${m.height} ${fs.statSync(p).size} bytes`);
}
