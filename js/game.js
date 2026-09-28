'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, vignette = null;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  vignette = null;
}

// ---------- Layout ----------
const stallPos = zi => ({ x: zi * ZW + ZW / 2, y: 175 });
const arenaPos = zi => ({ x: zi * ZW + ZW / 2, y: ZH - 235 });
const fountainPos = { x: ZW / 2, y: ZH / 2 + 30 };
const SPAWN = { x: ZW / 2, y: ZH / 2 + 190 };
const zoneAt = x => U.clamp(Math.floor(x / ZW), 0, LAST_ZONE);
const PRESENT_COLORS = ['#ff5c7a', '#4fc3ff', '#9b6bff', '#46d68c', '#ffb340'];
const GATE_SIGN_OFFSET = 160;

const world = {
  player: { x: SPAWN.x, y: SPAWN.y, facing: 1, walk: 0, moving: false },
  cam: { x: SPAWN.x, y: SPAWN.y },
  breakables: [],
  bmap: new Map(),
  nextBid: 1,
  pets: [],
  shots: [],
  orbs: [],
  texts: [],
  particles: [],
  ambient: [],
  ripples: [],
  decos: [],
  focus: null,
  moveTarget: null,
  keys: {},
  pointerDown: false,
  spawnTimer: 0,
  autoHatchTimer: 0,
  saveTimer: 0,
  checkTimer: 0,
  time: 0,
  zone: 0,
  shake: 0,
  dustTimer: 0,
  coinAcc: 0,
  coinTimer: 0,
  gateNotified: 0,
};

const perf = () => state.settings.perf;

// ---------- World setup ----------
function buildDecos() {
  world.decos = [];
  ZONES.forEach((z, zi) => {
    const rng = U.seeded(4321 + zi * 977);
    const st = stallPos(zi), ar = arenaPos(zi);
    let placed = 0, tries = 0;
    while (placed < 30 && tries++ < 600) {
      const x = zi * ZW + 40 + rng() * (ZW - 80);
      const y = 40 + rng() * (ZH - 80);
      if (U.dist(x, y, st.x, st.y) < 250) continue;
      if (!z.hub && U.dist(x, y, ar.x, ar.y) < CHEST.arenaR + 60) continue;
      if (z.hub && U.dist(x, y, fountainPos.x, fountainPos.y) < 220) continue;
      const edge = Math.min(x - zi * ZW, (zi + 1) * ZW - x, y, ZH - y);
      if (edge > 160 && rng() < 0.85) continue; // keep the middle clear
      world.decos.push({ x, y, ch: z.deco[Math.floor(rng() * z.deco.length)], size: 34 + rng() * 26, flip: rng() < 0.5 });
      placed++;
    }
  });
}

function clearBreakables() {
  world.breakables = [];
  world.bmap.clear();
  world.shots = [];
  world.focus = null;
}

function teleport(zi) {
  const p = world.player;
  if (zi === 0) { p.x = SPAWN.x; p.y = SPAWN.y; } else { p.x = zi * ZW + ZW / 2; p.y = ZH / 2 + 40; }
  world.cam.x = p.x;
  world.cam.y = p.y;
  world.moveTarget = null;
  world.focus = null;
  world.zone = zi;
  for (const e of world.pets) { e.x = p.x; e.y = p.y; }
}

function resetWorld() {
  clearBreakables();
  world.orbs = [];
  world.texts = [];
  world.particles = [];
  world.pets = [];
  teleport(0);
  syncPets();
  ui.updateHud(0, true);
}

function syncPets() {
  const eq = state.equipped;
  world.pets = world.pets.filter(e => eq.includes(e.uid));
  const p = world.player;
  for (const uid of eq) {
    if (!world.pets.some(e => e.uid === uid)) {
      world.pets.push({ uid, x: p.x + U.rand(-40, 40), y: p.y + U.rand(-40, 40), cd: Math.random() * ATTACK_INTERVAL,
        kick: 0, kx: 0, ky: 0, face: 1, bob: Math.random() * 6 });
    }
  }
  world.pets.sort((a, b) => eq.indexOf(a.uid) - eq.indexOf(b.uid));
  ui.petBarDirty = true;
}

// ---------- Breakables ----------
function makeBreakable(type, zi, x, y) {
  const chest = type === 'chest';
  const t = BREAKABLES[type];
  const hp = chest ? F.hp(zi) * CHEST.hpMult : F.hp(zi) * t.hp;
  const b = {
    id: world.nextBid++, type, zone: zi, x, y, r: chest ? CHEST.r : t.r,
    hp, maxHp: hp, pending: 0, hit: 0, born: world.time,
    color: PRESENT_COLORS[U.randi(0, PRESENT_COLORS.length - 1)],
  };
  world.breakables.push(b);
  world.bmap.set(b.id, b);
  return b;
}

function trySpawn(zi) {
  const st = stallPos(zi), ar = arenaPos(zi), p = world.player;
  for (let i = 0; i < 12; i++) {
    const x = zi * ZW + 100 + Math.random() * (ZW - 200);
    const y = 110 + Math.random() * (ZH - 220);
    if (U.dist(x, y, st.x, st.y) < 210) continue;
    if (U.dist(x, y, ar.x, ar.y) < CHEST.arenaR + 50) continue;
    if (U.dist(x, y, p.x, p.y) < 70) continue;
    if (world.breakables.some(b => U.dist(x, y, b.x, b.y) < b.r + 52)) continue;
    const type = U.pickWeighted(BREAKABLE_TYPES, k => BREAKABLES[k].weight);
    const b = makeBreakable(type, zi, x, y);
    if (BREAKABLES[type].announce && zi === world.zone) {
      ui.toast(`💎 A <b>Gem Geode</b> appeared in ${ZONES[zi].name}!`, 'gem');
      sfx.play('geode');
    }
    return b;
  }
  return null;
}

function updateSpawns(dt) {
  const counts = {}, chestAlive = {};
  for (const b of world.breakables) {
    if (b.type === 'chest') chestAlive[b.zone] = true;
    else counts[b.zone] = (counts[b.zone] || 0) + 1;
  }
  for (let zi = 1; zi <= state.unlocked; zi++) {
    if (chestAlive[zi]) continue;
    const t = state.bossTimers[zi] || 0;
    if (t > 0) state.bossTimers[zi] = t - dt;
    else {
      const a = arenaPos(zi);
      makeBreakable('chest', zi, a.x, a.y);
      delete state.bossTimers[zi];
    }
  }
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;
  world.spawnTimer = 0.3;
  const max = breakablesPerZone();
  for (let zi = 1; zi <= state.unlocked; zi++) {
    const n = counts[zi] || 0;
    const burst = n < max / 2 ? 3 : 1;
    for (let k = 0; k < burst && n + k < max; k++) trySpawn(zi);
  }
}

const inArena = zi => {
  const a = arenaPos(zi);
  return U.dist(world.player.x, world.player.y, a.x, a.y) < CHEST.arenaR;
};

