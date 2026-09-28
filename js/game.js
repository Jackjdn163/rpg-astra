'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
}

const eggPos = zi => ({ x: zi * ZW + ZW / 2, y: 230 });
const chestPos = zi => ({ x: zi * ZW + ZW / 2, y: ZH - 190 });
const zoneAt = x => U.clamp(Math.floor(x / ZW), 0, ZONES.length - 1);
const GATE_SIGN_OFFSET = 150;
const PRESENT_COLORS = ['#ff5c7a', '#4fc3ff', '#9b6bff', '#46d68c', '#ffb340'];

const world = {
  player: { x: ZW / 2, y: ZH / 2 + 60, facing: 1, walk: 0, moving: false },
  cam: { x: ZW / 2, y: ZH / 2 },
  breakables: [],
  bmap: new Map(),
  nextBid: 1,
  pets: [],
  orbs: [],
  texts: [],
  particles: [],
  decos: [],
  manualTarget: null,
  moveTarget: null,
  chestTimers: {},
  spawnTimer: 0,
  autoHatchTimer: 0,
  saveTimer: 0,
  coinTextAcc: 0,
  coinTextTimer: 0,
  time: 0,
  zone: 0,
  keys: {},
  pointerDown: false,
};

// ---------- World setup ----------
function buildDecos() {
  world.decos = [];
  ZONES.forEach((z, zi) => {
    const rng = U.seeded(1234 + zi * 977);
    const egg = eggPos(zi), chest = chestPos(zi);
    let placed = 0, tries = 0;
    while (placed < 34 && tries++ < 500) {
      const x = zi * ZW + 40 + rng() * (ZW - 80);
      const y = 40 + rng() * (ZH - 80);
      if (U.dist(x, y, egg.x, egg.y) < 240 || U.dist(x, y, chest.x, chest.y) < 170) continue;
      // Keep the middle of each zone mostly clear for breakables.
      const edge = Math.min(x - zi * ZW, (zi + 1) * ZW - x, y, ZH - y);
      if (edge > 170 && rng() < 0.8) continue;
      const ch = z.deco[Math.floor(rng() * z.deco.length)];
      world.decos.push({ x, y, ch, size: 34 + rng() * 26, flip: rng() < 0.5 });
      placed++;
    }
  });
}

function resetWorld() {
  world.breakables = [];
  world.bmap.clear();
  world.pets = [];
  world.orbs = [];
  world.texts = [];
  world.particles = [];
  world.manualTarget = null;
  world.moveTarget = null;
  world.chestTimers = {};
  world.player.x = ZW / 2;
  world.player.y = ZH / 2 + 60;
  world.cam.x = world.player.x;
  world.cam.y = world.player.y;
  world.zone = 0;
  syncPets();
  ui.updateHud(true);
}

function syncPets() {
  const eq = state.equipped;
  world.pets = world.pets.filter(e => eq.includes(e.uid));
  const p = world.player;
  for (const uid of eq) {
    if (!world.pets.some(e => e.uid === uid)) {
      world.pets.push({ uid, x: p.x + U.rand(-40, 40), y: p.y + U.rand(-40, 40), target: null,
        cd: Math.random() * 0.5, hop: Math.random() * 6, face: 1 });
    }
  }
  world.pets.sort((a, b) => eq.indexOf(a.uid) - eq.indexOf(b.uid));
}

// ---------- Breakables ----------
function makeBreakable(type, zi, x, y) {
  const t = BREAKABLES[type];
  const z = ZONES[zi];
  const b = {
    id: world.nextBid++, type, zone: zi, x, y, r: t.r,
    maxHp: t.hp * z.hpBase, hp: t.hp * z.hpBase,
    value: t.value * z.valueBase, hit: 0, born: world.time,
    color: PRESENT_COLORS[U.randi(0, PRESENT_COLORS.length - 1)],
  };
  world.breakables.push(b);
  world.bmap.set(b.id, b);
  return b;
}

