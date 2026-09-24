import * as THREE from 'three';

// Procedural canvas textures, so the scene looks like real celestial bodies
// without shipping image assets. Every generator is seeded and cached.

const cache = new Map();

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, { srgb = true, wrap = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (wrap) texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

function lerpColor(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

// Smooth 1D value noise, used to wobble band edges.
function noise1D(rand, size) {
  const points = Array.from({ length: size + 1 }, () => rand());
  points[size] = points[0];
  return (x) => {
    const f = ((x % 1) + 1) % 1 * size;
    const i = Math.floor(f);
    const t = f - i;
    const s = t * t * (3 - 2 * t);
    return points[i] * (1 - s) + points[i + 1] * s;
  };
}

// Horizontal bands with turbulent edges: Jupiter, Saturn, ice giants.
function paintBands(ctx, width, height, palette, rand, { turbulence = 0.02, streaks = 300 } = {}) {
  const bandCount = palette.length * 3;
  const wobble = [noise1D(rand, 8), noise1D(rand, 16)];
  const image = ctx.createImageData(width, height);
  const bandColors = Array.from({ length: bandCount }, () => new THREE.Color(palette[Math.floor(rand() * palette.length)]));
  const bandOffsets = Array.from({ length: bandCount }, () => rand());

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      const warp = (wobble[0](u + v * 3) - 0.5) * turbulence * 4 + (wobble[1](u * 2 - v) - 0.5) * turbulence;
      const bandPos = (v + warp) * bandCount;
      const band = Math.min(bandCount - 1, Math.max(0, Math.floor(bandPos)));
      const next = Math.min(bandCount - 1, band + 1);
      const t = bandPos - Math.floor(bandPos);
      const blend = Math.pow(t, 3 + bandOffsets[band] * 4);
      const color = bandColors[band].clone().lerp(bandColors[next], blend);
      const shade = 0.92 + rand() * 0.08;
      const idx = (y * width + x) * 4;
      image.data[idx] = Math.min(255, color.r * 255 * shade);
      image.data[idx + 1] = Math.min(255, color.g * 255 * shade);
      image.data[idx + 2] = Math.min(255, color.b * 255 * shade);
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Thin wind streaks for texture.
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < streaks; i += 1) {
    const y = rand() * height;
    ctx.strokeStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    ctx.lineWidth = 0.5 + rand() * 1.5;
    ctx.beginPath();
    const x0 = rand() * width;
    ctx.moveTo(x0, y);
    ctx.bezierCurveTo(x0 + 20, y + (rand() - 0.5) * 4, x0 + 60, y + (rand() - 0.5) * 4, x0 + 40 + rand() * 120, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintStorm(ctx, x, y, rx, ry, inner, outer) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, rx);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.6, outer);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintBlotches(ctx, width, height, rand, colors, count, minR, maxR, alpha) {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const r = minR + rand() * (maxR - minR);
    const color = new THREE.Color(colors[Math.floor(rand() * colors.length)]);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const rgb = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
    gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const W = 512;
const H = 256;

// Airless rocky body: mottled base, then craters with a dark floor and a light rim.
function paintCratered(base, tones, rand, craters) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  paintBlotches(ctx, W, H, rand, tones, 160, 4, 30, 0.4);
  for (let i = 0; i < craters; i += 1) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 1.5 + rand() * 7;
    ctx.fillStyle = 'rgba(40,38,36,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,215,208,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - 0.5, y - 0.5, r, Math.PI * 0.9, Math.PI * 1.9);
    ctx.stroke();
  }
  return toTexture(canvas);
}

const BUILDERS = {
  jupiter: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(11);
    paintBands(ctx, W, H, ['#d8c3a0', '#c99b6d', '#f1e4cc', '#a8704a', '#e6cfa8', '#8c5a3c'], rand, { turbulence: 0.025 });
    paintStorm(ctx, W * 0.68, H * 0.64, 34, 18, 'rgba(196,92,58,0.95)', 'rgba(170,96,64,0.6)');
    paintBlotches(ctx, W, H, rand, ['#ffffff', '#f5e6cf'], 40, 3, 8, 0.35);
    return toTexture(canvas);
  },
  saturn: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    paintBands(ctx, W, H, ['#e8d6a8', '#d4b97f', '#f3e7c4', '#c2a36b', '#dcc58f'], seededRandom(23), { turbulence: 0.01, streaks: 120 });
    return toTexture(canvas);
  },
  neptune: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(37);
    paintBands(ctx, W, H, ['#3f6fd8', '#335fc4', '#5584e6', '#2a4ea8'], rand, { turbulence: 0.015, streaks: 80 });
    paintStorm(ctx, W * 0.3, H * 0.6, 22, 12, 'rgba(20,30,90,0.9)', 'rgba(30,50,120,0.4)');
    paintBlotches(ctx, W, H, rand, ['#ffffff'], 12, 2, 6, 0.5);
    return toTexture(canvas);
  },
  uranus: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    paintBands(ctx, W, H, ['#a8e3e6', '#9ad6db', '#b8ecee', '#8ccad1'], seededRandom(41), { turbulence: 0.006, streaks: 40 });
    return toTexture(canvas);
  },
  mars: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(53);
    ctx.fillStyle = '#b5532f';
    ctx.fillRect(0, 0, W, H);
    paintBlotches(ctx, W, H, rand, ['#7a2f1a', '#d4784a', '#5c2414', '#c96a3d'], 220, 6, 40, 0.45);
    paintBlotches(ctx, W, H, rand, ['#3b1a10'], 40, 2, 6, 0.6);
    // Polar ice caps.
    const cap = ctx.createLinearGradient(0, 0, 0, H);
    cap.addColorStop(0, 'rgba(255,245,240,0.95)');
    cap.addColorStop(0.07, 'rgba(255,245,240,0)');
    cap.addColorStop(0.93, 'rgba(255,245,240,0)');
    cap.addColorStop(1, 'rgba(255,245,240,0.9)');
    ctx.fillStyle = cap;
    ctx.fillRect(0, 0, W, H);
    return toTexture(canvas);
  },
  earth: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(67);
    const ocean = ctx.createLinearGradient(0, 0, 0, H);
    ocean.addColorStop(0, '#12366b');
    ocean.addColorStop(0.5, '#1d5aa6');
    ocean.addColorStop(1, '#12366b');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, W, H);
    // Continents: clusters of overlapping blobs.
    for (let c = 0; c < 7; c += 1) {
      const cx = rand() * W;
      const cy = H * (0.2 + rand() * 0.6);
      for (let i = 0; i < 26; i += 1) {
        const x = cx + (rand() - 0.5) * 90;
        const y = cy + (rand() - 0.5) * 50;
        const r = 6 + rand() * 18;
        ctx.fillStyle = lerpColor('#3f7a3a', '#a58c5a', rand() * 0.7).getStyle();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const ice = ctx.createLinearGradient(0, 0, 0, H);
    ice.addColorStop(0, 'rgba(255,255,255,1)');
    ice.addColorStop(0.08, 'rgba(255,255,255,0)');
    ice.addColorStop(0.92, 'rgba(255,255,255,0)');
    ice.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = ice;
    ctx.fillRect(0, 0, W, H);
    // Cloud swirls.
    paintBlotches(ctx, W, H, rand, ['#ffffff'], 140, 4, 22, 0.4);
    return toTexture(canvas);
  },
  venus: () => {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    paintBands(ctx, W, H, ['#e8c98a', '#d9b06a', '#f2dcaa', '#caa062'], seededRandom(71), { turbulence: 0.05, streaks: 200 });
    return toTexture(canvas);
  },
  moon: () => paintCratered('#8e8a86', ['#5e5b58', '#a9a5a0'], seededRandom(83), 90),
  // Mercury: darker, warmer grey than the Moon and more heavily cratered.
  mercury: () => paintCratered('#857a70', ['#5a524b', '#a39688'], seededRandom(89), 130),
};