function canHit(b) {
  if (!b || !world.bmap.has(b.id)) return false;
  if (U.dist(world.player.x, world.player.y, b.x, b.y) > ATTACK_RANGE + b.r) return false;
  if (b.type === 'chest' && !inArena(b.zone)) return false;
  return true;
}

function damage(b, dmg) {
  if (!world.bmap.has(b.id)) return;
  if (b.type === 'chest' && !inArena(b.zone)) {
    addText(b.x, b.y - b.r, 'Shielded! Step into the ring', '#b8c7ff', 15, 1);
    return;
  }
  b.hp -= dmg;
  b.hit = 0.14;
  if (state.settings.dmgNumbers) addText(b.x + U.rand(-b.r * 0.6, b.r * 0.6), b.y - b.r * 0.3, U.fmt(dmg), '#ffffff', 15, 0.7);
  sfx.play('hit');
  if (b.hp <= 0) {
    if (b.type === 'chest') breakChest(b); else breakIt(b);
  }
}

function removeBreakable(b) {
  world.breakables = world.breakables.filter(x => x !== b);
  world.bmap.delete(b.id);
  if (world.focus === b.id) world.focus = null;
}

function burst(x, y, cols, n, speed = 300) {
  n = Math.round(n * (perf() ? 0.4 : 1));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = U.rand(speed * 0.3, speed);
    world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: U.rand(0.4, 0.9), age: 0,
      col: cols[i % cols.length], size: U.rand(3, 7), g: 700 });
  }
}

const TYPE_COLORS = {
  pile: ['#ffd23f', '#ffe98a'], crate: ['#b8793f', '#7a4a22'], safe: ['#9aa3b5', '#6d7688'],
  gems: ['#6ff0ff', '#c9fbff'], geode: ['#8a7ea8', '#6ff0ff', '#c9fbff'],
};

function breakIt(b) {
  removeBreakable(b);
  const t = BREAKABLES[b.type];
  const n = b.zone;
  gainCoins(coinsPerBreak(n, b.type), b.x, b.y, b.type === 'pile' ? 3 : 5);
  let gems = 0;
  if (t.gems) gems = U.randi(t.gems[0], t.gems[1]) * Math.ceil(n / 2) * gemMult();
  else if (Math.random() < NORMAL_GEM_CHANCE) gems = Math.ceil(n / 2) * gemMult();
  gainGems(gems, b.x, b.y);
  gainXp(F.xpPerKill(n) * t.xp * xpMult());
  state.stats.kills++;
  questProgress('kill', 1, n);
  burst(b.x, b.y, b.type === 'present' ? [b.color, '#fff6c9'] : TYPE_COLORS[b.type], b.type === 'geode' ? 36 : 14);
  if (b.type === 'geode') { world.shake = 10; sfx.play('bigBreak'); ui.toast(`💎 Gem Geode cracked! +${U.fmt(Math.round(gems))} gems`, 'gem'); }
  else if (b.type === 'safe') { world.shake = 3; sfx.play('break'); }
  else sfx.play('break');
}

function breakChest(b) {
  removeBreakable(b);
  const n = b.zone;
  const first = !state.bossDefeated[n];
  const coins = coinsPerBreak(n) * CHEST.repeatCoinPiles;
  gainCoins(coins, b.x, b.y, 24);
  const gems = (first ? CHEST.firstGems(n) : CHEST.repeatGems(n)) * gemMult();
  gainGems(gems, b.x, b.y);
  if (first) state.tickets.rare++;
  gainXp(F.xpPerKill(n) * CHEST.xpPiles * xpMult());
  state.bossDefeated[n] = true;
  state.bossTimers[n] = CHEST.cooldown;
  state.stats.bosses++;
  state.stats.bossesEver[n] = true;
  questProgress('boss', 1);
  world.shake = 16;
  sfx.play('bigBreak');
  burst(b.x, b.y, ['#a8612d', '#ffcc33', '#fff3a8', '#8a4f24'], 60, 460);
  ui.toast(`🧰 <b>${chestName(n)}</b> broken! +🪙 ${U.fmt(coins)} +💎 ${U.fmt(Math.round(gems))}` +
    (first ? ' + 🎟️ Rare+ Egg Ticket' : ''), 'huge');
}

// ---------- Rewards ----------
function gainCoins(c, x, y, orbCount) {
  state.coins += c;
  state.cycleCoins += c;
  state.stats.coinsEarned += c;
  questProgress('coins', c);
  world.coinAcc += c;
  const n = perf() ? Math.ceil(orbCount / 3) : orbCount;
  for (let i = 0; i < n; i++) spawnOrb(x, y, 'coin');
}

function gainGems(g, x, y) {
  g = Math.round(g);
  if (g <= 0) return;
  state.gems += g;
  state.stats.gemsEarned += g;
  for (let i = 0; i < Math.min(g, 8); i++) spawnOrb(x, y, 'gem');
  addText(x, y - 40, `+${U.fmt(g)} 💎`, '#7ff3ff', 20, 1.2);
}

function gainXp(x) {
  const levels = addXp(x);
  for (const l of levels) onLevelUp(l);
}

function onLevelUp(l) {
  const coins = coinsPerBreak(state.unlocked) * 20;
  state.coins += coins;
  let msg = `⭐ <b>Level ${l}!</b> +🪙 ${U.fmt(coins)}`;
  if (l % 5 === 0) { state.gems += 10; state.stats.gemsEarned += 10; msg += ' +💎 10'; }
  if (l % 10 === 0 && l <= 30) msg += ' · 🐾 New equip slot!';
  ui.toast(msg, 'good');
  sfx.play('levelUp');
  questProgress('level', 1);
  const p = world.player;
  burst(p.x, p.y - 20, ['#ffe066', '#ffffff', '#7ff3ff'], 24, 260);
  ui.petBarDirty = true;
}

function spawnOrb(x, y, kind) {
  const a = Math.random() * Math.PI * 2, s = U.rand(120, 280);
  world.orbs.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind, age: 0 });
}

function addText(x, y, text, color, size = 20, life = 1.1) {
  world.texts.push({ x, y, text, color, size, life, age: 0 });
  if (world.texts.length > 60) world.texts.shift();
}

// ---------- Pets & combat ----------
function targetList() {
  const p = world.player;
  const list = [];
  for (const b of world.breakables) {
    const d = U.dist(p.x, p.y, b.x, b.y);
    if (d > ATTACK_RANGE + b.r) continue;
    if (b.type === 'chest' && !inArena(b.zone)) continue;
    list.push({ b, d: d - (BREAKABLES[b.type] && BREAKABLES[b.type].sparkle ? 200 : 0) });
  }
  list.sort((a, c) => a.d - c.d);
  return list.map(x => x.b);
}