function trySpawnBreakable(zi) {
  const egg = eggPos(zi), chest = chestPos(zi), p = world.player;
  for (let i = 0; i < 12; i++) {
    const x = zi * ZW + 110 + Math.random() * (ZW - 220);
    const y = 110 + Math.random() * (ZH - 220);
    if (U.dist(x, y, egg.x, egg.y) < 200) continue;
    if (U.dist(x, y, chest.x, chest.y) < 150) continue;
    if (U.dist(x, y, p.x, p.y) < 70) continue;
    if (world.breakables.some(b => U.dist(x, y, b.x, b.y) < b.r + 50)) continue;
    const type = U.pickWeighted(BREAKABLE_SPAWN, k => BREAKABLES[k].weight);
    return makeBreakable(type, zi, x, y);
  }
  return null;
}

function updateSpawns(dt) {
  world.spawnTimer -= dt;
  const counts = {};
  let chestAlive = {};
  for (const b of world.breakables) {
    if (b.type === 'chest') chestAlive[b.zone] = true;
    else counts[b.zone] = (counts[b.zone] || 0) + 1;
  }
  for (let zi = 0; zi <= state.unlocked; zi++) {
    if (!chestAlive[zi]) {
      world.chestTimers[zi] = (world.chestTimers[zi] ?? 3) - dt;
      if (world.chestTimers[zi] <= 0) {
        const c = chestPos(zi);
        makeBreakable('chest', zi, c.x, c.y);
        world.chestTimers[zi] = CHEST_RESPAWN;
      }
    }
  }
  if (world.spawnTimer > 0) return;
  world.spawnTimer = 0.25;
  for (let zi = 0; zi <= state.unlocked; zi++) {
    const n = counts[zi] || 0;
    // Fill quickly when a zone is nearly empty.
    const burst = n < MAX_BREAKABLES_PER_ZONE / 2 ? 3 : 1;
    for (let k = 0; k < burst && n + k < MAX_BREAKABLES_PER_ZONE; k++) trySpawnBreakable(zi);
  }
}

function damageBreakable(b, dmg) {
  b.hp -= dmg;
  b.hit = 0.14;
  if (b.hp <= 0) destroyBreakable(b);
}

function destroyBreakable(b) {
  const t = BREAKABLES[b.type];
  world.breakables = world.breakables.filter(x => x !== b);
  world.bmap.delete(b.id);
  if (world.manualTarget === b.id) world.manualTarget = null;
  state.stats.broken++;

  const total = b.value * coinMult();
  for (let i = 0; i < t.orbs; i++) spawnOrb(b.x, b.y, 'coin', total / t.orbs);
  const [chance, lo, hi] = t.gem;
  if (Math.random() < chance) {
    const gems = U.randi(lo, hi) * (1 + Math.floor(b.zone / 2));
    const n = Math.min(gems, 6);
    for (let i = 0; i < n; i++) spawnOrb(b.x, b.y, 'diamond', gems / n);
  }
  const col = b.type === 'pile' ? '#ffd23f' : b.type === 'present' ? b.color :
    b.type === 'safe' ? '#9aa3b5' : '#a0643a';
  for (let i = 0; i < (b.type === 'chest' ? 40 : 14); i++) {
    const a = Math.random() * Math.PI * 2, s = U.rand(80, 320);
    world.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
      life: U.rand(0.4, 0.8), age: 0, col, size: U.rand(3, 7) });
  }
  if (b.type === 'chest') ui.toast(`🧰 ${ZONES[b.zone].name} chest broken! +🪙 ${U.fmt(total)}`, 'good');
}

function spawnOrb(x, y, kind, value) {
  const a = Math.random() * Math.PI * 2, s = U.rand(120, 300);
  world.orbs.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind, value, age: 0 });
}

// ---------- Pets ----------
function assignAutoTargets() {
  const p = world.player;
  const pz = zoneAt(p.x);
  const candidates = world.breakables
    .filter(b => b.zone === pz && U.dist(p.x, p.y, b.x, b.y) < 460)
    .sort((a, b) => U.dist(p.x, p.y, a.x, a.y) - U.dist(p.x, p.y, b.x, b.y));
  if (!candidates.length) return;
  const load = new Map();
  for (const e of world.pets) if (e.target) load.set(e.target, (load.get(e.target) || 0) + 1);
  const cap = Math.max(1, Math.ceil(world.pets.length / 3));
  for (const e of world.pets) {
    if (e.target) continue;
    let pick = candidates.find(b => (load.get(b.id) || 0) < (b.type === 'chest' ? 99 : cap));
    if (!pick) pick = candidates[0];
    e.target = pick.id;
    load.set(pick.id, (load.get(pick.id) || 0) + 1);
  }
}

