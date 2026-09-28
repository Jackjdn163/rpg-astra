'use strict';

// Dev panel: testing tools. Open with the 🛠️ Dev button (top right) or the ` key.

ui.devForm = { amount: 1000000, pet: 'z1_5', variant: '0', level: 1, qty: 1 };

function devGive(id, variant, level, qty) {
  const n = Math.min(qty, MAX_PETS - state.pets.length);
  if (n <= 0) { ui.toast('Pet inventory is full', 'bad'); return 0; }
  for (let i = 0; i < n; i++) addPet(id, variant, level);
  if (n < qty) ui.toast(`Only room for ${n} more pets`, 'bad');
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
          <button data-act="devCoins" data-v="10000">+10k 🪙</button>
          <button data-act="devCoins" data-v="1000000">+1M 🪙</button>
          <button data-act="devCoins" data-v="1000000000">+1B 🪙</button>
          <button data-act="devCoins" data-v="1000000000000">+1T 🪙</button>
          <button data-act="devGems" data-v="100">+100 💎</button>
          <button data-act="devGems" data-v="10000">+10k 💎</button>
          <button data-act="devTokens">+10 🔷 tokens</button>
          <button data-act="devTickets">+5 🎟️ tickets</button>
        </div>
        <div class="row">
          <label for="dev-amount">Amount</label>
          <input id="dev-amount" data-dev-field="amount" type="number" min="0" value="${f.amount}">
          <button data-act="devSetCoins">Set coins</button>
          <button data-act="devSetGems">Set gems</button>
        </div>
      </section>

      <section>
        <h4>Player</h4>
        <div class="row">
          <button data-act="devLevel" data-v="1">+1 level</button>
          <button data-act="devLevel" data-v="10">+10 levels</button>
          <button data-act="devBoosts">All boosts for 10 min</button>
          <button data-act="devRebirthReady">Make rebirth ready</button>
        </div>
      </section>

      <section>
        <h4>Give pets</h4>
        <div class="row">
          <select id="dev-pet" data-dev-field="pet" aria-label="Pet">${petOpts}</select>
          <select id="dev-variant" data-dev-field="variant" aria-label="Mutation">${variantOpts}</select>
          <label for="dev-level">Lv</label>
          <input id="dev-level" data-dev-field="level" type="number" min="1" max="100" value="${f.level}">
          <label for="dev-qty">Qty</label>
          <input id="dev-qty" data-dev-field="qty" type="number" min="1" max="${MAX_PETS}" value="${f.qty}">
          <button data-act="devGivePet" class="primary">Give</button>
        </div>
        <div class="row">
          <button data-act="devGiveSecrets">One of every Secret</button>
          <button data-act="devGiveRainbow">Rainbow Secrets</button>
          <button data-act="devGiveAll">One of every pet</button>
          <button data-act="devDiscover">Fill the Index</button>
          <button data-act="devClearPets" class="danger">Delete all pets</button>
        </div>
      </section>

      <section>
        <h4>World</h4>
        <div class="row">
          <button data-act="devUnlockAll" class="primary">Unlock all zones</button>
          <button data-act="devLockAll">Lock back to Meadow</button>
          <button data-act="devGeode">Spawn Gem Geode next to me</button>
          <button data-act="devChests">Respawn Giant Chests</button>
          <button data-act="devRespawn">Respawn breakables</button>
        </div>
        <div class="row"><span class="muted">Teleport:</span> ${zoneBtns}</div>
      </section>

      <section>
        <h4>Quests & Token Tree</h4>
        <div class="row">
          <button data-act="devQuests">Complete all quests</button>
          <button data-act="devNewDay">New day (reset daily quests & login)</button>
          <button data-act="devMaxTree">Max Token Tree</button>
          <button data-act="devResetTree">Reset Token Tree</button>
        </div>
      </section>

      <section>
        <h4>Cheats <span class="muted">(reset when you reload)</span></h4>
        <div class="row"><span class="lbl">Pet power</span> ${mult('devPower', DEV.power, [1, 10, 1000, 1000000])}</div>
        <div class="row"><span class="lbl">Walk speed</span> ${mult('devSpeed', DEV.speed, [1, 2, 4])}</div>
        <div class="row"><span class="lbl">Hatch luck</span> ${mult('devLuck', DEV.luck, [1, 10, 1000])}</div>
      </section>
    </div>`,
  };
};

function devAct(name, data) {
  const f = ui.devForm;
  const amount = Math.max(0, Number(f.amount) || 0);
  const p = game.world.player;
  switch (name) {
    case 'devCoins': state.coins += Number(data.v); state.cycleCoins += Number(data.v); break;
    case 'devGems': state.gems += Number(data.v); break;
    case 'devTokens': state.tokens += 10; break;
    case 'devTickets': state.tickets.rare += 5; state.tickets.epic += 5; break;
    case 'devSetCoins': state.coins = amount; break;
    case 'devSetGems': state.gems = Math.floor(amount); break;
    case 'devLevel': {
      const target = state.level + Number(data.v);
      let xp = 0;
      for (let l = state.level; l < target; l++) xp += F.xpToNext(l);
      gainXpFromDev(xp - state.xp);
      break;
    }
    case 'devBoosts': Object.keys(BOOSTS).forEach(id => addBoost(id, 600)); break;
    case 'devRebirthReady':
      state.unlocked = Math.max(state.unlocked, rebirthZone());
      state.level = Math.max(state.level, ZONES[rebirthZone()].level);
      break;
    case 'devGivePet': {
      const qty = U.clamp(Math.floor(Number(f.qty) || 1), 1, MAX_PETS);
      const lv = U.clamp(Math.floor(Number(f.level) || 1), 1, 100);
      const v = Number(f.variant) || 0;
      const n = devGive(f.pet, v, lv, qty);
      if (n) ui.toast(`Gave ${n}× ${petName({ id: f.pet, variant: v })}`, 'good');
      break;
    }
    case 'devGiveSecrets':
    case 'devGiveRainbow': {
      const v = name === 'devGiveRainbow' ? 3 : 0;
      Object.values(PETS).filter(d => d.rarity === 'secret').forEach(d => devGive(d.id, v, 1, 1));
      ui.toast('Gave every Secret pet', 'huge');
      break;
    }
    case 'devGiveAll': Object.keys(PETS).forEach(id => devGive(id, 0, 1, 1)); break;
    case 'devDiscover': Object.keys(PETS).forEach(id => { state.discovered[id] = true; }); break;
    case 'devClearPets':
      if (ui.confirmTap('devClearPets', 'Delete ALL pets? Tap again to confirm.', 'bad')) {
        state.pets = [];
        state.equipped = [];
        game.syncPets();
      }
      break;
    case 'devUnlockAll':
      state.unlocked = LAST_ZONE;
      state.stats.maxZone = LAST_ZONE;
      break;
    case 'devLockAll':
      state.unlocked = 1;
      if (p.x > 2 * ZW) game.teleport(1);
      game.clearBreakables();
      break;
    case 'devTeleport': {
      const zi = Number(data.z);
      if (zi <= state.unlocked) { game.teleport(zi); ui.close(); }
      break;
    }
    case 'devGeode': {
      const zi = Math.max(1, game.zoneAt(p.x));
      game.makeBreakable('geode', zi, p.x + 120, p.y);
      ui.close();
      break;
    }
    case 'devChests':
      state.bossTimers = {};
      state.bossDefeated = {};
      break;
    case 'devRespawn': game.clearBreakables(); break;
    case 'devQuests':
      [...state.daily.quests, state.weekly.quest].forEach(q => { if (q) q.progress = q.n; });
      break;
    case 'devNewDay':
      state.daily.date = '';
      state.login.last = '';
      ensureQuests();
      break;
    case 'devMaxTree':
      TREE.forEach(t => { state.tree[t.id] = t.max; });
      ui.refreshToggles();
      game.syncPets();
      break;
    case 'devResetTree':
      state.tree = {};
      state.autoHatch = false;
      trimEquipped();
      ui.refreshToggles();
      game.syncPets();
      break;
    case 'devPower': DEV.power = Number(data.v); break;
    case 'devSpeed': DEV.speed = Number(data.v); break;
    case 'devLuck': DEV.luck = Number(data.v); break;
  }
}

// Adds raw XP (no XP multipliers) and runs the normal level-up rewards.
function gainXpFromDev(x) {
  for (const l of addXp(Math.max(0, x))) {
    ui.toast(`⭐ Level ${l}!`, 'good');
  }
  game.syncPets();
}