function updatePets(dt) {
  const p = world.player;
  const n = world.pets.length;
  const focus = world.focus && world.bmap.get(world.focus);
  if (world.focus && !canHit(focus)) {
    if (!focus || U.dist(p.x, p.y, focus.x, focus.y) > 800) world.focus = null;
  }
  const list = targetList();
  world.pets.forEach((e, i) => {
    const pet = findPet(e.uid);
    if (!pet) return;
    // Orbit the player.
    const a = (i / Math.max(n, 1)) * Math.PI * 2 + world.time * 0.6;
    const rad = 56 + n * 4;
    const tx = p.x + Math.cos(a) * rad, ty = p.y + Math.sin(a) * rad * 0.6 + 6;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 900) { e.x = tx; e.y = ty; } else { const k = Math.min(1, dt * 8); e.x += dx * k; e.y += dy * k; }
    e.bob += dt * 5;
    e.kick = Math.max(0, e.kick - dt * 5);
    e.cd -= dt;
    if (e.cd > 0) return;
    let target = focus && canHit(focus) && focus.pending < focus.hp ? focus : null;
    if (!target) target = list.find(b => b.pending < b.hp) || null;
    if (!target) return;
    e.cd = ATTACK_INTERVAL;
    const dmg = effectivePower(pet);
    target.pending += dmg;
    const ang = Math.atan2(target.y - e.y, target.x - e.x);
    e.kx = Math.cos(ang); e.ky = Math.sin(ang); e.kick = 1;
    e.face = target.x > e.x ? 1 : -1;
    world.shots.push({ x: e.x, y: e.y - 8, tid: target.id, dmg, color: RARITIES[PETS[pet.id].rarity].color, trail: [] });
  });
}

function updateShots(dt) {
  world.shots = world.shots.filter(s => {
    const b = world.bmap.get(s.tid);
    if (!b) return false;
    const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy) || 1;
    const step = 950 * dt;
    s.trail.push(s.x, s.y);
    if (s.trail.length > 8) s.trail.splice(0, 2);
    if (d <= step + b.r * 0.5) {
      b.pending = Math.max(0, b.pending - s.dmg);
      if (!perf()) burst(b.x - dx / d * b.r * 0.6, b.y - dy / d * b.r * 0.6, [s.color, '#ffffff'], 3, 120);
      damage(b, s.dmg);
      return false;
    }
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    return true;
  });
}

