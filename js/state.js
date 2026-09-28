'use strict';

const SAVE_KEY = 'pet-sim-astra-v3';
const SAVE_VERSION = 3;

function newState() {
  return {
    version: SAVE_VERSION,
    coins: 0,
    gems: 0,
    rebirths: 0,
    tokens: 0,
    tree: {},
    level: 1,
    xp: 0,
    unlocked: 1,          // highest unlocked zone index (0 = hub)
    cycleCoins: 0,        // coins earned since the last rebirth
    pets: [],
    equipped: [],
    nextUid: 1,
    discovered: {},       // Pet Index: never wiped
    variantsSeen: {},
    indexRewards: {},     // zone index -> number of completion rewards granted (0–3)
    tickets: { rare: 0, epic: 0 },
    boosts: {},
    bossDefeated: {},     // zone index -> Giant Chest broken this rebirth cycle
    bossTimers: {},       // zone index -> seconds until the Giant Chest respawns
    achievements: {},
    daily: { date: '', quests: [] },
    weekly: { week: '', quest: null },
    login: { last: '', streak: 0 },
    redeemed: [],
    starterCooldown: 0,
    autoFarm: true,
    autoHatch: false,
    settings: { music: 0.35, sfx: 0.8, perf: false, dmgNumbers: true, shake: true },
    stats: {
      hatched: 0, kills: 0, bosses: 0, coinsEarned: 0, gemsEarned: 0, playTime: 0,
      maxLevel: 1, maxZone: 1, fused: 0, bossesEver: {},
    },
  };
}

let state = null; // initialised at the bottom of this file

function loadState() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  const s = newState();
  if (data && typeof data === 'object' && data.version === SAVE_VERSION) {
    const base = newState();
    Object.assign(s, data);
    for (const k of ['stats', 'settings', 'tickets', 'login', 'daily', 'weekly']) s[k] = Object.assign(base[k], data[k] || {});
    s.stats.bossesEver = (data.stats && data.stats.bossesEver) || {};
    s.pets = (s.pets || []).filter(p => PETS[p.id]);
    const uids = new Set(s.pets.map(p => p.uid));
    s.equipped = (s.equipped || []).filter(u => uids.has(u));
    s.unlocked = U.clamp(s.unlocked | 0, 1, LAST_ZONE);
    const tree = {};
    for (const t of TREE) if (s.tree && s.tree[t.id]) tree[t.id] = Math.min(t.max, s.tree[t.id] | 0);
    s.tree = tree;
    return s;
  }
  // Fresh game: one starter pet already equipped.
  state = s;
  addPet('z0_0');
  return s;
}

function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function resetState() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  state = loadState();
}

// ---------- Derived stats ----------
const DEV = { power: 1, speed: 1, luck: 1 }; // dev-panel cheats (not saved)

const tl = id => state.tree[id] || 0;
const boostOn = id => (state.boosts[id] || 0) > 0;
const boostMult = id => (boostOn(id) ? BOOSTS[id].mult : 1);

function abilityBonus(type) {
  let sum = 0;
  for (const uid of state.equipped) {
    const p = findPet(uid);
    const a = p && PETS[p.id].ability;
    if (a && a[type]) sum += a[type];
  }
  return sum;
}

// +1% coins for every zone whose Index is 100% complete (persists through rebirth).
const indexCoinBonus = () => 0.01 * ZONES.filter(z => (state.indexRewards[z.index] || 0) >= 3).length;

const coinMult = () => F.rebirthCoinMult(state.rebirths) * (1 + 0.15 * tl('coins')) *
  (1 + abilityBonus('coins')) * (1 + indexCoinBonus()) * boostMult('coins');
const powerMult = () => F.rebirthPowerMult(state.rebirths) * (1 + 0.1 * tl('power')) *
  (1 + abilityBonus('power')) * boostMult('power') * DEV.power;
const gemMult = () => (1 + 0.1 * tl('gems')) * (1 + abilityBonus('gems'));
const xpMult = () => (1 + 0.2 * tl('xp')) * (1 + abilityBonus('xp'));
const luckMult = () => (1 + 0.1 * tl('luck')) * boostMult('luck') * DEV.luck;
const levelSlots = () => Math.min(6, 3 + Math.floor(state.level / 10));
const equipSlots = () => levelSlots() + tl('slots');
const walkSpeed = () => 280 * (1 + 0.1 * tl('speed')) * DEV.speed;
const breakablesPerZone = () => BASE_BREAKABLES_PER_ZONE + 3 * tl('density');
const hatchTimeMult = () => (tl('hatchSpeed') ? 0.5 : 1);

