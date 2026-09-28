'use strict';

const SAVE_KEY = 'pet-sim-astra-save-v1';

function newState() {
  return {
    coins: 100,
    diamonds: 0,
    unlocked: 0,
    pets: [],
    equipped: [],
    nextUid: 1,
    upgrades: {},
    discovered: {},
    autoFarm: false,
    autoHatch: false,
    stats: { hatched: 0, broken: 0, coinsEarned: 0, diamondsEarned: 0, playTime: 0, huges: 0 },
  };
}

function loadState() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  const s = newState();
  if (data && typeof data === 'object') {
    Object.assign(s, data);
    s.stats = Object.assign(newState().stats, data.stats || {});
    s.pets = (s.pets || []).filter(p => PETS[p.id]);
    const uids = new Set(s.pets.map(p => p.uid));
    s.equipped = (s.equipped || []).filter(u => uids.has(u));
    s.unlocked = U.clamp(s.unlocked | 0, 0, ZONES.length - 1);
    return s;
  }
  // Fresh game: a couple of starter pets.
  state = s;
  addPet('z0_0');
  addPet('z0_0');
  addPet('z0_1');
  return s;
}

let state = null; // initialised at the bottom of this file

function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function resetState() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  state = loadState();
}

// ---------- Derived stats ----------
// Dev-panel cheat multipliers (not saved).
const DEV = { dmg: 1, speed: 1, luck: 1 };

const lvl = id => state.upgrades[id] || 0;
const dmgMult = () => (1 + 0.25 * lvl('damage')) * DEV.dmg;
const coinMult = () => 1 + 0.2 * lvl('coins');
const petSlots = () => 4 + lvl('slots');
const luckMult = () => (1 + 0.15 * lvl('luck')) * DEV.luck;
const hatchCount = () => [1, 3, 8][lvl('hatch')];
const walkSpeed = () => 270 * (1 + 0.08 * lvl('speed')) * DEV.speed;
const magnetRange = () => 200 + 40 * lvl('magnet');

// ---------- Pets ----------
function petDef(p) { return PETS[p.id]; }
function petPower(p) { return PETS[p.id].basePower * VARIANTS[p.variant || 0].mult; }
function petName(p) {
  const v = VARIANTS[p.variant || 0].name;
  return (v ? v + ' ' : '') + PETS[p.id].name;
}
function findPet(uid) { return state.pets.find(p => p.uid === uid); }
function isEquipped(uid) { return state.equipped.includes(uid); }

function addPet(id, variant = 0) {
  const p = { uid: state.nextUid++, id, variant };
  state.pets.push(p);
  state.discovered[id] = true;
  if (state.equipped.length < petSlots()) {
    state.equipped.push(p.uid);
  } else {
    // Auto-swap with the weakest equipped pet if the new one is stronger.
    let weakest = null;
    for (const uid of state.equipped) {
      const e = findPet(uid);
      if (!weakest || petPower(e) < petPower(weakest)) weakest = e;
    }
    if (weakest && petPower(p) > petPower(weakest)) {
      state.equipped[state.equipped.indexOf(weakest.uid)] = p.uid;
    }
  }
  return p;
}

function removePet(uid) {
  state.pets = state.pets.filter(p => p.uid !== uid);
  state.equipped = state.equipped.filter(u => u !== uid);
}

function equipPet(uid) {
  if (isEquipped(uid) || state.equipped.length >= petSlots()) return false;
  state.equipped.push(uid);
  return true;
}
function unequipPet(uid) { state.equipped = state.equipped.filter(u => u !== uid); }

function equipBest() {
  const sorted = [...state.pets].sort((a, b) => petPower(b) - petPower(a));
  state.equipped = sorted.slice(0, petSlots()).map(p => p.uid);
}

function sameKind(p) {
  return state.pets.filter(q => q.id === p.id && (q.variant || 0) === (p.variant || 0));
}

// Combine CRAFT_COST pets of one kind into a single pet of the next variant.
function craftPet(p) {
  const v = p.variant || 0;
  if (v >= VARIANTS.length - 1) return null;
  const pool = sameKind(p);
  if (pool.length < CRAFT_COST) return null;
  // Use the chosen pet plus unequipped copies first.
  pool.sort((a, b) => (a.uid === p.uid ? -1 : b.uid === p.uid ? 1 : isEquipped(a.uid) - isEquipped(b.uid)));
  const wasEquipped = pool.slice(0, CRAFT_COST).some(q => isEquipped(q.uid));
  pool.slice(0, CRAFT_COST).forEach(q => removePet(q.uid));
  const np = { uid: state.nextUid++, id: p.id, variant: v + 1 };
  state.pets.push(np);
  if (wasEquipped || state.equipped.length < petSlots()) equipPet(np.uid);
  return np;
}

// ---------- Eggs ----------
function eggOdds(zi) {
  const z = ZONES[zi];
  const luck = luckMult();
  const rows = z.petIds.map(id => {
    const d = PETS[id];
    const boosted = RARITY_ORDER.indexOf(d.rarity) >= 2;
    return { id, w: d.weight * (boosted ? luck : 1) };
  });
  const total = rows.reduce((s, r) => s + r.w, 0);
  rows.forEach(r => { r.chance = r.w / total; });
  return rows;
}

function rollEgg(zi) {
  return U.pickWeighted(eggOdds(zi), r => r.w).id;
}

state = loadState();
