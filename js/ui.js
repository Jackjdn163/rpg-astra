'use strict';

const $ = sel => document.querySelector(sel);

function rarityOf(p) { return PETS[p.id].rarity; }
function variantClass(p) { return ['', 'golden', 'rainbow'][p.variant || 0]; }

const ui = {
  current: null,
  arg: null,
  selPet: null,
  hatching: false,
  promptText: null,
  promptFn: null,
  lastCoins: -1,
  lastDiamonds: -1,

  init() {
    $('#modal-close').addEventListener('click', () => ui.close());
    $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') ui.close(); });
    $('#modal-body').addEventListener('click', e => ui.onModalClick(e));
    document.querySelectorAll('#menu button').forEach(b =>
      b.addEventListener('click', () => ui.toggle(b.dataset.open)));
    $('#btn-autofarm').addEventListener('click', () => ui.toggleAutoFarm());
    $('#btn-autohatch').addEventListener('click', () => ui.toggleAutoHatch());
    $('#prompt').addEventListener('click', () => ui.runPrompt());
    $('#btn-dev').addEventListener('click', () => ui.toggle('dev'));
    $('#hatch').addEventListener('click', () => ui.endHatch());
    ui.refreshToggles();
    ui.updateHud(true);
  },

  // ---------- HUD ----------
  updateHud(force) {
    if (force || state.coins !== ui.lastCoins) {
      ui.lastCoins = state.coins;
      $('#coins').textContent = U.fmt(state.coins);
    }
    if (force || state.diamonds !== ui.lastDiamonds) {
      ui.lastDiamonds = state.diamonds;
      $('#diamonds').textContent = U.fmt(state.diamonds);
    }
  },

  bump(which) {
    const el = $(which === 'coin' ? '#pill-coins' : '#pill-diamonds');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  },

  refreshToggles() {
    const af = $('#btn-autofarm'), ah = $('#btn-autohatch');
    af.classList.toggle('hidden', !lvl('autofarm'));
    ah.classList.toggle('hidden', !lvl('autohatch'));
    af.classList.toggle('on', state.autoFarm);
    ah.classList.toggle('on', state.autoHatch);
    af.querySelector('b').textContent = state.autoFarm ? 'ON' : 'OFF';
    ah.querySelector('b').textContent = state.autoHatch ? 'ON' : 'OFF';
  },

  toggleAutoFarm() {
    if (!lvl('autofarm')) return ui.toast('Buy Auto Farm in the Upgrades shop first', 'bad');
    state.autoFarm = !state.autoFarm;
    ui.refreshToggles();
  },

  toggleAutoHatch() {
    if (!lvl('autohatch')) return ui.toast('Buy Auto Hatch in the Upgrades shop first', 'bad');
    state.autoHatch = !state.autoHatch;
    ui.refreshToggles();
    if (ui.current === 'egg') ui.refresh();
  },

  setPrompt(text, fn) {
    ui.promptFn = fn;
    if (text === ui.promptText) return;
    ui.promptText = text;
    const el = $('#prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = text;
    el.classList.remove('hidden');
  },
  runPrompt() { if (ui.promptFn && !ui.hatching) ui.promptFn(); },

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
    const all = $('#toasts').children;
    if (all.length > 5) all[0].remove();
  },

  zoneBanner(name) {
    const el = $('#zone-banner');
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  // ---------- Modals ----------
  isOpen() { return ui.current !== null; },
  open(name, arg) {
    ui.current = name;
    ui.arg = arg;
    $('#modal').classList.remove('hidden');
    $('#modal').dataset.kind = name;
    ui.refresh();
  },
  toggle(name) { if (ui.current === name) ui.close(); else ui.open(name); },
  close() {
    ui.current = null;
    $('#modal').classList.add('hidden');
  },
  refresh() {
    if (!ui.current) return;
    const r = ui.render[ui.current](ui.arg);
    $('#modal-title').innerHTML = r.title;
    const body = $('#modal-body');
    const scroll = body.querySelector('.scroll');
    const top = scroll ? scroll.scrollTop : 0;
    body.innerHTML = r.body;
    const ns = body.querySelector('.scroll');
    if (ns) ns.scrollTop = top;
  },

  petCard(p, extra = '') {
    const d = PETS[p.id];
    return `<div class="pet-card r-${d.rarity} ${variantClass(p)} ${extra}" data-uid="${p.uid}" title="${petName(p)}">
      <div class="em ${d.rarity === 'huge' ? 'big' : ''}">${d.emoji}</div>
      <div class="pw">⚔️ ${U.fmt(petPower(p) * dmgMult())}</div>
      ${isEquipped(p.uid) ? '<div class="check">✔</div>' : ''}
    </div>`;
  },

  render: {
    pets() {
      const list = [...state.pets].sort((a, b) =>
        (isEquipped(b.uid) - isEquipped(a.uid)) || (petPower(b) - petPower(a)) || (b.uid - a.uid));
      const sel = findPet(ui.selPet);
      let detail = '<div class="detail empty">Tap a pet to see details</div>';
      if (sel) {
        const d = PETS[sel.id];
        const eq = isEquipped(sel.uid);
        const kind = sameKind(sel).length;
        const v = sel.variant || 0;
        const craftBtn = v < VARIANTS.length - 1
          ? `<button data-act="craft" ${kind < CRAFT_COST ? 'disabled' : ''}>✨ Make ${VARIANTS[v + 1].name} (${Math.min(kind, CRAFT_COST)}/${CRAFT_COST})</button>`
          : '';
        detail = `<div class="detail">
          <div class="big-em ${variantClass(sel)}">${d.emoji}</div>
          <div class="info">
            <h3>${petName(sel)}</h3>
            <div class="rar" style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name} · ${ZONES[d.zone].egg}</div>
            <div>⚔️ Power <b>${U.fmt(petPower(sel) * dmgMult())}</b></div>
            <div class="row">
              ${eq ? '<button data-act="unequip">Unequip</button>'
                   : `<button data-act="equip" class="primary" ${state.equipped.length >= petSlots() ? 'disabled' : ''}>Equip</button>`}
              ${craftBtn}
              <button data-act="delete" class="danger">Delete</button>
            </div>
          </div>
        </div>`;
      }
      return {
        title: `🐾 Pets <small>${state.pets.length}/${MAX_PETS} · Equipped ${state.equipped.length}/${petSlots()}</small>`,
        body: `<div class="toolbar">
            <button data-act="equipBest" class="primary">⭐ Equip Best</button>
            <button data-act="unequipAll">Unequip All</button>
            <button data-act="deleteWeak" class="danger">🗑️ Delete unequipped Common/Uncommon</button>
          </div>
          <div class="scroll"><div class="pet-grid">${list.map(p => ui.petCard(p, p.uid === ui.selPet ? 'sel' : '')).join('') || '<p>No pets yet — hatch an egg!</p>'}</div></div>
          ${detail}`,
      };
    },

    egg(zi) {
      const z = ZONES[zi];
      const odds = eggOdds(zi);
      const count = {};
      state.pets.forEach(p => { count[p.id] = (count[p.id] || 0) + 1; });
      const hc = hatchCount();
      return {
        title: `🥚 ${z.egg}`,
        body: `<div class="egg-head">
            <div class="egg-css" style="--c:${z.eggColor};--s:${z.eggSpots}"></div>
            <div><div class="cost">🪙 ${U.fmt(z.eggCost)} <small>each</small></div>
            <div class="muted">Luck bonus: x${luckMult().toFixed(2)} on Rare+</div></div>
          </div>
          <div class="scroll"><div class="odds">${odds.map(o => {
            const d = PETS[o.id];
            const known = state.discovered[o.id];
            return `<div class="odd r-${d.rarity}">
              <div class="em ${known ? '' : 'unknown'}">${d.emoji}</div>
              <div class="nm">${known ? d.name : '???'}</div>
              <div class="ch" style="color:${RARITIES[d.rarity].color}">${U.pct(o.chance * 100)}</div>
              ${count[o.id] ? `<div class="own">x${count[o.id]}</div>` : ''}
            </div>`;
          }).join('')}</div></div>
          <div class="egg-actions">
            <button data-act="hatch" data-n="1" class="primary">Hatch 1 · 🪙 ${U.fmt(z.eggCost)}</button>
            ${hc > 1 ? `<button data-act="hatch" data-n="${hc}" class="primary">Hatch ${hc} · 🪙 ${U.fmt(z.eggCost * hc)}</button>` : ''}
            ${lvl('autohatch') ? `<button data-act="autoHatch" class="${state.autoHatch ? 'on' : ''}">♻️ Auto Hatch: ${state.autoHatch ? 'ON' : 'OFF'}</button>` : ''}
          </div>`,
      };
    },

    upgrades() {
      return {
        title: `⬆️ Upgrades <small>💎 ${U.fmt(state.diamonds)}</small>`,
        body: `<div class="scroll"><div class="upgrades">${UPGRADES.map(u => {
          const l = lvl(u.id);
          const maxed = l >= u.max;
          const cost = maxed ? 0 : u.cost(l);
          return `<div class="upg">
            <div class="ic">${u.icon}</div>
            <div class="info"><b>${u.name}</b> <span class="lv">${u.max > 1 ? `Lv ${l}/${u.max}` : (l ? 'Owned' : '')}</span>
              <div class="muted">${u.desc}</div>
              ${u.max > 1 ? `<div class="bar"><i style="width:${(l / u.max) * 100}%"></i></div>` : ''}
            </div>
            <button data-act="buy" data-id="${u.id}" class="primary" ${maxed || state.diamonds < cost ? 'disabled' : ''}>
              ${maxed ? 'MAX' : `💎 ${U.fmt(cost)}`}</button>
          </div>`;
        }).join('')}</div></div>`,
      };
    },

    index() {
      const total = Object.keys(PETS).length;
      const found = Object.keys(PETS).filter(id => state.discovered[id]).length;
      return {
        title: `📖 Pet Index <small>${found}/${total}</small>`,
        body: `<div class="scroll">${ZONES.map(z => `
          <h4>${z.name} <span class="muted">${z.index <= state.unlocked ? '' : '🔒'}</span></h4>
          <div class="odds">${z.petIds.map(id => {
            const d = PETS[id];
            const known = state.discovered[id];
            return `<div class="odd r-${d.rarity}">
              <div class="em ${known ? '' : 'unknown'}">${d.emoji}</div>
              <div class="nm">${known ? d.name : '???'}</div>
              <div class="ch" style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name}</div>
            </div>`;
          }).join('')}</div>`).join('')}</div>`,
      };
    },

    settings() {
      const s = state.stats;
      const t = Math.floor(s.playTime);
      const time = `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
      return {
        title: '⚙️ Settings & Stats',
        body: `<div class="scroll">
          <div class="stats">
            <div><span>Play time</span><b>${time}</b></div>
            <div><span>Eggs hatched</span><b>${U.fmt(s.hatched)}</b></div>
            <div><span>Huge pets hatched</span><b>${U.fmt(s.huges)}</b></div>
            <div><span>Breakables destroyed</span><b>${U.fmt(s.broken)}</b></div>
            <div><span>Coins earned</span><b>🪙 ${U.fmt(s.coinsEarned)}</b></div>
            <div><span>Diamonds earned</span><b>💎 ${U.fmt(s.diamondsEarned)}</b></div>
            <div><span>Zones unlocked</span><b>${state.unlocked + 1}/${ZONES.length}</b></div>
          </div>
          <h4>How to play</h4>
          <ul class="help">
            <li><b>WASD / Arrow keys</b> or <b>tap / click the ground</b> to walk.</li>
            <li><b>Click a coin pile, crate, safe or chest</b> to send your pets to break it.</li>
            <li>Walk to an egg and press <b>E</b> (or tap the button) to hatch pets.</li>
            <li>Combine ${CRAFT_COST} of the same pet to make it <b>Golden</b>, then <b>Rainbow</b>.</li>
            <li>Spend 💎 diamonds on upgrades. Unlock new zones at the glowing gates.</li>
            <li>Shortcuts: <b>P</b> pets, <b>U</b> upgrades, <b>F</b> auto farm, <b>Esc</b> close.</li>
          </ul>
          <div class="row">
            <button data-act="save" class="primary">💾 Save now</button>
            <button data-act="reset" class="danger">Reset progress</button>
          </div>
        </div>`,
      };
    },
  },

  onModalClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (btn) {
      if (btn.disabled) return;
      ui.act(btn.dataset.act, btn.dataset);
      return;
    }
    const card = e.target.closest('.pet-card');
    if (card) {
      const uid = +card.dataset.uid;
      ui.selPet = ui.selPet === uid ? null : uid;
      ui.refresh();
    }
  },

  // In-page confirmation: the first tap warns, a second tap within 4s confirms.
  confirmTap(key, msg, kind = '') {
    if (ui.pendingConfirm === key) {
      ui.pendingConfirm = null;
      return true;
    }
    ui.pendingConfirm = key;
    clearTimeout(ui._confirmTimer);
    ui._confirmTimer = setTimeout(() => { ui.pendingConfirm = null; }, 4000);
    ui.toast(msg, kind);
    return false;
  },

  act(name, data) {
    const sel = findPet(ui.selPet);
    switch (name) {
      case 'equipBest': equipBest(); game.syncPets(); break;
      case 'unequipAll': state.equipped = []; game.syncPets(); break;
      case 'deleteWeak': {
        const weak = state.pets.filter(p => !isEquipped(p.uid) && (p.variant || 0) === 0 &&
          ['common', 'uncommon'].includes(PETS[p.id].rarity));
        if (!weak.length) { ui.toast('Nothing to delete'); break; }
        if (!ui.confirmTap('deleteWeak', `Delete ${weak.length} unequipped Common/Uncommon pets? Tap again to confirm.`)) break;
        weak.forEach(p => removePet(p.uid));
        ui.toast(`Deleted ${weak.length} pets`);
        break;
      }
      case 'equip':
        if (sel && !equipPet(sel.uid)) ui.toast('All pet slots are full', 'bad');
        game.syncPets();
        break;
      case 'unequip': if (sel) { unequipPet(sel.uid); game.syncPets(); } break;
      case 'craft': {
        if (!sel) break;
        const np = craftPet(sel);
        if (np) {
          ui.selPet = np.uid;
          ui.toast(`✨ Crafted <b>${petName(np)}</b>!`, 'good');
          game.syncPets();
        }
        break;
      }
      case 'delete':
        if (sel && (PETS[sel.id].rarity !== 'huge' || ui.confirmTap('delete' + sel.uid, `Delete ${petName(sel)}? Tap Delete again to confirm.`))) {
          removePet(sel.uid);
          ui.selPet = null;
          game.syncPets();
        }
        break;
      case 'hatch': game.hatch(ui.arg, +data.n); break;
      case 'autoHatch': ui.toggleAutoHatch(); break;
      case 'buy': {
        const u = UPGRADES.find(x => x.id === data.id);
        const l = lvl(u.id);
        if (l >= u.max) break;
        const cost = u.cost(l);
        if (state.diamonds < cost) break;
        state.diamonds -= cost;
        state.upgrades[u.id] = l + 1;
        ui.toast(`${u.icon} ${u.name} upgraded!`, 'good');
        if (u.id === 'autofarm') state.autoFarm = true;
        ui.refreshToggles();
        game.syncPets();
        break;
      }
      default:
        if (name.startsWith('dev')) devAct(name, data);
        break;
      case 'save': saveState(); ui.toast('💾 Game saved', 'good'); break;
      case 'reset':
        if (ui.confirmTap('reset', 'Reset ALL progress? This cannot be undone. Tap Reset again to confirm.', 'bad')) {
          resetState();
          game.resetWorld();
          ui.close();
          ui.refreshToggles();
          ui.toast('Progress reset');
          return;
        }
        break;
    }
    ui.updateHud();
    ui.refresh();
  },

  // ---------- Hatch animation ----------
  showHatch(zi, ids, fast) {
    const z = ZONES[zi];
    const el = $('#hatch');
    ui.hatching = true;
    el.innerHTML = `<div class="hatch-row n${Math.min(ids.length, 8)}">${ids.map((id, i) => {
      const d = PETS[id];
      return `<div class="hatch-slot" style="--d:${i * 0.06}s">
        <div class="egg-css shake" style="--c:${z.eggColor};--s:${z.eggSpots}"></div>
        <div class="reveal r-${d.rarity}">
          <div class="em ${d.rarity === 'huge' ? 'big' : ''}">${d.emoji}</div>
          <div class="nm">${d.name}</div>
          <div class="rt" style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name}</div>
        </div>
      </div>`;
    }).join('')}</div><div class="hatch-hint">tap to continue</div>`;
    el.className = '';
    clearTimeout(ui._h1); clearTimeout(ui._h2);
    ui._h1 = setTimeout(() => el.classList.add('open'), fast ? 350 : 950);
    ui._h2 = setTimeout(() => ui.endHatch(), fast ? 1400 : 2800);
  },
  endHatch() {
    clearTimeout(ui._h1); clearTimeout(ui._h2);
    $('#hatch').className = 'hidden';
    ui.hatching = false;
  },
};