const coinsPerBreak = (n, type = 'pile') => F.hp(n) * F.coinK * F.zoneCoinMult(n) * BREAKABLES[type].coins * coinMult();
const eggCostOf = zi => (zi === 0 ? 250 : ZONES[zi].eggCost); // reference price for fees and sell values

// ---------- Pets ----------
function findPet(uid) { return state.pets.find(p => p.uid === uid); }
function isEquipped(uid) { return state.equipped.includes(uid); }
function petPower(p) { return PETS[p.id].basePower * F.levelPower(p.level || 1) * VARIANTS[p.variant || 0].mult; }
function effectivePower(p) { return petPower(p) * powerMult(); }
function teamPower() { return state.equipped.reduce((s, uid) => { const p = findPet(uid); return s + (p ? effectivePower(p) : 0); }, 0); }
function petName(p) {
  const v = VARIANTS[p.variant || 0].name;
  return (v ? v + ' ' : '') + PETS[p.id].name;
}

function addPet(id, variant = 0, level = 1) {
  const p = { uid: state.nextUid++, id, variant, level };
  state.pets.push(p);
  state.discovered[id] = true;
  if (variant) state.variantsSeen[VARIANTS[variant].id] = true;
  if (state.equipped.length < equipSlots()) {
    state.equipped.push(p.uid);
  } else {
    // Swap out the weakest equipped pet if the new one is stronger.
    let weakest = null;
    for (const uid of state.equipped) {
      const e = findPet(uid);
      if (!weakest || petPower(e) < petPower(weakest)) weakest = e;
    }
    if (weakest && petPower(p) > petPower(weakest)) state.equipped[state.equipped.indexOf(weakest.uid)] = p.uid;
  }
  return p;
}

function removePet(uid) {
  state.pets = state.pets.filter(p => p.uid !== uid);
  state.equipped = state.equipped.filter(u => u !== uid);
}

function equipPet(uid) {
  if (isEquipped(uid) || state.equipped.length >= equipSlots()) return false;
  state.equipped.push(uid);
  return true;
}
function unequipPet(uid) { state.equipped = state.equipped.filter(u => u !== uid); }
function equipBest() {
  state.equipped = [...state.pets].sort((a, b) => petPower(b) - petPower(a)).slice(0, equipSlots()).map(p => p.uid);
}
function trimEquipped() { state.equipped = state.equipped.slice(0, equipSlots()); }

function sellValue(p) {
  const d = PETS[p.id];
  return Math.max(5, Math.round(eggCostOf(d.zone) * 0.08 * Math.sqrt(RARITIES[d.rarity].mult) *
    Math.sqrt(VARIANTS[p.variant || 0].mult) * F.levelPower(p.level || 1)));
}
function sellPets(uids) {
  let total = 0;
  for (const uid of uids) {
    const p = findPet(uid);
    if (!p) continue;
    total += sellValue(p);
    removePet(uid);
  }
  state.coins += total;
  return total;
}

// Level up with coins (a coin sink).
const trainCost = p => Math.round(eggCostOf(PETS[p.id].zone) * 0.4 * Math.pow(1.12, (p.level || 1) - 1));
function trainPet(p) {
  if ((p.level || 1) >= 100) return false;
  const c = trainCost(p);
  if (state.coins < c) return false;
  state.coins -= c;
  p.level = (p.level || 1) + 1;
  state.stats.fused++;
  return true;
}

// Feed 5 duplicates of the same rarity + variant for +1 level.
const FEED_COST = 5;
function feedCandidates(p) {
  const d = PETS[p.id];
  return state.pets
    .filter(q => q.uid !== p.uid && !isEquipped(q.uid) && PETS[q.id].rarity === d.rarity && (q.variant || 0) === (p.variant || 0))
    .sort((a, b) => petPower(a) - petPower(b));
}
function feedPet(p) {
  if ((p.level || 1) >= 100) return false;
  const c = feedCandidates(p);
  if (c.length < FEED_COST) return false;
  c.slice(0, FEED_COST).forEach(q => removePet(q.uid));
  p.level = (p.level || 1) + 1;
  state.stats.fused++;
  return true;
}