export const PLANET_KINDS = ['earth', 'mars', 'jupiter', 'saturn', 'neptune', 'venus', 'uranus', 'moon', 'mercury'];

export function planetTexture(kind) {
  return cached(`planet:${kind}`, BUILDERS[kind] ?? BUILDERS.moon);
}

// Saturn-style ring strip: radial gradient of translucent bands (u runs inner→outer).
export function ringTexture() {
  return cached('ring', () => {
    const width = 512;
    const canvas = makeCanvas(width, 8);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(97);
    for (let x = 0; x < width; x += 1) {
      const t = x / width;
      const gap = t > 0.62 && t < 0.67 ? 0.08 : 1; // Cassini division
      const edge = Math.min(1, t * 8) * Math.min(1, (1 - t) * 6);
      const alpha = (0.35 + rand() * 0.55) * gap * edge;
      const color = lerpColor('#c9b48a', '#f0e2c0', rand());
      ctx.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
      ctx.fillRect(x, 0, 1, 8);
    }
    return toTexture(canvas, { wrap: false });
  });
}

// Soft radial glow sprite, used for sun corona, planet halos, comet heads and stars.
export function glowTexture() {
  return cached('glow', () => {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return toTexture(canvas, { srgb: false, wrap: false });
  });
}

// Wispy nebula cloud for the waiting-for-user state and the backdrop.
export function nebulaTexture(seed, colors) {
  return cached(`nebula:${seed}`, () => {
    const size = 512;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(seed);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i += 1) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.pow(rand(), 0.7) * size * 0.35;
      const x = size / 2 + Math.cos(angle) * dist;
      const y = size / 2 + Math.sin(angle) * dist * 0.6;
      const r = 20 + rand() * 90;
      const color = new THREE.Color(colors[Math.floor(rand() * colors.length)]);
      const rgb = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${rgb},0.16)`);
      gradient.addColorStop(0.5, `rgba(${rgb},0.05)`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return toTexture(canvas, { wrap: false });
  });
}

// Supernova remnant: a ragged, filamentary shell of glowing gas (red hydrogen,
// teal oxygen, gold sulphur) around a faint blue interior.
export function remnantTexture() {
  return cached('remnant', () => {
    const size = 512;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(307);
    const c = size / 2;
    ctx.globalCompositeOperation = 'lighter';
    paintBlotches(ctx, size, size, rand, ['#1a3a6a'], 40, 30, 90, 0.05);
    // A soft, diffuse glow band under the filaments.
    const band = ctx.createRadialGradient(c, c, size * 0.2, c, c, size * 0.46);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.55, 'rgba(200,70,60,0.10)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, size, size);
    const colors = ['#e0503a', '#d86a58', '#4fb8b0', '#e0b060', '#c85070'];
    for (let i = 0; i < 2600; i += 1) {
      const angle = rand() * Math.PI * 2;
      const wobble = Math.sin(angle * 5 + 1.3) * 10 + Math.sin(angle * 11) * 5;
      const dist = size * 0.32 + wobble + (rand() - 0.5) * (rand() < 0.3 ? 70 : 24);
      const x = c + Math.cos(angle) * dist;
      const y = c + Math.sin(angle) * dist;
      const r = 2 + rand() * 7;
      const color = new THREE.Color(colors[Math.floor(rand() * colors.length)]);
      const rgb = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${rgb},0.11)`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Faint radial filaments reaching outward from the shell.
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i += 1) {
      const angle = rand() * Math.PI * 2;
      const start = size * (0.3 + rand() * 0.05);
      const end = start + size * (0.03 + rand() * 0.08);
      ctx.strokeStyle = `rgba(255,${Math.round(110 + rand() * 90)},90,0.05)`;
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(angle) * start, c + Math.sin(angle) * start);
      ctx.lineTo(c + Math.cos(angle) * end, c + Math.sin(angle) * end);
      ctx.stroke();
    }
    return toTexture(canvas, { wrap: false });
  });
}
