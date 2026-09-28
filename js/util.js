'use strict';

// ---------- Small helpers ----------
const U = {
  fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return String(Math.floor(n));
    const units = ['k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let u = -1;
    while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
    const s = n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : String(Math.floor(n));
    return s + units[u];
  },
  pct(p) {
    if (p >= 10) return p.toFixed(1) + '%';
    if (p >= 1) return p.toFixed(2) + '%';
    if (p >= 0.01) return p.toFixed(3) + '%';
    return p.toPrecision(2) + '%';
  },
  rand(a, b) { return a + Math.random() * (b - a); },
  randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
  pickWeighted(list, wfn) {
    let total = 0;
    for (const it of list) total += wfn(it);
    let r = Math.random() * total;
    for (const it of list) { r -= wfn(it); if (r <= 0) return it; }
    return list[list.length - 1];
  },
  hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  // Round to 2 significant figures so quest targets read cleanly.
  nice(n) {
    if (n < 100) return Math.max(1, Math.round(n));
    const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  },
  seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  },
};

// ---------- Emoji sprites (cached offscreen canvases) ----------
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
const _emojiCache = new Map();

// tint: '' = none, 'gold' = golden variant, 'rainbow' = rainbow variant
function emojiSprite(ch, size, tint = '') {
  const key = ch + '|' + size + '|' + tint;
  let c = _emojiCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const pad = Math.ceil(size * 0.25);
  c.width = c.height = size + pad * 2;
  const x = c.getContext('2d');
  x.font = `${size}px ${EMOJI_FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(ch, c.width / 2, c.height / 2 + size * 0.06);
  if (tint) {
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, 0, c.width, c.height);
    if (tint === 'gold') {
      g.addColorStop(0, 'rgba(255,240,140,0.65)');
      g.addColorStop(0.5, 'rgba(255,196,30,0.55)');
      g.addColorStop(1, 'rgba(210,140,0,0.65)');
    } else {
      ['#ff4d4d', '#ffb84d', '#fff34d', '#4dff88', '#4dc3ff', '#b84dff'].forEach((col, i, a) =>
        g.addColorStop(i / (a.length - 1), col));
      x.globalAlpha = 0.5;
    }
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
  }
  _emojiCache.set(key, c);
  return c;
}

function drawEmoji(ctx, ch, x, y, size, tint = '') {
  const base = size > 64 ? 128 : 64;
  const s = emojiSprite(ch, base, tint);
  const w = s.width * (size / base);
  ctx.drawImage(s, x - w / 2, y - w / 2, w, w);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