// Fuse 3 pets of one rarity (same egg) into a guaranteed pet of the next rarity up.
const FUSE_COST = 3;
const fuseFee = p => Math.round(eggCostOf(PETS[p.id].zone) * 2);
function fuseTarget(p) {
  const d = PETS[p.id];
  const next = RARITY_ORDER.indexOf(d.rarity) + 1;
  return ZONES[d.zone].petIds[next] || null;
}
function fuseCandidates(p) {
  const d = PETS[p.id];
  return state.pets
    .filter(q => q.uid !== p.uid && !isEquipped(q.uid) && PETS[q.id].zone === d.zone && PETS[q.id].rarity === d.rarity)
    .sort((a, b) => petPower(a) - petPower(b));
}
function fusePet(p) {
  const target = fuseTarget(p);
  if (!target) return null;
  const others = fuseCandidates(p);
  if (others.length < FUSE_COST - 1 || state.coins < fuseFee(p)) return null;
  const used = [p, ...others.slice(0, FUSE_COST - 1)];
  const variant = used.every(q => (q.variant || 0) === (p.variant || 0)) ? (p.variant || 0) : 0;
  const wasEquipped = isEquipped(p.uid);
  state.coins -= fuseFee(p);
  used.forEach(q => removePet(q.uid));
  const np = addPet(target, variant);
  if (wasEquipped) equipPet(np.uid);
  state.stats.fused++;
  return np;
}

// Pay gems to reroll a pet's mutation. Never downgrades.
const rerollCost = p => 15 * Math.max(1, PETS[p.id].zone);
function rerollPet(p) {
  const c = rerollCost(p);
  if (state.gems < c || (p.variant || 0) >= VARIANTS.length - 1) return null;
  state.gems -= c;
  const v = rollVariant(REROLL_CHANCES);
  const improved = v > (p.variant || 0);
  if (improved) {
    p.variant = v;
    state.variantsSeen[VARIANTS[v].id] = true;
  }
  return { improved, variant: v };
}

// ---------- Eggs ----------
function eggOdds(zi, { lucky = false, minRarity = null } = {}) {
  const z = ZONES[zi];
  const luck = luckMult() * (lucky ? 4 : 1);
  const minRank = minRarity ? RARITY_ORDER.indexOf(minRarity) : 0;
  const rows = z.petIds.map(id => {
    const d = PETS[id];
    const rank = RARITY_ORDER.indexOf(d.rarity);
    const w = (z.weights ? z.weights[d.rarity] : RARITIES[d.rarity].weight) * (rank >= 2 ? luck : 1);
    return { id, w: rank >= minRank ? w : 0 };
  });
  const total = rows.reduce((s, r) => s + r.w, 0);
  rows.forEach(r => { r.chance = total ? r.w / total : 0; });
  return rows;
}

function rollVariant(chances = VARIANTS.map(v => v.chance)) {
  const r = Math.random();
  let acc = 0;
  for (let v = VARIANTS.length - 1; v >= 1; v--) {
    acc += chances[v];
    if (r < acc) return v;
  }
  return 0;
}

function rollEgg(zi, opts) {
  const odds = eggOdds(zi, opts).filter(r => r.w > 0);
  return { id: U.pickWeighted(odds, r => r.w).id, variant: rollVariant() };
}

// ---------- Player level ----------
// Returns the list of levels gained.
function addXp(x) {
  state.xp += x;
  const gained = [];
  while (state.xp >= F.xpToNext(state.level)) {
    state.xp -= F.xpToNext(state.level);
    state.level++;
    gained.push(state.level);
  }
  if (state.level > state.stats.maxLevel) state.stats.maxLevel = state.level;
  return gained;
}

// ---------- Zones ----------
function zoneReqMet(n) {
  const z = ZONES[n];
  return state.level >= z.level || (z.altCoins && state.cycleCoins >= z.altCoins);
}
function zoneReqText(n) {
  const z = ZONES[n];
  return `Level ${z.level}${z.altCoins ? ` or earn 🪙 ${U.fmt(z.altCoins)}` : ''}`;
}
function unlockZone(n) {
  if (n !== state.unlocked + 1 || n > LAST_ZONE || !zoneReqMet(n) || state.coins < ZONES[n].gateCost) return false;
  state.coins -= ZONES[n].gateCost;
  state.unlocked = n;
  state.stats.maxZone = Math.max(state.stats.maxZone, n);
  return true;
}