// ---------- Player ----------
function autoTarget() {
  const p = world.player;
  const zi = zoneAt(p.x);
  if (zi < 1) return null;
  let best = null, bestD = Infinity;
  for (const b of world.breakables) {
    if (b.zone !== zi || b.type === 'chest') continue;
    let d = U.dist(p.x, p.y, b.x, b.y);
    if (BREAKABLES[b.type].sparkle) d -= 250; // prefer gem piles
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function updatePlayer(dt) {
  const p = world.player;
  const k = world.keys;
  let mx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
  let my = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
  if (mx || my) world.moveTarget = null;
  else if (world.moveTarget) {
    const dx = world.moveTarget.x - p.x, dy = world.moveTarget.y - p.y, d = Math.hypot(dx, dy);
    if (d < 8) world.moveTarget = null; else { mx = dx / d; my = dy / d; }
  } else if (state.autoFarm && !ui.isOpen()) {
    // Auto farm: walk toward breakables when nothing is in range.
    const t = autoTarget();
    if (t) {
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      const busy = targetList().some(b => b.type !== 'chest');
      if (d > 150 && !(busy && d > ATTACK_RANGE)) { mx = dx / d; my = dy / d; }
    }
  }
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    const sp = walkSpeed();
    p.x += (mx / len) * sp * dt;
    p.y += (my / len) * sp * dt;
    if (Math.abs(mx) > 0.1) p.facing = mx > 0 ? 1 : -1;
    p.walk += dt * 12;
    world.dustTimer -= dt;
    if (world.dustTimer <= 0 && !perf()) {
      world.dustTimer = 0.09;
      world.particles.push({ x: p.x + U.rand(-8, 8), y: p.y + 22, vx: U.rand(-20, 20), vy: U.rand(-30, -10),
        life: 0.5, age: 0, col: 'rgba(255,255,255,0.55)', size: U.rand(4, 7), g: 0, round: true });
    }
  }
  p.x = U.clamp(p.x, 28, (state.unlocked + 1) * ZW - 28);
  p.y = U.clamp(p.y, 40, ZH - 28);
  // Don't walk into the fountain.
  const fd = U.dist(p.x, p.y, fountainPos.x, fountainPos.y);
  if (fd < 95) { p.x = fountainPos.x + (p.x - fountainPos.x) / fd * 95; p.y = fountainPos.y + (p.y - fountainPos.y) / fd * 95; }

  const z = zoneAt(p.x);
  if (z !== world.zone) {
    world.zone = z;
    world.ambient = [];
    ui.zoneBanner(ZONES[z].name, z === 0 ? 'Welcome to' : `Zone ${z}`);
  }
}

// ---------- Effects ----------
function updateOrbs(dt) {
  const p = world.player;
  let coin = false, gem = false;
  world.orbs = world.orbs.filter(o => {
    o.age += dt;
    const dx = p.x - o.x, dy = p.y - 10 - o.y, d = Math.hypot(dx, dy) || 1;
    if (o.age > 0.3) {
      const s = 500 + o.age * 900;
      o.vx = dx / d * s; o.vy = dy / d * s;
    } else { o.vx *= Math.pow(0.02, dt); o.vy *= Math.pow(0.02, dt); }
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    if (o.age > 0.3 && d < 20) { if (o.kind === 'coin') coin = true; else gem = true; return false; }
    return o.age < 3;
  });
  if (coin) { sfx.play('coin'); ui.bump('coin'); }
  if (gem) { sfx.play('gem'); ui.bump('gem'); }
  world.coinTimer -= dt;
  if (world.coinAcc > 0 && world.coinTimer <= 0) {
    addText(p.x + U.rand(-24, 24), p.y - 50, `+${U.fmt(world.coinAcc)}`, '#ffe066', 21, 1.1);
    world.coinAcc = 0;
    world.coinTimer = 0.35;
  }
}

function updateEffects(dt) {
  world.texts = world.texts.filter(t => (t.age += dt) < t.life);
  world.particles = world.particles.filter(q => {
    q.age += dt;
    q.vy += q.g * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    return q.age < q.life;
  });
  if (world.particles.length > 500) world.particles.splice(0, world.particles.length - 500);
  world.ripples = world.ripples.filter(r => (r.age += dt) < 0.5);
  for (const b of world.breakables) if (b.hit > 0) b.hit -= dt;
  world.shake *= Math.exp(-dt * 9);
}

const AMBIENT = {
  petal:   { n: 18, vx: [15, 40], vy: [20, 45], cols: ['#ffb3d1', '#fff0f6', '#ffd6e7'], size: [4, 7], shape: 'leaf' },
  leaf:    { n: 22, vx: [20, 50], vy: [30, 60], cols: ['#8bc34a', '#cddc39', '#ffb74d'], size: [5, 9], shape: 'leaf' },
  sand:    { n: 30, vx: [140, 220], vy: [-10, 10], cols: ['#f7d9a0', '#fff1cf'], size: [1.5, 3], shape: 'dot' },
  snow:    { n: 45, vx: [-15, 15], vy: [40, 80], cols: ['#ffffff'], size: [2, 4.5], shape: 'dot' },
  ember:   { n: 30, vx: [-15, 15], vy: [-70, -30], cols: ['#ff7b00', '#ffb300', '#ff4500'], size: [2, 3.5], shape: 'glow' },
  sparkle: { n: 24, vx: [-5, 5], vy: [-12, 4], cols: ['#ff9ad5', '#9ae6ff', '#fff59a', '#c5a3ff'], size: [3, 6], shape: 'star' },
  star:    { n: 40, vx: [-2, 2], vy: [-2, 2], cols: ['#ffffff', '#cfd6ff'], size: [1, 2.5], shape: 'star' },
};

function updateAmbient(dt) {
  const A = AMBIENT[ZONES[zoneAt(world.cam.x)].ambient];
  world.ambient = world.ambient.filter(a => {
    a.age += dt; a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.vr * dt;
    return a.age < a.life;
  });
  if (!A || perf()) { world.ambient = []; return; }
  const x0 = world.cam.x - W / 2, y0 = world.cam.y - H / 2;
  const target = Math.round(A.n * Math.min(1.6, (W * H) / (1280 * 760)));
  while (world.ambient.length < target) {
    world.ambient.push({
      x: x0 + Math.random() * W, y: y0 + Math.random() * H, vx: U.rand(...A.vx), vy: U.rand(...A.vy),
      col: A.cols[Math.floor(Math.random() * A.cols.length)], size: U.rand(...A.size), rot: Math.random() * 6,
      vr: U.rand(-2, 2), age: 0, life: U.rand(3, 7), shape: A.shape,
    });
  }
}

// ---------- Eggs, gates, chests ----------
function nearStall() {
  const zi = zoneAt(world.player.x);
  const s = stallPos(zi);
  return U.dist(world.player.x, world.player.y, s.x, s.y + 60) < 170 ? zi : -1;
}
const nextGate = () => (state.unlocked < LAST_ZONE ? state.unlocked + 1 : -1);
const nearGate = () => { const n = nextGate(); return n > 0 && world.player.x > n * ZW - 190 ? n : -1; };

function tryUnlock(n) {
  const z = ZONES[n];
  if (!zoneReqMet(n)) { ui.toast(`🔒 ${z.name} needs ${zoneReqText(n)}`, 'bad'); sfx.play('error'); return; }
  if (state.coins < z.gateCost) { ui.toast(`Need 🪙 ${U.fmt(z.gateCost - state.coins)} more to unlock ${z.name}`, 'bad'); sfx.play('error'); return; }
  unlockZone(n);
  ui.toast(`🔓 Unlocked <b>${z.name}</b>!`, 'good');
  sfx.play('unlock');
  world.shake = 8;
  burst(n * ZW, world.player.y, ['#b48cff', '#ffffff', '#ffe066'], 40, 400);
  saveState();
}

function skipChest(zi) {
  const c = CHEST.skipCost(zi);
  if (state.gems < c) { ui.toast(`Need 💎 ${c} to skip the timer`, 'bad'); sfx.play('error'); return; }
  state.gems -= c;
  state.bossTimers[zi] = 0;
  sfx.play('buy');
}

// opts: { lucky, ticket, fast }
function hatch(zi, count, opts = {}) {
  if (ui.hatching) return false;
  const { lucky = false, ticket = null, fast = false } = opts;
  const z = ZONES[zi];
  let cost = 0, cur = 'coins';
  if (ticket) {
    if (state.tickets[ticket] <= 0) return false;
    count = 1;
  } else if (zi === 0) {
    if (state.starterCooldown > 0) { if (!fast) { ui.toast(`Starter Egg ready in ${Math.ceil(state.starterCooldown)}s`, 'bad'); sfx.play('error'); } return false; }
    count = 1;
  } else {
    cost = lucky ? F.luckyEggCost(zi) : z.eggCost;
    cur = lucky ? 'gems' : 'coins';
    count = Math.min(count, Math.floor(state[cur] / cost));
    if (count <= 0) {
      if (!fast) { ui.toast(`Not enough ${cur === 'coins' ? '🪙 coins' : '💎 gems'}: ${lucky ? 'Lucky ' : ''}${z.egg} costs ${U.fmt(cost)}`, 'bad'); sfx.play('error'); }
      return false;
    }
  }
  if (state.pets.length + count > MAX_PETS) {
    ui.toast('Pet inventory full! Sell some pets first.', 'bad');
    state.autoHatch = false;
    ui.refreshToggles();
    return false;
  }
  if (ticket) state.tickets[ticket]--;
  else if (zi === 0) state.starterCooldown = STARTER_COOLDOWN;
  else state[cur] -= cost * count;

  const results = [];
  let best = 0;
  for (let i = 0; i < count; i++) {
    const r = rollEgg(zi, { lucky, minRarity: ticket });
    const isNew = !state.discovered[r.id] && !results.some(x => x.id === r.id);
    addPet(r.id, r.variant);
    results.push({ ...r, isNew });
    state.stats.hatched++;
    const d = PETS[r.id];
    const rank = RARITY_ORDER.indexOf(d.rarity);
    best = Math.max(best, rank, r.variant >= 2 ? 4 : r.variant === 1 ? 2 : 0);
    const vName = VARIANTS[r.variant].name;
    if (rank >= 4 || r.variant >= 2) {
      ui.toast(`${rank === 5 ? '🟥' : '✨'} You hatched a <b style="color:${RARITIES[d.rarity].color}">${vName ? vName + ' ' : ''}${RARITIES[d.rarity].name} ${d.name}</b>!`, rank === 5 || r.variant >= 2 ? 'huge' : 'good');
    }
  }
  questProgress('hatch', count);
  syncPets();
  ui.showHatch(zi, results, fast, best);
  ui.updateHud(0);
  if (ui.current === 'egg' || ui.current === 'pets') ui.refresh();
  return true;
}

function updateAutoHatch(dt) {
  world.autoHatchTimer -= dt;
  if (!state.autoHatch || !tl('autoHatch') || ui.hatching || world.autoHatchTimer > 0) return;
  const zi = nearStall();
  if (zi < 1) return;
  world.autoHatchTimer = 0.3;
  hatch(zi, 10, { fast: true });
}

function updatePrompt() {
  if (ui.isOpen()) { ui.setPrompt(null); return; }
  const g = nearGate();
  if (g > 0) {
    const z = ZONES[g];
    if (zoneReqMet(g)) ui.setPrompt(`🔓 Unlock <b>${z.name}</b> · 🪙 ${U.fmt(z.gateCost)} <kbd>E</kbd>`, () => tryUnlock(g));
    else ui.setPrompt(`🔒 <b>${z.name}</b> needs ${zoneReqText(g)}`, () => tryUnlock(g));
    return;
  }
  const s = nearStall();
  if (s >= 0) {
    ui.setPrompt(`🥚 Open <b>${ZONES[s].egg}</b> shop <kbd>E</kbd>`, () => ui.open('egg', s));
    return;
  }
  const zi = zoneAt(world.player.x);
  if (zi >= 1 && inArena(zi) && !world.breakables.some(b => b.type === 'chest' && b.zone === zi)) {
    const t = state.bossTimers[zi] || 0;
    ui.setPrompt(`⏳ ${chestName(zi)} returns in ${fmtTime(t)} · Skip 💎 ${CHEST.skipCost(zi)} <kbd>E</kbd>`, () => skipChest(zi));
    return;
  }
  ui.setPrompt(null);
}

function periodicChecks() {
  for (const a of checkAchievements()) {
    ui.toast(`🏅 Achievement: <b>${a.name}</b> +💎 ${a.gems}`, 'good');
    sfx.play('achieve');
  }
  for (const m of checkIndexRewards()) { ui.toast(m, 'good'); sfx.play('achieve'); }
  ensureQuests();
  const g = nextGate();
  if (g > 0 && zoneReqMet(g) && world.gateNotified !== g) {
    world.gateNotified = g;
    ui.toast(`🗺️ <b>${ZONES[g].name}</b> is ready to unlock! Head to the gate.`, 'good');
  }
}

// ---------- Rebirth ----------
function rebirth() {
  const tokens = doRebirth();
  if (!tokens) return false;
  clearBreakables();
  world.orbs = [];
  world.gateNotified = 0;
  world.pets = [];
  teleport(0);
  syncPets();
  ui.zoneBanner(`Rebirth ${state.rebirths}!`, `+${tokens} Rebirth Token${tokens > 1 ? 's' : ''}`);
  ui.toast(`🌀 Rebirth ${state.rebirths}! Coins x${F.rebirthCoinMult(state.rebirths).toFixed(2)}, Power x${F.rebirthPowerMult(state.rebirths).toFixed(2)}. Spend your tokens in Rebirth → Token Tree.`, 'huge');
  sfx.play('unlock');
  world.shake = 14;
  ui.refreshToggles();
  ui.updateHud(0, true);
  saveState();
  return true;
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
    if (z.hub) {
      ctx.strokeStyle = 'rgba(120,100,70,0.18)';
      ctx.lineWidth = 2;
      for (let ty = ty0; ty < ty1; ty++) {
        ctx.beginPath(); ctx.moveTo(Math.max(zx, x0), ty * T); ctx.lineTo(Math.min(zx + ZW, x1), ty * T); ctx.stroke();
      }
    }
    ctx.fillStyle = z.edge;
    ctx.fillRect(zx, -30, ZW, 30);
    ctx.fillRect(zx, ZH, ZW, 30);
    if (zi === 0) ctx.fillRect(-30, -30, 30, ZH + 60);
    if (zi === LAST_ZONE) ctx.fillRect(zx + ZW, -30, 30, ZH + 60);
  }
}