function updatePets(dt) {
  const p = world.player;
  const n = world.pets.length;
  if (world.manualTarget) {
    const b = world.bmap.get(world.manualTarget);
    if (!b || U.dist(p.x, p.y, b.x, b.y) > 600) world.manualTarget = null;
  }
  for (const e of world.pets) {
    const b = e.target && world.bmap.get(e.target);
    if (!b || U.dist(p.x, p.y, b.x, b.y) > 600) e.target = null;
    if (world.manualTarget) e.target = world.manualTarget;
  }
  if (!world.manualTarget && state.autoFarm) assignAutoTargets();

  world.pets.forEach((e, i) => {
    const pet = findPet(e.uid);
    if (!pet) return;
    const b = e.target && world.bmap.get(e.target);
    let tx, ty;
    if (b) {
      const a = (i / Math.max(n, 1)) * Math.PI * 2 + b.id;
      tx = b.x + Math.cos(a) * (b.r + 18);
      ty = b.y + Math.sin(a) * (b.r + 12);
    } else {
      const cols = Math.min(n, 4);
      const row = Math.floor(i / cols), col = i % cols;
      const rowCount = Math.min(cols, n - row * cols);
      const side = (col - (rowCount - 1) / 2) * 46;
      tx = p.x - p.facing * (60 + row * 44);
      ty = p.y + side * 0.9;
    }
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1100) { e.x = tx; e.y = ty; }
    else if (d > 1) {
      const sp = Math.max(420, d * 5);
      const step = Math.min(d, sp * dt);
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
      if (Math.abs(dx) > 2) e.face = dx > 0 ? 1 : -1;
    }
    e.moving = d > 6;
    e.hop += dt * (b ? 11 : e.moving ? 10 : 3);
    if (b && d < 40) {
      e.face = b.x > e.x ? 1 : -1;
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = 0.5;
        damageBreakable(b, petPower(pet) * dmgMult());
      }
    }
  });
}

// ---------- Player ----------
function updatePlayer(dt) {
  const p = world.player;
  const k = world.keys;
  let mx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
  let my = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
  if (mx || my) world.moveTarget = null;
  else if (world.moveTarget) {
    const dx = world.moveTarget.x - p.x, dy = world.moveTarget.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) world.moveTarget = null;
    else { mx = dx / d; my = dy / d; }
  }
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    const sp = walkSpeed();
    p.x += (mx / len) * sp * dt;
    p.y += (my / len) * sp * dt;
    if (Math.abs(mx) > 0.1) p.facing = mx > 0 ? 1 : -1;
    p.walk += dt * 12;
  }
  const maxX = (state.unlocked + 1) * ZW - 28;
  p.x = U.clamp(p.x, 28, maxX);
  p.y = U.clamp(p.y, 40, ZH - 28);

  const z = zoneAt(p.x);
  if (z !== world.zone) {
    world.zone = z;
    ui.zoneBanner(ZONES[z].name);
  }
}

// ---------- Orbs / effects ----------
function updateOrbs(dt) {
  const p = world.player;
  const mag = magnetRange();
  let gotCoin = false, gotGem = false;
  world.orbs = world.orbs.filter(o => {
    o.age += dt;
    const d = U.dist(o.x, o.y, p.x, p.y);
    if (o.age > 0.45 && (d < mag || o.age > 12)) {
      const s = 500 + o.age * 400;
      o.vx = ((p.x - o.x) / d) * s;
      o.vy = ((p.y - o.y) / d) * s;
    } else {
      o.vx *= Math.pow(0.02, dt);
      o.vy *= Math.pow(0.02, dt);
    }
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    if (o.age > 0.45 && d < 22) {
      if (o.kind === 'coin') {
        state.coins += o.value;
        state.stats.coinsEarned += o.value;
        world.coinTextAcc += o.value;
        gotCoin = true;
      } else {
        const v = Math.round(o.value);
        state.diamonds += v;
        state.stats.diamondsEarned += v;
        addText(p.x + U.rand(-20, 20), p.y - 50, `+${v} 💎`, '#7ff3ff');
        gotGem = true;
      }
      return false;
    }
    return true;
  });
  if (gotCoin) ui.bump('coin');
  if (gotGem) ui.bump('diamond');
  world.coinTextTimer -= dt;
  if (world.coinTextAcc > 0 && world.coinTextTimer <= 0) {
    addText(p.x + U.rand(-24, 24), p.y - 46, `+${U.fmt(world.coinTextAcc)}`, '#ffe066');
    world.coinTextAcc = 0;
    world.coinTextTimer = 0.3;
  }
}