// ---------- Rebirth ----------
const rebirthZone = () => REBIRTH.requiredZone(state.rebirths);
const canRebirth = () => state.unlocked >= rebirthZone();
const rebirthTokens = () => REBIRTH.tokens(state.rebirths, state.unlocked);

function doRebirth() {
  if (!canRebirth()) return 0;
  const tokens = rebirthTokens();
  const keep = [...state.pets].sort((a, b) => petPower(b) - petPower(a)).slice(0, tl('keep'));
  state.tokens += tokens;
  state.rebirths++;
  state.coins = HEAD_START[tl('headStart')];
  state.gems = 0;
  state.pets = keep;
  state.equipped = keep.map(p => p.uid);
  state.level = 1;
  state.xp = 0;
  state.unlocked = 1;
  state.cycleCoins = 0;
  state.bossDefeated = {};
  state.bossTimers = {};
  if (!state.pets.length) addPet('z0_0');
  trimEquipped();
  return tokens;
}

function buyTree(id) {
  const t = TREE.find(x => x.id === id);
  const l = tl(id);
  if (!t || l >= t.max || state.tokens < t.cost(l)) return false;
  state.tokens -= t.cost(l);
  state.tree[id] = l + 1;
  return true;
}

// ---------- Rewards ----------
function grantReward(r) {
  const parts = [];
  if (r.gems) { const g = Math.round(r.gems); state.gems += g; state.stats.gemsEarned += g; parts.push(`💎 ${U.fmt(g)}`); }
  if (r.coins) { state.coins += r.coins; parts.push(`🪙 ${U.fmt(r.coins)}`); }
  if (r.coinEggs) { const c = r.coinEggs * eggCostOf(state.unlocked); state.coins += c; parts.push(`🪙 ${U.fmt(c)}`); }
  if (r.ticket) { state.tickets[r.ticket]++; parts.push(`🎟️ ${RARITIES[r.ticket].name}+ Egg Ticket`); }
  if (r.boost) { addBoost(r.boost[0], r.boost[1]); parts.push(`${BOOSTS[r.boost[0]].icon} ${BOOSTS[r.boost[0]].name} ${Math.round(r.boost[1] / 60)}m`); }
  return parts.join(' + ');
}

function addBoost(id, seconds) { state.boosts[id] = Math.min(3 * 3600, (state.boosts[id] || 0) + seconds); }

// ---------- Daily / weekly quests and login streak ----------
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
}

function questText(q) {
  switch (q.type) {
    case 'hatch': return `Hatch ${q.n} eggs`;
    case 'kill': return `Break ${U.fmt(q.n)} things`;
    case 'killZone': return `Break ${U.fmt(q.n)} things in ${ZONES[q.zone].name}`;
    case 'coins': return `Earn 🪙 ${U.fmt(q.n)}`;
    case 'boss': return `Break ${q.n > 1 ? q.n + ' Giant Chests' : 'a Giant Chest'}`;
    case 'level': return `Gain ${q.n} player levels`;
    case 'fuse': return `Train, feed or fuse pets ${q.n} times`;
    default: return '';
  }
}
function rewardText(r) {
  const p = [];
  if (r.gems) p.push(`💎 ${r.gems}`);
  if (r.ticket) p.push(`🎟️ ${RARITIES[r.ticket].name}+`);
  return p.join(' + ');
}

