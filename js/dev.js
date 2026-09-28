'use strict';

// Dev panel: testing tools for giving items and changing the world.
// Open with the 🛠️ menu button or the ` (backtick) key.

ui.devForm = { amount: 1000000, pet: 'z0_0', variant: '0', qty: 1 };

function devTeleport(zi) {
  const p = game.world.player;
  p.x = zi * ZW + ZW / 2;
  p.y = ZH / 2 + 60;
  game.world.cam.x = p.x;
  game.world.cam.y = p.y;
  game.world.moveTarget = null;
  game.world.manualTarget = null;
  for (const e of game.world.pets) { e.target = null; e.x = p.x; e.y = p.y; }
}

function devClearBreakables() {
  const w = game.world;
  w.breakables = [];
  w.bmap.clear();
  w.chestTimers = {};
  w.manualTarget = null;
  for (const e of w.pets) e.target = null;
}

function devGive(id, variant, qty) {
  const room = MAX_PETS - state.pets.length;
  const n = Math.min(qty, room);
  if (n <= 0) { ui.toast('Pet inventory is full', 'bad'); return 0; }
  for (let i = 0; i < n; i++) {
    const p = addPet(id);
    p.variant = variant;
  }
  if (n < qty) ui.toast(`Only room for ${n} more pets`, 'bad');
  // Re-pick equipped pets so the new ones are used if they're stronger.
  equipBest();
  game.syncPets();
  return n;
}

ui.render.dev = () => {
  const f = ui.devForm;
  const petOpts = ZONES.map(z => `<optgroup label="${z.name}">${z.petIds.map(id => {
    const d = PETS[id];
    return `<option value="${id}" ${f.pet === id ? 'selected' : ''}>${d.emoji} ${d.name} (${RARITIES[d.rarity].name})</option>`;
  }).join('')}</optgroup>`).join('');
  const variantOpts = VARIANTS.map((v, i) =>
    `<option value="${i}" ${f.variant === String(i) ? 'selected' : ''}>${v.name || 'Normal'}</option>`).join('');
  const zoneBtns = ZONES.map((z, i) =>
    `<button data-act="devTeleport" data-z="${i}" ${i > state.unlocked ? 'disabled' : ''}>${z.name}</button>`).join('');
  const mult = (act, cur, vals) => vals.map(v =>
    `<button data-act="${act}" data-v="${v}" class="${cur === v ? 'on' : ''}">x${v}</button>`).join('');

  return {
    title: '🛠️ Dev Panel <small>for testing</small>',
    body: `<div class="scroll dev">
      <section>
        <h4>Currency</h4>
        <div class="row">
          <button data-act="devCoins" data-v="1000">+1k 🪙</button>
          <button data-act="devCoins" data-v="1000000">+1M 🪙</button>
          <button data-act="devCoins" data-v="1000000000">+1B 🪙</button>
          <button data-act="devCoins" data-v="1000000000000">+1T 🪙</button>
          <button data-act="devGems" data-v="100">+100 💎</button>
          <button data-act="devGems" data-v="10000">+10k 💎</button>
        </div>
        <div class="row">
          <label for="dev-amount">Amount</label>
          <input id="dev-amount" data-dev-field="amount" type="number" min="0" value="${f.amount}">
          <button data-act="devSetCoins">Set coins</button>
          <button data-act="devSetGems">Set gems</button>
        </div>
      </section>

      <section>
        <h4>Give pets</h4>
        <div class="row">
          <select id="dev-pet" data-dev-field="pet" aria-label="Pet">${petOpts}</select>
          <select id="dev-variant" data-dev-field="variant" aria-label="Variant">${variantOpts}</select>
          <input id="dev-qty" data-dev-field="qty" type="number" min="1" max="${MAX_PETS}" value="${f.qty}" aria-label="Quantity">
          <button data-act="devGivePet" class="primary">Give</button>
        </div>
        <div class="row">
          <button data-act="devGiveHuges">One of every Huge</button>
          <button data-act="devGiveRainbowHuges">Rainbow Huges</button>
          <button data-act="devGiveAll">One of every pet</button>
          <button data-act="devDiscover">Fill the Index</button>
          <button data-act="devClearPets" class="danger">Delete all pets</button>
        </div>
        <div class="muted">${state.pets.length}/${MAX_PETS} pets. Giving pets re-equips your strongest ones.</div>
      </section>

      <section>
        <h4>World</h4>
        <div class="row">
          <button data-act="devUnlockAll" class="primary">Unlock all zones</button>
          <button data-act="devLockAll">Lock back to Spawn</button>
          <button data-act="devChest">Spawn chest next to me</button>
          <button data-act="devRespawn">Respawn breakables</button>
        </div>
        <div class="row"><span class="muted">Teleport:</span> ${zoneBtns}</div>
      </section>

      <section>
        <h4>Upgrades</h4>
        <div class="row">
          <button data-act="devMaxUpg" class="primary">Max all upgrades</button>
          <button data-act="devResetUpg">Reset upgrades</button>
        </div>
      </section>

      <section>
        <h4>Cheats <span class="muted">(reset when you reload)</span></h4>
        <div class="row"><span class="lbl">Pet damage</span> ${mult('devDmg', DEV.dmg, [1, 10, 100, 10000])}</div>
        <div class="row"><span class="lbl">Walk speed</span> ${mult('devSpeed', DEV.speed, [1, 2, 4])}</div>
        <div class="row"><span class="lbl">Hatch luck</span> ${mult('devLuck', DEV.luck, [1, 10, 1000])}</div>
      </section>
    </div>`,
  };
};