function addText(x, y, text, color) {
  world.texts.push({ x, y, text, color, age: 0 });
  if (world.texts.length > 40) world.texts.shift();
}

function updateEffects(dt) {
  world.texts = world.texts.filter(t => (t.age += dt) < 1.1);
  world.particles = world.particles.filter(q => {
    q.age += dt;
    q.vy += 700 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    return q.age < q.life;
  });
  for (const b of world.breakables) if (b.hit > 0) b.hit -= dt;
}

// ---------- Eggs & gates ----------
function nearEgg() {
  const zi = zoneAt(world.player.x);
  const e = eggPos(zi);
  return U.dist(world.player.x, world.player.y, e.x, e.y + 40) < 190 ? zi : -1;
}

function nextGate() {
  const i = state.unlocked + 1;
  return i < ZONES.length ? i : -1;
}

function nearGate() {
  const i = nextGate();
  return i > 0 && world.player.x > i * ZW - 190 ? i : -1;
}

function tryUnlock(i) {
  const z = ZONES[i];
  if (state.coins < z.gateCost) {
    ui.toast(`Need 🪙 ${U.fmt(z.gateCost - state.coins)} more to unlock ${z.name}`, 'bad');
    return;
  }
  state.coins -= z.gateCost;
  state.unlocked = i;
  ui.toast(`🔓 Unlocked <b>${z.name}</b>!`, 'good');
  ui.updateHud();
  saveState();
}

function hatch(zi, n, fast = false) {
  if (ui.hatching) return false;
  const z = ZONES[zi];
  const affordable = Math.min(n, Math.floor(state.coins / z.eggCost));
  if (affordable <= 0) {
    if (!fast) ui.toast(`Not enough coins — ${z.egg} costs 🪙 ${U.fmt(z.eggCost)}`, 'bad');
    return false;
  }
  if (state.pets.length + affordable > MAX_PETS) {
    ui.toast('Pet inventory full! Delete some pets first.', 'bad');
    state.autoHatch = false;
    ui.refreshToggles();
    return false;
  }
  state.coins -= affordable * z.eggCost;
  const ids = [];
  for (let i = 0; i < affordable; i++) {
    const id = rollEgg(zi);
    ids.push(id);
    addPet(id);
    state.stats.hatched++;
    const d = PETS[id];
    if (d.rarity === 'huge') {
      state.stats.huges++;
      ui.toast(`🎉 You hatched a <b>${d.name}</b>!!!`, 'huge');
    } else if (d.rarity === 'mythical' || d.rarity === 'legendary') {
      ui.toast(`✨ You hatched a <b style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name} ${d.name}</b>!`, 'good');
    }
  }
  syncPets();
  ui.showHatch(zi, ids, fast);
  ui.updateHud();
  if (ui.current === 'egg' || ui.current === 'pets') ui.refresh();
  return true;
}

function updatePrompt() {
  if (ui.isOpen()) { ui.setPrompt(null); return; }
  const g = nearGate();
  if (g > 0) {
    const z = ZONES[g];
    ui.setPrompt(`🔒 Unlock <b>${z.name}</b> · 🪙 ${U.fmt(z.gateCost)} <kbd>E</kbd>`, () => tryUnlock(g));
    return;
  }
  const e = nearEgg();
  if (e >= 0) {
    ui.setPrompt(`🥚 Open <b>${ZONES[e].egg}</b> <kbd>E</kbd>`, () => ui.open('egg', e));
    return;
  }
  ui.setPrompt(null);
}

function updateAutoHatch(dt) {
  world.autoHatchTimer -= dt;
  if (!state.autoHatch || ui.hatching || world.autoHatchTimer > 0) return;
  const e = nearEgg();
  if (e < 0) return;
  world.autoHatchTimer = 0.4;
  hatch(e, hatchCount(), true);
}