function makeDailyQuests(seed) {
  const rng = U.seeded(seed);
  const types = ['hatch', 'kill', 'killZone', 'coins', 'boss', 'level', 'fuse'];
  const picked = [];
  while (picked.length < 3) {
    const t = types[Math.floor(rng() * types.length)];
    if (!picked.includes(t)) picked.push(t);
  }
  return picked.map(type => {
    const q = { type, n: 1, zone: 0, progress: 0, claimed: false };
    if (type === 'hatch') q.n = 5 + Math.floor(rng() * 11);
    if (type === 'kill') q.n = 100 + 50 * Math.floor(rng() * 5);
    if (type === 'killZone') { q.zone = 1 + Math.floor(rng() * state.unlocked); q.n = 50 + 25 * Math.floor(rng() * 5); }
    if (type === 'coins') q.n = U.nice(coinsPerBreak(state.unlocked) * 150);
    if (type === 'level') q.n = 2;
    if (type === 'fuse') q.n = 3;
    q.reward = rng() < 0.25 ? { ticket: 'rare' } : { gems: 20 + 5 * Math.floor(rng() * 7) };
    return q;
  });
}

function ensureQuests() {
  const today = dayKey();
  if (state.daily.date !== today) {
    state.daily = { date: today, quests: makeDailyQuests(U.hash(today + ':' + state.rebirths)) };
  }
  const wk = weekKey();
  if (state.weekly.week !== wk) {
    const alt = U.hash(wk) % 2;
    state.weekly = {
      week: wk,
      quest: { type: alt ? 'hatch' : 'kill', n: alt ? 150 : 2500, zone: 0, progress: 0, claimed: false,
        reward: { gems: 150, ticket: 'epic' } },
    };
  }
}

function questProgress(type, amount = 1, zone = 0) {
  const all = [...state.daily.quests, state.weekly.quest].filter(Boolean);
  for (const q of all) {
    if (q.claimed || q.progress >= q.n) continue;
    if (q.type === type || (q.type === 'killZone' && type === 'kill' && zone === q.zone)) {
      q.progress = Math.min(q.n, q.progress + amount);
    }
  }
}

const questReady = q => q && !q.claimed && q.progress >= q.n;
function claimQuest(q) {
  if (!questReady(q)) return '';
  q.claimed = true;
  return grantReward(q.reward);
}
const readyQuestCount = () => [...state.daily.quests, state.weekly.quest].filter(questReady).length;

function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
const canClaimLogin = () => state.login.last !== dayKey();
function nextLoginDay() {
  if (state.login.last === yesterdayKey()) return (state.login.streak % 7) + 1;
  return state.login.last === dayKey() ? state.login.streak : 1;
}
function claimLogin() {
  if (!canClaimLogin()) return '';
  const day = nextLoginDay();
  state.login = { last: dayKey(), streak: day };
  return grantReward(LOGIN_REWARDS[day - 1]);
}

// ---------- Codes ----------
function redeemCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return { ok: false, msg: 'Type a code first.' };
  const c = CODES[code];
  if (!c) return { ok: false, msg: `"${code}" isn't a valid code. Check the spelling.` };
  if (state.redeemed.includes(code)) return { ok: false, msg: `You've already redeemed ${code}.` };
  state.redeemed.push(code);
  return { ok: true, msg: `Redeemed ${code}: ${grantReward(c)}` };
}

// ---------- Pet Index completion ----------
const INDEX_STEPS = [0.25, 0.5, 1];
function indexProgress(zi) {
  const ids = ZONES[zi].petIds;
  return ids.filter(id => state.discovered[id]).length / ids.length;
}
function indexRewardFor(zi, step) {
  if (step === 0) return { coins: 3 * eggCostOf(zi) };
  if (step === 1) return { gems: 20 * Math.max(1, zi) };
  return { label: '+1% coins forever' };
}
// Grants any newly reached completion rewards; returns messages.
function checkIndexRewards() {
  const msgs = [];
  ZONES.forEach(z => {
    const got = state.indexRewards[z.index] || 0;
    const prog = indexProgress(z.index);
    for (let s = got; s < INDEX_STEPS.length; s++) {
      if (prog + 1e-9 < INDEX_STEPS[s]) break;
      const r = indexRewardFor(z.index, s);
      const txt = r.label || grantReward(r);
      state.indexRewards[z.index] = s + 1;
      msgs.push(`📖 ${z.name} Index ${Math.round(INDEX_STEPS[s] * 100)}%: ${txt}`);
    }
  });
  return msgs;
}

// Grants newly earned achievements; returns them.
function checkAchievements() {
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] || !a.check()) continue;
    state.achievements[a.id] = true;
    state.gems += a.gems;
    state.stats.gemsEarned += a.gems;
    earned.push(a);
  }
  return earned;
}

state = loadState();
ensureQuests();