// Remember form values between re-renders.
document.getElementById('modal-body').addEventListener('input', e => {
  const field = e.target.dataset && e.target.dataset.devField;
  if (field) ui.devForm[field] = e.target.value;
});

function devAct(name, data) {
  const f = ui.devForm;
  const amount = Math.max(0, Number(f.amount) || 0);
  switch (name) {
    case 'devCoins': state.coins += Number(data.v); break;
    case 'devGems': state.diamonds += Number(data.v); break;
    case 'devSetCoins': state.coins = amount; break;
    case 'devSetGems': state.diamonds = Math.floor(amount); break;
    case 'devGivePet': {
      const qty = U.clamp(Math.floor(Number(f.qty) || 1), 1, MAX_PETS);
      const n = devGive(f.pet, Number(f.variant) || 0, qty);
      if (n) ui.toast(`Gave ${n}× ${petName({ id: f.pet, variant: Number(f.variant) || 0 })}`, 'good');
      break;
    }
    case 'devGiveHuges':
    case 'devGiveRainbowHuges': {
      const v = name === 'devGiveRainbowHuges' ? 2 : 0;
      Object.values(PETS).filter(d => d.rarity === 'huge').forEach(d => devGive(d.id, v, 1));
      ui.toast('Gave every Huge pet', 'huge');
      break;
    }
    case 'devGiveAll':
      Object.keys(PETS).forEach(id => devGive(id, 0, 1));
      ui.toast('Gave one of every pet', 'good');
      break;
    case 'devDiscover':
      Object.keys(PETS).forEach(id => { state.discovered[id] = true; });
      ui.toast('Index filled', 'good');
      break;
    case 'devClearPets':
      if (ui.confirmTap('devClearPets', 'Delete ALL pets? Tap again to confirm.', 'bad')) {
        state.pets = [];
        state.equipped = [];
        game.syncPets();
        ui.toast('All pets deleted');
      }
      break;
    case 'devUnlockAll':
      state.unlocked = ZONES.length - 1;
      ui.toast('All zones unlocked', 'good');
      break;
    case 'devLockAll':
      state.unlocked = 0;
      if (game.world.player.x > ZW) devTeleport(0);
      devClearBreakables();
      break;
    case 'devTeleport': {
      const zi = Number(data.z);
      if (zi <= state.unlocked) { devTeleport(zi); ui.close(); }
      break;
    }
    case 'devChest': {
      const p = game.world.player;
      game.makeBreakable('chest', game.zoneAt(p.x), p.x + 140, p.y);
      ui.close();
      break;
    }
    case 'devRespawn': devClearBreakables(); ui.toast('Breakables respawning'); break;
    case 'devMaxUpg':
      UPGRADES.forEach(u => { state.upgrades[u.id] = u.max; });
      state.autoFarm = true;
      ui.refreshToggles();
      equipBest();
      game.syncPets();
      ui.toast('All upgrades maxed', 'good');
      break;
    case 'devResetUpg':
      state.upgrades = {};
      state.autoFarm = false;
      state.autoHatch = false;
      state.equipped = state.equipped.slice(0, petSlots());
      ui.refreshToggles();
      game.syncPets();
      break;
    case 'devDmg': DEV.dmg = Number(data.v); break;
    case 'devSpeed': DEV.speed = Number(data.v); break;
    case 'devLuck': DEV.luck = Number(data.v); break;
  }
}