// ---------- Rendering ----------
function drawGround(x0, y0) {
  const x1 = x0 + W, y1 = y0 + H;
  const T = 80;
  for (let zi = 0; zi < ZONES.length; zi++) {
    const zx = zi * ZW;
    if (zx > x1 || zx + ZW < x0) continue;
    const z = ZONES[zi];
    ctx.fillStyle = z.ground;
    ctx.fillRect(zx, 0, ZW, ZH);
    ctx.fillStyle = z.ground2;
    const tx0 = Math.max(0, Math.floor((x0 - zx) / T)), tx1 = Math.min(ZW / T, Math.ceil((x1 - zx) / T));
    const ty0 = Math.max(0, Math.floor(y0 / T)), ty1 = Math.min(Math.ceil(ZH / T), Math.ceil(y1 / T));
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        if ((tx + ty) % 2 === 0) ctx.fillRect(zx + tx * T, ty * T, T, T);
      }
    }
    ctx.fillStyle = z.edge;
    ctx.fillRect(zx, -30, ZW, 30);
    ctx.fillRect(zx, ZH, ZW, 30);
    if (zi === 0) ctx.fillRect(-30, -30, 30, ZH + 60);
    if (zi === ZONES.length - 1) ctx.fillRect(zx + ZW, -30, 30, ZH + 60);
  }
}