function drawShadow(x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEggShape(x, y, r, col, spot, gold = false) {
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
    ctx.beginPath(); ctx.arc(a * r, b * r, s * r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
  ctx.lineWidth = gold ? 4 : 3;
  ctx.strokeStyle = gold ? '#ffcc33' : 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(text, x, y, size, color = '#fff') {
  ctx.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawStall(zi) {
  const z = ZONES[zi];
  const s = stallPos(zi);
  const t = world.time;
  const accent = z.accent || '#ff8a3d';
  drawShadow(s.x, s.y + 70, 150, 26);
  ctx.fillStyle = '#8a5a34';
  roundRect(ctx, s.x - 140, s.y + 20, 280, 50, 10); ctx.fill();
  ctx.fillStyle = '#a8703f';
  roundRect(ctx, s.x - 140, s.y + 20, 280, 16, 8); ctx.fill();
  ctx.fillStyle = '#6e4526';
  ctx.fillRect(s.x - 132, s.y - 70, 10, 92);
  ctx.fillRect(s.x + 122, s.y - 70, 10, 92);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : accent;
    ctx.beginPath();
    ctx.moveTo(s.x - 150 + i * 37.5, s.y - 70);
    ctx.lineTo(s.x - 150 + (i + 1) * 37.5, s.y - 70);
    ctx.lineTo(s.x - 150 + (i + 1) * 37.5, s.y - 40);
    ctx.arc(s.x - 150 + (i + 0.5) * 37.5, s.y - 40, 18.75, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  }
  const bob = Math.sin(t * 2 + zi) * 5;
  if (z.hub) {
    drawEggShape(s.x, s.y - 2 + bob, 34, z.eggColor, z.eggSpots);
    drawLabel(z.egg, s.x, s.y - 100, 22);
    const cd = state.starterCooldown;
    drawLabel(cd > 0 ? `Ready in ${Math.ceil(cd)}s` : 'FREE', s.x, s.y - 76, 17, cd > 0 ? '#ffd0d0' : '#7dff8c');
  } else {
    drawEggShape(s.x - 50, s.y - 2 + bob, 32, z.eggColor, z.eggSpots);
    drawEggShape(s.x + 50, s.y - 2 - bob, 32, z.eggColor, '#ffe066', true);
    if (!perf()) {
      ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3;
      drawEmoji(ctx, '✨', s.x + 74, s.y - 30 - bob, 22);
      ctx.globalAlpha = 1;
    }
    drawLabel(z.egg, s.x, s.y - 100, 22);
    drawLabel(`🪙 ${U.fmt(z.eggCost)}   ·   Lucky 💎 ${F.luckyEggCost(zi)}`, s.x, s.y - 76, 15, '#ffe066');
  }
}

function drawFountain() {
  const f = fountainPos, t = world.time;
  drawShadow(f.x, f.y + 20, 100, 30);
  ctx.fillStyle = '#9aa0ad';
  ctx.beginPath(); ctx.ellipse(f.x, f.y + 10, 95, 40, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5fb8ff';
  ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 80, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const r = ((t * 30 + i * 25) % 75);
    ctx.globalAlpha = 1 - r / 75;
    ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, r, r * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#b8bdc8';
  ctx.fillRect(f.x - 10, f.y - 50, 20, 55);
  ctx.fillStyle = '#9ad8ff';
  for (let i = 0; i < 6; i++) {
    const a = (t * 3 + i) % 1;
    ctx.beginPath(); ctx.arc(f.x + (i - 2.5) * 8 * a, f.y - 55 + a * a * 50 - a * 20, 3, 0, Math.PI * 2); ctx.fill();
  }
  drawLabel('Pet Sim Astra', f.x, f.y - 90, 26, '#ffe066');
  drawLabel('Meadow →', ZW - 120, SPAWN.y, 22);
}

function drawArena(zi) {
  const a = arenaPos(zi);
  const z = ZONES[zi];
  const alive = world.breakables.find(b => b.type === 'chest' && b.zone === zi);
  const inside = inArena(zi);
  ctx.save();
  ctx.fillStyle = inside ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  ctx.beginPath(); ctx.ellipse(a.x, a.y + 20, CHEST.arenaR, CHEST.arenaR * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = z.accent || '#fff';
  ctx.lineWidth = 5;
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -world.time * 20;
  ctx.globalAlpha = alive ? 0.9 : 0.4;
  ctx.beginPath(); ctx.ellipse(a.x, a.y + 20, CHEST.arenaR, CHEST.arenaR * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (!alive) {
    drawLabel(chestName(zi), a.x, a.y - 10, 18, '#ffffff');
    drawLabel(`returns in ${fmtTime(state.bossTimers[zi] || 0)}`, a.x, a.y + 16, 16, '#ffd0a0');
  } else if (!inside) {
    drawLabel('Stand in the ring to break it', a.x, a.y + CHEST.arenaR * 0.62 + 34, 15, '#ffffff');
  }
}

function drawBreakable(b) {
  const t = BREAKABLES[b.type];
  const pop = Math.min(1, (world.time - b.born) * 5);
  const h = b.hit > 0 ? b.hit / 0.14 : 0;
  const sx = (1 + 0.12 * h) * pop, sy = (1 - 0.1 * h) * pop;
  const r = b.r;
  drawShadow(b.x, b.y + r * 0.55, r * 1.05, r * 0.35);

  if (t && t.sparkle) {
    const pulse = 0.35 + Math.sin(world.time * 4 + b.id) * 0.15;
    const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, r * 2.4);
    g.addColorStop(0, `rgba(111,240,255,${pulse})`);
    g.addColorStop(1, 'rgba(111,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
  }
  if (world.focus === b.id) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -world.time * 30;
    ctx.beginPath(); ctx.ellipse(b.x, b.y + r * 0.55, r * 1.25, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(sx, sy);
  switch (b.type) {
    case 'pile': {
      for (const [cx, cy] of [[-12, 8], [12, 8], [0, 10], [-6, -2], [8, -2], [1, -12]]) {
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
    case 'gems': {
      const gem = (x, y, s, c1, c2) => {
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.75, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.75, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y - s * 0.1); ctx.lineTo(x - s * 0.3, y - s * 0.1); ctx.closePath(); ctx.fill();
      };
      gem(-12, 8, 12, '#2fd3f0', '#c9fbff');
      gem(12, 8, 12, '#28b8e0', '#c9fbff');
      gem(0, -6, 16, '#6ff0ff', '#ffffff');
      break;
    }
    case 'geode': {
      ctx.fillStyle = '#6f6488';
      ctx.beginPath(); ctx.ellipse(0, 4, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a7ea8';
      ctx.beginPath(); ctx.ellipse(-4, -2, r * 0.85, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      for (const [cx, cy, s, a] of [[-14, -8, 18, -0.3], [8, -14, 24, 0.2], [20, 2, 14, 0.6], [-2, 6, 12, 0]]) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        ctx.fillStyle = '#6ff0ff';
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.35, 0); ctx.lineTo(0, s * 0.4); ctx.lineTo(-s * 0.35, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.12, -s * 0.2); ctx.lineTo(-s * 0.12, -s * 0.2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'chest': {
      const shielded = !inArena(b.zone);
      ctx.fillStyle = '#8a4f24';
      roundRect(ctx, -r, -r * 0.3, r * 2, r * 1.1, 10); ctx.fill();
      ctx.fillStyle = '#a8612d';
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.2); ctx.quadraticCurveTo(0, -r * 1.3, r, -r * 0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(-r, -r * 0.28, r * 2, 12);
      ctx.fillRect(-r * 0.62, -r * 0.82, 14, r * 1.6);
      ctx.fillRect(r * 0.62 - 14, -r * 0.82, 14, r * 1.6);
      roundRect(ctx, -18, -r * 0.35, 36, 36, 6); ctx.fill();
      ctx.fillStyle = '#5b3316';
      ctx.beginPath(); ctx.arc(0, -r * 0.35 + 16, 6, 0, Math.PI * 2); ctx.fill();
      if (shielded) {
        ctx.fillStyle = 'rgba(150,180,255,0.18)';
        ctx.strokeStyle = 'rgba(190,210,255,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 1.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      break;
    }
  }
  const ratio = b.hp / b.maxHp;
  if (ratio < 0.66 && b.type !== 'pile' && b.type !== 'gems') {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    const lines = ratio < 0.33 ? 4 : 2;
    for (let i = 0; i < lines; i++) {
      const a = (b.id * 1.7 + i * 1.9) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.lineTo(Math.cos(a + 0.4) * r * 0.8, Math.sin(a + 0.4) * r * 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (b.type === 'chest') {
    const w = 190, y = b.y - r * 1.35 - 24;
    drawLabel(chestName(b.zone), b.x, y - 18, 17, '#ffe066');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, b.x - w / 2 - 3, y - 3, w + 6, 16, 8); ctx.fill();
    ctx.fillStyle = '#ff9a3d';
    roundRect(ctx, b.x - w / 2, y, Math.max(6, w * ratio), 10, 5); ctx.fill();
  } else if (b.hp < b.maxHp) {
    const w = Math.max(50, r * 2), y = b.y - r - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, b.x - w / 2 - 2, y - 2, w + 4, 11, 5); ctx.fill();
    ctx.fillStyle = '#5dea6b';
    roundRect(ctx, b.x - w / 2, y, Math.max(4, w * ratio), 7, 3.5); ctx.fill();
  }
}

function drawSparkle(x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25);
  ctx.closePath();
  ctx.fill();
}

function drawPet(e) {
  const pet = findPet(e.uid);
  if (!pet) return;
  const d = PETS[pet.id];
  const v = pet.variant || 0;
  const size = 40;
  const hop = Math.abs(Math.sin(e.bob)) * 5;
  const px = e.x + e.kx * e.kick * 10, py = e.y + e.ky * e.kick * 10 - hop;
  drawShadow(e.x, e.y + 18, 15, 5);
  const rank = RARITY_ORDER.indexOf(d.rarity);
  if (rank >= 3 || v >= 2) {
    const glow = v === 3 ? `hsl(${(world.time * 140) % 360},100%,60%)` : v === 2 ? '#ffd23f' : RARITIES[d.rarity].color;
    const pulse = rank === 5 ? 0.55 + Math.sin(world.time * 8) * 0.2 : 0.4;
    const g = ctx.createRadialGradient(px, py, 2, px, py, size * 0.85);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = pulse;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, size * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(-e.face, 1); // emoji animals face left
  drawEmoji(ctx, d.emoji, 0, 0, size, VARIANTS[v].tint);
  ctx.restore();
  if (v === 1 && !perf()) {
    for (let i = 0; i < 3; i++) {
      const a = world.time * 2 + i * 2.1 + e.uid;
      const tw = (Math.sin(world.time * 6 + i * 3 + e.uid) + 1) / 2;
      drawSparkle(px + Math.cos(a) * 22, py + Math.sin(a) * 18, 3 + tw * 4, `rgba(255,255,255,${0.4 + tw * 0.6})`);
    }
  }
}

function drawPlayer() {
  const p = world.player;
  const bob = p.moving ? Math.abs(Math.sin(p.walk)) * 4 : 0;
  drawShadow(p.x, p.y + 24, 22, 8);
  ctx.save();
  ctx.translate(p.x, p.y - bob);
  const step = p.moving ? Math.sin(p.walk) * 5 : 0;
  ctx.fillStyle = '#2b3a67';
  ctx.beginPath(); ctx.ellipse(-8 + step, 20, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(8 - step, 20, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d8bff';
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath(); ctx.arc(p.facing * 6, -4, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(p.facing * 6 - 5, -6, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.facing * 6 + 5, -6, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.facing * 6, -1, 5, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = '#ff5c5c';
  ctx.beginPath(); ctx.arc(0, -12, 20, Math.PI, 0); ctx.fill();
  ctx.fillRect(p.facing > 0 ? 0 : -28, -13, 28, 5);
  ctx.restore();
  drawLabel(state.rebirths ? `🌀${state.rebirths}  You` : 'You', p.x, p.y - 50, 15);
  drawLabel(`Lv ${state.level}`, p.x, p.y - 33, 12, '#ffe066');
}

function drawShot(s) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (let i = 0; i < s.trail.length; i += 2) {
    if (i === 0) ctx.moveTo(s.trail[i], s.trail[i + 1]); else ctx.lineTo(s.trail[i], s.trail[i + 1]);
  }
  ctx.lineTo(s.x, s.y);
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = s.color;
  ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
}

function drawOrb(o) {
  if (o.kind === 'coin') {
    ctx.fillStyle = '#c98f0e';
    ctx.beginPath(); ctx.arc(o.x, o.y + 1.5, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(o.x, o.y, 7, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#5ee7ff';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - 9); ctx.lineTo(o.x + 7, o.y); ctx.lineTo(o.x, o.y + 9); ctx.lineTo(o.x - 7, o.y);
    ctx.closePath(); ctx.fill();
  }
}

function drawGate() {
  const n = nextGate();
  if (n < 0) return;
  const x = n * ZW;
  const z = ZONES[n];
  const t = world.time;
  ctx.fillStyle = 'rgba(10,10,30,0.45)';
  ctx.fillRect(x, -30, (ZONES.length - n) * ZW + 30, ZH + 60);
  const g = ctx.createLinearGradient(x - 24, 0, x + 24, 0);
  g.addColorStop(0, 'rgba(140,90,255,0)');
  g.addColorStop(0.5, `rgba(170,120,255,${0.55 + Math.sin(t * 3) * 0.15})`);
  g.addColorStop(1, 'rgba(140,90,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 24, -30, 48, ZH + 60);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let y = (t * 80) % 60 - 60; y < ZH; y += 60) ctx.fillRect(x - 2, y, 4, 26);
  const sx = x + GATE_SIGN_OFFSET, sy = ZH / 2;
  const ready = zoneReqMet(n);
  ctx.fillStyle = 'rgba(25,18,60,0.92)';
  roundRect(ctx, sx - 130, sy - 70, 260, 140, 18); ctx.fill();
  ctx.strokeStyle = ready ? '#7dff8c' : '#b48cff'; ctx.lineWidth = 3;
  roundRect(ctx, sx - 130, sy - 70, 260, 140, 18); ctx.stroke();
  drawLabel(`${ready ? '🔓' : '🔒'} ${z.name}`, sx, sy - 36, 26);
  drawLabel(ready ? 'Requirement met!' : zoneReqText(n), sx, sy + 2, 16, ready ? '#7dff8c' : '#ffd0a0');
  drawLabel(`🪙 ${U.fmt(z.gateCost)}`, sx, sy + 36, 22, state.coins >= z.gateCost ? '#7dff8c' : '#ffe066');
}

function guideGoal() {
  const p = world.player;
  const zi = zoneAt(p.x);
  const g = nextGate();
  if (zi === 0 && state.starterCooldown <= 0 && state.stats.hatched < 3 && nearStall() < 0) {
    const s = stallPos(0);
    return { x: s.x, y: s.y + 80, label: 'Free egg!' };
  }
  if (zi === 0 && state.stats.kills < 10) return { x: ZW + 200, y: p.y, label: 'Break coin piles!' };
  if (g > 0 && zoneReqMet(g) && state.coins >= ZONES[g].gateCost) return { x: g * ZW - 60, y: U.clamp(p.y, 150, ZH - 150), label: 'New zone!' };
  if (zi >= 1 && state.coins >= ZONES[zi].eggCost && state.stats.hatched < 30 && nearStall() < 0) {
    const s = stallPos(zi);
    return { x: s.x, y: s.y + 80, label: 'Hatch pets!' };
  }
  return null;
}

function drawGuide() {
  const goal = guideGoal();
  if (!goal) return;
  const p = world.player;
  const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy);
  if (d < 260) return;
  const a = Math.atan2(dy, dx);
  const r = 78 + Math.sin(world.time * 6) * 6;
  const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = '#ffb340';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
  drawLabel(goal.label, x, y - 22, 13, '#ffe0a0');
}

function drawAmbient() {
  for (const a of world.ambient) {
    const alpha = Math.sin(Math.PI * a.age / a.life) * 0.85;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = a.col;
    if (a.shape === 'leaf') {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, a.size, a.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (a.shape === 'glow') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.25;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.size * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (a.shape === 'star') {
      drawSparkle(a.x, a.y, a.size * (0.6 + 0.4 * Math.sin(world.time * 5 + a.rot * 3)), a.col);
    } else {
      ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#141833';
  ctx.fillRect(0, 0, W, H);
  let sx = 0, sy = 0;
  if (state.settings.shake && world.shake > 0.2) {
    sx = (Math.random() - 0.5) * world.shake * 2;
    sy = (Math.random() - 0.5) * world.shake * 2;
  }
  const x0 = world.cam.x - W / 2 + sx, y0 = world.cam.y - H / 2 + sy;
  ctx.save();
  ctx.translate(-Math.round(x0), -Math.round(y0));
  drawGround(x0, y0);

  const vis = (x, y, m = 140) => x > x0 - m && x < x0 + W + m && y > y0 - m && y < y0 + H + m;
  for (let zi = 1; zi < ZONES.length; zi++) { const a = arenaPos(zi); if (vis(a.x, a.y, 260)) drawArena(zi); }
  for (const r of world.ripples) {
    ctx.strokeStyle = `rgba(255,255,255,${1 - r.age * 2})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + r.age * 50, (8 + r.age * 50) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  }

  const items = [];
  for (const d of world.decos) if (vis(d.x, d.y)) items.push({ y: d.y, draw: () => {
    ctx.save(); ctx.translate(d.x, d.y); if (d.flip) ctx.scale(-1, 1);
    drawEmoji(ctx, d.ch, 0, -d.size * 0.35, d.size); ctx.restore();
  } });
  for (let zi = 0; zi < ZONES.length; zi++) {
    const s = stallPos(zi);
    if (vis(s.x, s.y, 220)) items.push({ y: s.y + 60, draw: () => drawStall(zi) });
  }
  if (vis(fountainPos.x, fountainPos.y, 200)) items.push({ y: fountainPos.y + 20, draw: drawFountain });
  for (const b of world.breakables) if (vis(b.x, b.y)) items.push({ y: b.y, draw: () => drawBreakable(b) });
  for (const e of world.pets) items.push({ y: e.y, draw: () => drawPet(e) });
  items.push({ y: world.player.y, draw: drawPlayer });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  for (const s of world.shots) drawShot(s);
  for (const o of world.orbs) drawOrb(o);
  for (const q of world.particles) {
    ctx.globalAlpha = 1 - q.age / q.life;
    ctx.fillStyle = q.col;
    if (q.round) { ctx.beginPath(); ctx.arc(q.x, q.y, q.size / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  drawGate();
  if (world.moveTarget) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(world.moveTarget.x, world.moveTarget.y, 14, 6, 0, 0, Math.PI * 2); ctx.stroke();
  }
  drawGuide();
  for (const t of world.texts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, (t.life - t.age) * 3));
    drawLabel(t.text, t.x, t.y - t.age * 45, t.size, t.color);
  }
  ctx.globalAlpha = 1;
  drawAmbient();
  ctx.restore();

  if (!vignette) {
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,20,0.35)');
  }
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

// ---------- Input ----------
function screenToWorld(sx, sy) { return { x: sx + world.cam.x - W / 2, y: sy + world.cam.y - H / 2 }; }

function breakableAt(w) {
  let best = null, bestD = Infinity;
  for (const b of world.breakables) {
    const d = U.dist(w.x, w.y, b.x, b.y);
    if (d < b.r + 16 && d < bestD) { best = b; bestD = d; }
  }
  return best;
}

function handleWorldClick(sx, sy) {
  const w = screenToWorld(sx, sy);
  const p = world.player;
  const b = breakableAt(w);
  if (b) {
    world.focus = b.id;
    if (b.type === 'chest' && !inArena(b.zone)) world.moveTarget = { x: b.x, y: b.y + b.r + 40 };
    else if (U.dist(p.x, p.y, b.x, b.y) > ATTACK_RANGE - 40) world.moveTarget = { x: b.x, y: b.y + b.r + 40 };
    return;
  }
  const zi = zoneAt(w.x);
  const s = stallPos(zi);
  if (zi <= state.unlocked && Math.abs(w.x - s.x) < 150 && w.y > s.y - 110 && w.y < s.y + 75) {
    if (nearStall() === zi) ui.open('egg', zi); else world.moveTarget = { x: s.x, y: s.y + 120 };
    return;
  }
  const g = nextGate();
  if (g > 0 && Math.abs(w.x - (g * ZW + GATE_SIGN_OFFSET)) < 135 && Math.abs(w.y - ZH / 2) < 75) {
    if (nearGate() === g) tryUnlock(g); else world.moveTarget = { x: g * ZW - 80, y: ZH / 2 };
    return;
  }
  world.moveTarget = w;
  world.ripples.push({ x: w.x, y: w.y, age: 0 });
}

function setupInput() {
  const firstInteract = () => sfx.unlock();
  window.addEventListener('pointerdown', firstInteract);
  window.addEventListener('keydown', e => {
    firstInteract();
    if (e.target.matches && e.target.matches('input, select, textarea')) {
      if (e.code === 'Escape') ui.close();
      if (e.code === 'Enter' && e.target.id === 'code-input') ui.act('redeem', {});
      return;
    }
    if (e.code === 'Backquote') { ui.toggle('dev'); return; }
    if (e.repeat && ['KeyE', 'KeyP', 'KeyQ', 'KeyI', 'KeyR', 'KeyF'].includes(e.code)) return;
    world.keys[e.code] = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'Escape') { if (ui.hatching) ui.endHatch(); else ui.close(); }
    if (e.code === 'KeyE') {
      if (ui.hatching) return;
      if (ui.current === 'egg') game.hatch(ui.arg, 1);
      else ui.runPrompt();
    }
    if (e.code === 'KeyP') ui.toggle('pets');
    if (e.code === 'KeyQ') ui.toggle('quests');
    if (e.code === 'KeyI') ui.toggle('index');
    if (e.code === 'KeyR') ui.toggle('rebirth');
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
    const w = screenToWorld(e.clientX, e.clientY);
    canvas.style.cursor = breakableAt(w) ? 'pointer' : 'default';
    if (world.pointerDown && world.moveTarget) world.moveTarget = w;
  });
  window.addEventListener('pointerup', () => { world.pointerDown = false; });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });
  window.addEventListener('beforeunload', saveState);
}

// ---------- Main loop ----------
function step(dt) {
  world.time += dt;
  state.stats.playTime += dt;
  if (state.starterCooldown > 0) state.starterCooldown = Math.max(0, state.starterCooldown - dt);
  for (const id of Object.keys(state.boosts)) {
    state.boosts[id] -= dt;
    if (state.boosts[id] <= 0) { delete state.boosts[id]; ui.toast(`${BOOSTS[id].icon} ${BOOSTS[id].name} ended`); }
  }
  updatePlayer(dt);
  updateSpawns(dt);
  updatePets(dt);
  updateShots(dt);
  updateOrbs(dt);
  updateEffects(dt);
  updateAmbient(dt);
  updatePrompt();
  updateAutoHatch(dt);
  world.checkTimer -= dt;
  if (world.checkTimer <= 0) { world.checkTimer = 0.5; periodicChecks(); }
  const p = world.player;
  const k = 1 - Math.pow(0.001, dt);
  // Follow the player, but keep the view inside the world where it fits.
  const edge = 30;
  const cx = W < ZW * ZONES.length ? U.clamp(p.x, W / 2 - edge, ZW * ZONES.length - W / 2 + edge) : p.x;
  const cy = H < ZH + edge * 2 ? U.clamp(p.y, H / 2 - edge, ZH - H / 2 + edge) : ZH / 2;
  world.cam.x += (cx - world.cam.x) * k;
  world.cam.y += (cy - world.cam.y) * k;
  world.saveTimer += dt;
  if (world.saveTimer > 10) { world.saveTimer = 0; saveState(); }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  ui.updateHud(dt);
  requestAnimationFrame(frame);
}

const game = { syncPets, hatch, resetWorld, rebirth, teleport, makeBreakable, clearBreakables, zoneAt, arenaPos, step, world };

function boot() {
  resize();
  buildDecos();
  ui.init();
  setupInput();
  syncPets();
  world.cam.x = world.player.x;
  world.cam.y = world.player.y;
  ui.zoneBanner('Hub', 'Welcome to');
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}

boot();