function drawShadow(x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEggShape(x, y, r, col, spot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, col);
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = spot;
  ctx.globalAlpha = 0.75;
  [[-0.35, -0.2, 0.18], [0.3, 0.1, 0.22], [-0.1, 0.5, 0.2], [0.35, -0.55, 0.12]].forEach(([a, b, s]) => {
    ctx.beginPath();
    ctx.arc(a * r, b * r, s * r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(text, x, y, size, color = '#fff', bg = null) {
  ctx.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bg) {
    const w = ctx.measureText(text).width + size * 1.1;
    ctx.fillStyle = bg;
    roundRect(ctx, x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.6);
    ctx.fill();
  }
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawEggStand(zi) {
  const z = ZONES[zi];
  const p = eggPos(zi);
  const t = world.time;
  drawShadow(p.x, p.y + 62, 96, 26);
  ctx.fillStyle = '#7b809c';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 52, 88, 28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c3c8e0';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 42, 88, 28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = z.eggColor;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 42, 70, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const bob = Math.sin(t * 2 + zi) * 6;
  drawEggShape(p.x, p.y - 12 + bob, 50, z.eggColor, z.eggSpots);
  drawLabel(z.egg, p.x, p.y - 90, 22);
  drawLabel(`🪙 ${U.fmt(z.eggCost)}`, p.x, p.y - 64, 17, '#ffe066');
}

function drawBreakable(b) {
  const t = BREAKABLES[b.type];
  const wob = b.hit > 0 ? Math.sin(b.hit * 90) * 0.08 : 0;
  const pop = Math.min(1, (world.time - b.born) * 5);
  const s = (1 + (b.hit > 0 ? 0.08 : 0)) * pop;
  drawShadow(b.x, b.y + b.r * 0.55, b.r * 1.05, b.r * 0.35);

  const targeted = world.manualTarget === b.id || world.pets.some(e => e.target === b.id);
  if (targeted) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -world.time * 30;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + b.r * 0.55, b.r * 1.25, b.r * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(wob);
  ctx.scale(s, s);
  const r = b.r;
  switch (b.type) {
    case 'pile': {
      const coins = [[-12, 8], [12, 8], [0, 10], [-6, -2], [8, -2], [1, -12]];
      for (const [cx, cy] of coins) {
        ctx.fillStyle = '#c98f0e';
        ctx.beginPath(); ctx.ellipse(cx, cy + 3, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.ellipse(cx, cy, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff3a8';
        ctx.beginPath(); ctx.ellipse(cx - 3, cy - 2, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#b8793f';
      roundRect(ctx, -r, -r, r * 2, r * 2, 5); ctx.fill();
      ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 4;
      ctx.strokeRect(-r + 4, -r + 4, r * 2 - 8, r * 2 - 8);
      ctx.beginPath(); ctx.moveTo(-r + 4, -r + 4); ctx.lineTo(r - 4, r - 4); ctx.stroke();
      break;
    }
    case 'present': {
      ctx.fillStyle = b.color;
      roundRect(ctx, -r, -r * 0.8, r * 2, r * 1.8, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-r, -r * 0.8, r * 2, r * 0.4);
      ctx.fillStyle = '#fff6c9';
      ctx.fillRect(-5, -r * 0.8, 10, r * 1.8);
      ctx.beginPath(); ctx.ellipse(-10, -r * 0.85, 11, 7, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(10, -r * 0.85, 11, 7, 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'safe': {
      ctx.fillStyle = '#6d7688';
      roundRect(ctx, -r, -r, r * 2, r * 2, 8); ctx.fill();
      ctx.fillStyle = '#8f99ad';
      roundRect(ctx, -r + 5, -r + 5, r * 2 - 10, r * 2 - 10, 6); ctx.fill();
      ctx.fillStyle = '#495163';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.3, -r * 0.2); ctx.stroke();
      break;
    }
    case 'chest': {
      ctx.fillStyle = '#8a4f24';
      roundRect(ctx, -r, -r * 0.3, r * 2, r * 1.1, 8); ctx.fill();
      ctx.fillStyle = '#a8612d';
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.2);
      ctx.quadraticCurveTo(0, -r * 1.25, r, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(-r, -r * 0.28, r * 2, 10);
      ctx.fillRect(-r * 0.62, -r * 0.8, 12, r * 1.6);
      ctx.fillRect(r * 0.62 - 12, -r * 0.8, 12, r * 1.6);
      roundRect(ctx, -14, -r * 0.35, 28, 30, 5); ctx.fill();
      ctx.fillStyle = '#5b3316';
      ctx.beginPath(); ctx.arc(0, -r * 0.35 + 13, 5, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();

  if (b.hp < b.maxHp) {
    const w = Math.max(50, b.r * 2), y = b.y - b.r - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, b.x - w / 2 - 2, y - 2, w + 4, 11, 5); ctx.fill();
    ctx.fillStyle = '#5dea6b';
    roundRect(ctx, b.x - w / 2, y, Math.max(4, w * (b.hp / b.maxHp)), 7, 3.5); ctx.fill();
  }
  if (b.type === 'chest') drawLabel(`🪙 ${U.fmt(b.value * coinMult())}`, b.x, b.y - b.r - 36, 16, '#ffe066');
}

function drawPet(e) {
  const pet = findPet(e.uid);
  if (!pet) return;
  const d = PETS[pet.id];
  const huge = d.rarity === 'huge';
  const size = huge ? 74 : 40;
  const hop = Math.abs(Math.sin(e.hop)) * (e.moving || e.target ? 10 : 3);
  drawShadow(e.x, e.y + size * 0.42, size * 0.4, size * 0.13);
  const rank = RARITY_ORDER.indexOf(d.rarity);
  if (rank >= 3 || pet.variant) {
    const glow = pet.variant === 2 ? `hsl(${(world.time * 120) % 360},100%,60%)` :
      pet.variant === 1 ? '#ffd23f' : RARITIES[d.rarity].color;
    const g = ctx.createRadialGradient(e.x, e.y - hop, 2, e.x, e.y - hop, size * 0.8);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(e.x, e.y - hop, size * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(e.x, e.y - hop);
  // Emoji animals face left by default.
  ctx.scale(-e.face, 1);
  drawEmoji(ctx, d.emoji, 0, 0, size, pet.variant || 0);
  ctx.restore();
}

function drawPlayer() {
  const p = world.player;
  const bob = p.moving ? Math.abs(Math.sin(p.walk)) * 4 : 0;
  drawShadow(p.x, p.y + 24, 22, 8);
  ctx.save();
  ctx.translate(p.x, p.y - bob);
  // feet
  const step = p.moving ? Math.sin(p.walk) * 5 : 0;
  ctx.fillStyle = '#2b3a67';
  ctx.beginPath(); ctx.ellipse(-8 + step, 20, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(8 - step, 20, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  // body
  ctx.fillStyle = '#3d8bff';
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath(); ctx.arc(p.facing * 6, -4, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(p.facing * 6 - 5, -6, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.facing * 6 + 5, -6, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.facing * 6, -1, 5, 0.2, Math.PI - 0.2); ctx.stroke();
  // cap
  ctx.fillStyle = '#ff5c5c';
  ctx.beginPath(); ctx.arc(0, -12, 20, Math.PI, 0); ctx.fill();
  ctx.fillRect(p.facing > 0 ? 0 : -28, -13, 28, 5);
  ctx.restore();
  drawLabel('You', p.x, p.y - 48, 15);
}

function drawOrb(o) {
  if (o.kind === 'coin') {
    ctx.fillStyle = '#c98f0e';
    ctx.beginPath(); ctx.arc(o.x, o.y + 1.5, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6b3';
    ctx.beginPath(); ctx.arc(o.x - 2.5, o.y - 2.5, 2.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#5ee7ff';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - 10); ctx.lineTo(o.x + 8, o.y); ctx.lineTo(o.x, o.y + 10); ctx.lineTo(o.x - 8, o.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d5fbff';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - 10); ctx.lineTo(o.x + 3, o.y - 1); ctx.lineTo(o.x - 3, o.y - 1);
    ctx.closePath(); ctx.fill();
  }
}

function drawGate() {
  const i = nextGate();
  if (i < 0) return;
  const x = i * ZW;
  const z = ZONES[i];
  const t = world.time;
  // Darken locked zones.
  ctx.fillStyle = 'rgba(10,10,30,0.45)';
  ctx.fillRect(x, -30, (ZONES.length - i) * ZW + 30, ZH + 60);
  // Force field.
  const g = ctx.createLinearGradient(x - 24, 0, x + 24, 0);
  g.addColorStop(0, 'rgba(140,90,255,0)');
  g.addColorStop(0.5, `rgba(170,120,255,${0.55 + Math.sin(t * 3) * 0.15})`);
  g.addColorStop(1, 'rgba(140,90,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 24, -30, 48, ZH + 60);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let y = (t * 80) % 60 - 60; y < ZH; y += 60) ctx.fillRect(x - 2, y, 4, 26);
  // Sign.
  // Sign sits on the locked side so it never covers the player.
  const sx = x + GATE_SIGN_OFFSET, sy = ZH / 2;
  ctx.fillStyle = 'rgba(25,18,60,0.9)';
  roundRect(ctx, sx - 120, sy - 58, 240, 116, 18); ctx.fill();
  ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 3;
  roundRect(ctx, sx - 120, sy - 58, 240, 116, 18); ctx.stroke();
  drawLabel(`🔒 ${z.name}`, sx, sy - 22, 26);
  const can = state.coins >= z.gateCost;
  drawLabel(`🪙 ${U.fmt(z.gateCost)}`, sx, sy + 20, 22, can ? '#7dff8c' : '#ffe066');
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#141833';
  ctx.fillRect(0, 0, W, H);
  const x0 = world.cam.x - W / 2, y0 = world.cam.y - H / 2;
  ctx.save();
  ctx.translate(-Math.round(x0), -Math.round(y0));
  drawGround(x0, y0);

  const vis = (x, y, m = 120) => x > x0 - m && x < x0 + W + m && y > y0 - m && y < y0 + H + m;
  const items = [];
  for (const d of world.decos) if (vis(d.x, d.y)) items.push({ y: d.y, draw: () => {
    ctx.save(); ctx.translate(d.x, d.y); if (d.flip) ctx.scale(-1, 1);
    drawEmoji(ctx, d.ch, 0, -d.size * 0.35, d.size); ctx.restore();
  } });
  for (let zi = 0; zi < ZONES.length; zi++) {
    const e = eggPos(zi);
    if (vis(e.x, e.y, 200)) items.push({ y: e.y + 40, draw: () => drawEggStand(zi) });
  }
  for (const b of world.breakables) if (vis(b.x, b.y)) items.push({ y: b.y, draw: () => drawBreakable(b) });
  for (const e of world.pets) items.push({ y: e.y, draw: () => drawPet(e) });
  items.push({ y: world.player.y, draw: drawPlayer });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  for (const o of world.orbs) if (vis(o.x, o.y, 20)) drawOrb(o);
  for (const q of world.particles) {
    ctx.globalAlpha = 1 - q.age / q.life;
    ctx.fillStyle = q.col;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  drawGate();
  if (world.moveTarget) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(world.moveTarget.x, world.moveTarget.y, 14, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const t of world.texts) {
    ctx.globalAlpha = Math.min(1, 2.2 - t.age * 2);
    drawLabel(t.text, t.x, t.y - t.age * 50, 20, t.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- Input ----------
function screenToWorld(sx, sy) {
  return { x: sx + world.cam.x - W / 2, y: sy + world.cam.y - H / 2 };
}

function handleWorldClick(sx, sy) {
  const w = screenToWorld(sx, sy);
  const p = world.player;
  // Breakables first.
  let best = null, bestD = Infinity;
  for (const b of world.breakables) {
    const d = U.dist(w.x, w.y, b.x, b.y);
    if (d < b.r + 16 && d < bestD) { best = b; bestD = d; }
  }
  if (best) {
    if (!world.pets.length) { ui.toast('Equip some pets first! (P)', 'bad'); return; }
    world.manualTarget = best.id;
    for (const e of world.pets) e.target = best.id;
    if (U.dist(p.x, p.y, best.x, best.y) > 420) world.moveTarget = { x: best.x, y: best.y + best.r + 40 };
    return;
  }
  // Egg stand.
  const zi = zoneAt(w.x);
  const egg = eggPos(zi);
  if (zi <= state.unlocked && U.dist(w.x, w.y, egg.x, egg.y) < 90) {
    if (nearEgg() === zi) ui.open('egg', zi);
    else world.moveTarget = { x: egg.x, y: egg.y + 110 };
    return;
  }
  // Gate sign.
  const g = nextGate();
  if (g > 0 && Math.abs(w.x - (g * ZW + GATE_SIGN_OFFSET)) < 130 && Math.abs(w.y - ZH / 2) < 70) {
    if (nearGate() === g) tryUnlock(g);
    else world.moveTarget = { x: g * ZW - 80, y: ZH / 2 };
    return;
  }
  world.moveTarget = w;
}

function setupInput() {
  window.addEventListener('keydown', e => {
    // Let form fields (dev panel) receive typing without moving the player.
    if (e.target.matches && e.target.matches('input, select, textarea')) {
      if (e.code === 'Escape') ui.close();
      return;
    }
    if (e.code === 'Backquote') { ui.toggle('dev'); return; }
    if (e.repeat && ['KeyE', 'KeyP', 'KeyU', 'KeyF'].includes(e.code)) return;
    world.keys[e.code] = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'Escape') { if (ui.hatching) ui.endHatch(); else ui.close(); }
    if (e.code === 'KeyE') {
      if (ui.current === 'egg') game.hatch(ui.arg, hatchCount());
      else ui.runPrompt();
    }
    if (e.code === 'KeyP') ui.toggle('pets');
    if (e.code === 'KeyU') ui.toggle('upgrades');
    if (e.code === 'KeyF') ui.toggleAutoFarm();
  });
  window.addEventListener('keyup', e => { world.keys[e.code] = false; });
  window.addEventListener('blur', () => { world.keys = {}; });

  canvas.addEventListener('pointerdown', e => {
    if (ui.isOpen()) { ui.close(); return; }
    world.pointerDown = true;
    handleWorldClick(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => {
    if (!world.pointerDown || !world.moveTarget) return;
    world.moveTarget = screenToWorld(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => { world.pointerDown = false; });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });
  window.addEventListener('beforeunload', saveState);
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.time += dt;
  state.stats.playTime += dt;

  updatePlayer(dt);
  updateSpawns(dt);
  updatePets(dt);
  updateOrbs(dt);
  updateEffects(dt);
  updatePrompt();
  updateAutoHatch(dt);

  const p = world.player;
  const k = 1 - Math.pow(0.001, dt);
  world.cam.x += (p.x - world.cam.x) * k;
  world.cam.y += (p.y - world.cam.y) * k;

  render();
  ui.updateHud();

  world.saveTimer += dt;
  if (world.saveTimer > 10) { world.saveTimer = 0; saveState(); }
  requestAnimationFrame(frame);
}

const game = { syncPets, hatch, resetWorld, world, makeBreakable, zoneAt };

function boot() {
  resize();
  buildDecos();
  ui.init();
  setupInput();
  syncPets();
  world.cam.x = world.player.x;
  world.cam.y = world.player.y;
  ui.zoneBanner(ZONES[0].name);
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}

boot();
