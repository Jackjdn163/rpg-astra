'use strict';

const $ = sel => document.querySelector(sel);

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
const variantClass = v => ['', 'shiny', 'golden', 'rainbow'][v || 0];
const rarityRank = id => RARITY_ORDER.indexOf(PETS[id].rarity);

const ui = {
  current: null,
  arg: null,
  selPet: null,
  hatching: false,
  promptText: null,
  promptFn: null,
  shownCoins: 0,
  shownGems: 0,
  texts: {},
  hudTimer: 0,
  petBarDirty: true,
  pendingConfirm: null,
  // Inventory view state.
  sort: 'power',
  filter: 'all',
  selectMode: false,
  selected: new Set(),
  questTab: 'daily',
  rebirthTab: 'rebirth',
  oddsOpen: null,
  codeText: '',

  init() {
    $('#modal-close').addEventListener('click', () => ui.close());
    $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') ui.close(); });
    const body = $('#modal-body');
    body.addEventListener('click', e => ui.onModalClick(e));
    body.addEventListener('input', e => ui.onModalInput(e));
    body.addEventListener('change', e => ui.onModalInput(e, true));
    document.querySelectorAll('#menu button').forEach(b =>
      b.addEventListener('click', () => { sfx.play('click'); ui.toggle(b.dataset.open); }));
    $('#btn-autofarm').addEventListener('click', () => ui.toggleAutoFarm());
    $('#btn-autohatch').addEventListener('click', () => ui.toggleAutoHatch());
    $('#btn-dev').addEventListener('click', () => ui.toggle('dev'));
    $('#prompt').addEventListener('click', () => ui.runPrompt());
    $('#petbar').addEventListener('click', () => ui.open('pets'));
    $('#tracker').addEventListener('click', () => { ui.questTab = 'daily'; ui.open('quests'); });
    // The skip button appears after ~1s; once pets are revealed, tapping anywhere closes the reveal.
    $('#hatch').addEventListener('click', e => {
      if (e.target.id === 'hatch-skip' || $('#hatch').classList.contains('open')) ui.endHatch();
    });
    ui.shownCoins = state.coins;
    ui.shownGems = state.gems;
    ui.refreshToggles();
    ui.updateHud(0, true);
  },

  setText(sel, text, html = false) {
    if (ui.texts[sel] === text) return;
    ui.texts[sel] = text;
    const el = $(sel);
    if (html) el.innerHTML = text; else el.textContent = text;
  },

  // ---------- HUD ----------
  updateHud(dt, force) {
    // Numbers tween toward their real values instead of snapping.
    const k = force ? 1 : Math.min(1, dt * 12);
    ui.shownCoins += (state.coins - ui.shownCoins) * k;
    ui.shownGems += (state.gems - ui.shownGems) * k;
    if (Math.abs(state.coins - ui.shownCoins) < Math.max(1, Math.abs(state.coins) * 0.002)) ui.shownCoins = state.coins;
    if (Math.abs(state.gems - ui.shownGems) < 1) ui.shownGems = state.gems;
    ui.setText('#coins', U.fmt(ui.shownCoins));
    ui.setText('#gems', U.fmt(Math.round(ui.shownGems)));
    const need = F.xpToNext(state.level);
    ui.setText('#lvl', `Lv ${state.level}`);
    ui.setText('#xp-text', `${U.fmt(state.xp)} / ${U.fmt(need)} XP`);
    $('#xp-fill').style.width = `${Math.min(100, (state.xp / need) * 100)}%`;

    ui.hudTimer -= dt;
    if (force || ui.hudTimer <= 0) {
      ui.hudTimer = 0.3;
      ui.renderBoosts();
      ui.renderBadges();
      ui.renderTracker();
      ui.renderPetBar();
    }
  },

  renderBoosts() {
    const html = Object.keys(state.boosts).filter(boostOn).map(id => {
      const b = BOOSTS[id];
      return `<div class="chip" style="--c:${b.color}">${b.icon} ${b.name} <b>${fmtTime(state.boosts[id])}</b></div>`;
    }).join('');
    ui.setText('#boosts', html, true);
  },

  renderBadges() {
    const q = readyQuestCount() + (canClaimLogin() ? 1 : 0);
    const qb = $('#badge-quests');
    qb.textContent = q;
    qb.classList.toggle('hidden', q === 0);
    $('#badge-rebirth').classList.toggle('hidden', !canRebirth() && !TREE.some(t => tl(t.id) < t.max && state.tokens >= t.cost(tl(t.id))));
  },

  renderTracker() {
    const rows = state.daily.quests.map(q => {
      const pct = Math.min(100, (q.progress / q.n) * 100);
      return `<div class="tq ${q.claimed ? 'done' : questReady(q) ? 'ready' : ''}">
        <span>${q.claimed ? '✔ ' : ''}${questText(q)}</span>
        <div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    ui.setText('#tracker', `<div class="tt">📜 Daily quests${canClaimLogin() ? ' · 🎁 Login reward!' : ''}</div>${rows}`, true);
  },

  renderPetBar() {
    const cards = state.equipped.map(uid => {
      const p = findPet(uid);
      if (!p) return '';
      const d = PETS[p.id];
      return `<div class="pb r-${d.rarity} ${variantClass(p.variant)}"><span class="em">${d.emoji}</span><small>${p.level || 1}</small></div>`;
    }).join('');
    const empty = Math.max(0, equipSlots() - state.equipped.length);
    const html = `${cards}${'<div class="pb empty">+</div>'.repeat(empty)}
      <div class="pw">⚔️ ${U.fmt(teamPower())}<small>Power</small></div>`;
    ui.setText('#petbar', html, true);
  },

  bump(which) {
    const el = $(which === 'coin' ? '#pill-coins' : '#pill-gems');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  },

  refreshToggles() {
    const af = $('#btn-autofarm'), ah = $('#btn-autohatch');
    ah.classList.toggle('hidden', !tl('autoHatch'));
    af.classList.toggle('on', state.autoFarm);
    ah.classList.toggle('on', state.autoHatch);
    af.querySelector('b').textContent = state.autoFarm ? 'ON' : 'OFF';
    ah.querySelector('b').textContent = state.autoHatch ? 'ON' : 'OFF';
  },
  toggleAutoFarm() {
    state.autoFarm = !state.autoFarm;
    sfx.play('click');
    ui.refreshToggles();
  },
  toggleAutoHatch() {
    if (!tl('autoHatch')) return ui.toast('Unlock Auto Hatch in Rebirth → Token Tree', 'bad');
    state.autoHatch = !state.autoHatch;
    sfx.play('click');
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
    setTimeout(() => el.classList.add('out'), 3000);
    setTimeout(() => el.remove(), 3500);
    const all = $('#toasts').children;
    if (all.length > 4) all[0].remove();
  },

  zoneBanner(name, sub = '') {
    const el = $('#zone-banner');
    el.innerHTML = `${sub ? `<small>${sub}</small>` : ''}${name}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  // First tap warns, a second tap within 4s confirms.
  confirmTap(key, msg, kind = '') {
    if (ui.pendingConfirm === key) { ui.pendingConfirm = null; return true; }
    ui.pendingConfirm = key;
    clearTimeout(ui._confirmTimer);
    ui._confirmTimer = setTimeout(() => { ui.pendingConfirm = null; ui.refresh(); }, 4000);
    ui.toast(msg, kind);
    return false;
  },

  // ---------- Modals ----------
  isOpen() { return ui.current !== null; },
  open(name, arg) {
    if (name !== 'pets') { ui.selectMode = false; ui.selected.clear(); }
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
    const focused = document.activeElement && document.activeElement.id;
    body.innerHTML = r.body;
    const ns = body.querySelector('.scroll');
    if (ns) ns.scrollTop = top;
    if (focused) { const f = document.getElementById(focused); if (f) f.focus(); }
  },

  bar(frac, cls = '') { return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, frac * 100))}%"></i></div>`; },
  confirmClass(key) { return ui.pendingConfirm === key ? 'confirming' : ''; },

  petCard(p) {
    const d = PETS[p.id];
    const sel = ui.selectMode ? ui.selected.has(p.uid) : ui.selPet === p.uid;
    return `<div class="pet-card r-${d.rarity} ${variantClass(p.variant)} ${sel ? 'sel' : ''}" data-uid="${p.uid}" title="${petName(p)}">
      <div class="em">${d.emoji}</div>
      <div class="lv">Lv ${p.level || 1}</div>
      <div class="pw">⚔️ ${U.fmt(effectivePower(p))}</div>
      ${isEquipped(p.uid) ? '<div class="check">✔</div>' : ''}
      ${ui.selectMode && sel ? '<div class="check pick">●</div>' : ''}
    </div>`;
  },

  oddsTable(zi, opts) {
    const rows = eggOdds(zi, opts);
    const vc = VARIANTS.slice(1).map(v => `${v.name} ${U.pct(v.chance * 100)} (${v.mult}x)`).join(' · ');
    return `<div class="odds-table">
      ${rows.map(o => {
        const d = PETS[o.id];
        const known = state.discovered[o.id];
        return `<div class="orow r-${d.rarity}"><span class="em ${known ? '' : 'unknown'}">${d.emoji}</span>
          <span class="nm">${known ? d.name : '???'}</span>
          <span class="rt">${RARITIES[d.rarity].name}</span>
          <b>${U.pct(o.chance * 100)}</b></div>`;
      }).join('')}
      <div class="muted">Every hatch also rolls a mutation: ${vc}.</div>
    </div>`;
  },

  render: {
    egg(zi) {
      const z = ZONES[zi];
      const eggVis = (gold) => `<div class="egg-css ${gold ? 'gold' : ''}" style="--c:${z.eggColor};--s:${gold ? '#ffe066' : z.eggSpots}"></div>`;
      const tickets = (state.tickets.rare || state.tickets.epic) && zi > 0 ? `<div class="tickets">
          ${state.tickets.rare ? `<button data-act="ticket" data-t="rare" class="gold">🎟️ Use Rare+ ticket (${state.tickets.rare})</button>` : ''}
          ${state.tickets.epic ? `<button data-act="ticket" data-t="epic" class="gold">🎟️ Use Epic+ ticket (${state.tickets.epic})</button>` : ''}
        </div>` : '';
      const auto = tl('autoHatch') && zi > 0
        ? `<button data-act="autoHatch" class="${state.autoHatch ? 'on' : ''}">♻️ Auto Hatch: ${state.autoHatch ? 'ON' : 'OFF'}</button>` : '';
      let cards;
      if (z.hub) {
        const cd = state.starterCooldown;
        cards = `<div class="egg-card">
          ${eggVis(false)}
          <div class="ec-info"><h3>${z.egg}</h3><div class="cost free">FREE</div>
            <div class="muted">One free hatch every ${STARTER_COOLDOWN} seconds.</div></div>
          <div class="ec-btns">
            <button data-act="hatch" data-n="1" class="primary" ${cd > 0 ? 'disabled' : ''}>${cd > 0 ? `Ready in ${Math.ceil(cd)}s` : 'Hatch x1'}</button>
            <button data-act="odds" data-k="coin">${ui.oddsOpen === 'coin' ? 'Hide odds' : 'Odds'}</button>
          </div>
        </div>${ui.oddsOpen === 'coin' ? ui.oddsTable(zi, {}) : ''}`;
      } else {
        const lc = F.luckyEggCost(zi);
        cards = `<div class="egg-card">
          ${eggVis(false)}
          <div class="ec-info"><h3>${z.egg}</h3><div class="cost">🪙 ${U.fmt(z.eggCost)}</div>
            <div class="muted">You have 🪙 ${U.fmt(state.coins)}</div></div>
          <div class="ec-btns">
            <button data-act="hatch" data-n="1" class="primary" ${state.coins < z.eggCost ? 'disabled' : ''}>Hatch x1</button>
            <button data-act="hatch" data-n="10" class="primary" ${state.coins < z.eggCost * 10 ? 'disabled' : ''}>x10 · 🪙 ${U.fmt(z.eggCost * 10)}</button>
            <button data-act="odds" data-k="coin">${ui.oddsOpen === 'coin' ? 'Hide odds' : 'Odds'}</button>
          </div>
        </div>
        ${ui.oddsOpen === 'coin' ? ui.oddsTable(zi, {}) : ''}
        <div class="egg-card lucky">
          ${eggVis(true)}
          <div class="ec-info"><h3>Lucky ${z.egg}</h3><div class="cost gem">💎 ${lc}</div>
            <div class="muted">4x chance for Rare and better.</div></div>
          <div class="ec-btns">
            <button data-act="hatch" data-n="1" data-lucky="1" class="primary" ${state.gems < lc ? 'disabled' : ''}>Hatch x1</button>
            <button data-act="hatch" data-n="10" data-lucky="1" class="primary" ${state.gems < lc * 10 ? 'disabled' : ''}>x10 · 💎 ${lc * 10}</button>
            <button data-act="odds" data-k="lucky">${ui.oddsOpen === 'lucky' ? 'Hide odds' : 'Odds'}</button>
          </div>
        </div>
        ${ui.oddsOpen === 'lucky' ? ui.oddsTable(zi, { lucky: true }) : ''}`;
      }
      return {
        title: `🥚 ${z.name} Egg Shop`,
        body: `<div class="scroll">${cards}${tickets}<div class="row center">${auto}</div></div>`,
      };
    },

    pets() {
      let list = [...state.pets];
      if (ui.filter !== 'all') list = list.filter(p => PETS[p.id].rarity === ui.filter);
      const sorters = {
        power: (a, b) => petPower(b) - petPower(a),
        rarity: (a, b) => rarityRank(b.id) - rarityRank(a.id) || petPower(b) - petPower(a),
        newest: (a, b) => b.uid - a.uid,
      };
      list.sort((a, b) => (isEquipped(b.uid) - isEquipped(a.uid)) || sorters[ui.sort](a, b));
      const chips = ['all', ...RARITY_ORDER].map(r =>
        `<button data-act="filter" data-r="${r}" class="chipbtn ${ui.filter === r ? 'active' : ''}" ${r !== 'all' ? `style="--rc:${RARITIES[r].color}"` : ''}>${r === 'all' ? 'All' : RARITIES[r].name}</button>`).join('');

      let footer;
      if (ui.selectMode) {
        const sel = [...ui.selected].map(findPet).filter(Boolean);
        const value = sel.reduce((s, p) => s + sellValue(p), 0);
        footer = `<div class="detail sellbar">
          <b>${sel.length} selected</b>
          <button data-act="selectDupes">Select unequipped Common & Uncommon</button>
          <button data-act="clearSel">Clear</button>
          <button data-act="sellSel" class="danger ${ui.confirmClass('sellSel')}" ${sel.length ? '' : 'disabled'}>Sell for 🪙 ${U.fmt(value)}</button>
        </div>`;
      } else {
        const p = findPet(ui.selPet);
        if (!p) footer = '<div class="detail empty">Tap a pet to see its stats, level it up or fuse it.</div>';
        else {
          const d = PETS[p.id];
          const lvl = p.level || 1;
          const feed = feedCandidates(p).length;
          const fuseTo = fuseTarget(p);
          const fuseN = fuseCandidates(p).length + 1;
          const ab = d.ability ? Object.entries(d.ability).map(([k, v]) => ABILITY_TEXT[k](v)).join(', ') : '';
          footer = `<div class="detail">
            <div class="big-em ${variantClass(p.variant)}">${d.emoji}</div>
            <div class="info">
              <h3>${petName(p)} <span class="lvtag">Lv ${lvl}/100</span></h3>
              <div class="rar" style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name} · ${d.zone ? ZONES[d.zone].egg : 'Starter Egg'}${p.variant ? ` · ${VARIANTS[p.variant].name} ${VARIANTS[p.variant].mult}x` : ''}</div>
              <div>⚔️ Power <b>${U.fmt(effectivePower(p))}</b> <span class="muted">(level bonus +${Math.round((F.levelPower(lvl) - 1) * 100)}%)</span></div>
              ${ab ? `<div class="ability">✨ Ability: ${ab}</div>` : ''}
              <div class="row">
                ${isEquipped(p.uid) ? '<button data-act="unequip">Unequip</button>'
                  : `<button data-act="equip" class="primary" ${state.equipped.length >= equipSlots() ? 'disabled' : ''}>Equip</button>`}
                <button data-act="train" ${lvl >= 100 || state.coins < trainCost(p) ? 'disabled' : ''}>📈 Train +1 Lv · 🪙 ${U.fmt(trainCost(p))}</button>
                <button data-act="feed" ${lvl >= 100 || feed < FEED_COST ? 'disabled' : ''} title="Uses unequipped pets of the same rarity and mutation">🍖 Feed ${FEED_COST} → +1 Lv (${Math.min(feed, FEED_COST)}/${FEED_COST})</button>
                ${fuseTo ? `<button data-act="fuse" ${fuseN < FUSE_COST || state.coins < fuseFee(p) ? 'disabled' : ''} title="Uses unequipped pets of the same rarity from the same egg">🔮 Fuse ${FUSE_COST} → ${RARITIES[PETS[fuseTo].rarity].name} (${Math.min(fuseN, FUSE_COST)}/${FUSE_COST}) · 🪙 ${U.fmt(fuseFee(p))}</button>` : ''}
                ${p.variant < VARIANTS.length - 1 ? `<button data-act="reroll" ${state.gems < rerollCost(p) ? 'disabled' : ''}>🎲 Reroll mutation · 💎 ${rerollCost(p)}</button>` : ''}
                <button data-act="sell" class="danger ${ui.confirmClass('sell' + p.uid)}">Sell · 🪙 ${U.fmt(sellValue(p))}</button>
              </div>
            </div>
          </div>`;
        }
      }
      return {
        title: `🐾 Pets <small>${state.pets.length}/${MAX_PETS} · Equipped ${state.equipped.length}/${equipSlots()} · ⚔️ ${U.fmt(teamPower())}</small>`,
        body: `<div class="toolbar">
            <button data-act="equipBest" class="primary">⭐ Equip Best</button>
            <label class="sel">Sort <select id="pet-sort" data-ui="sort">
              ${['power', 'rarity', 'newest'].map(s => `<option value="${s}" ${ui.sort === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
            </select></label>
            <button data-act="selectMode" class="${ui.selectMode ? 'on' : ''}">☑️ Multi-select</button>
          </div>
          <div class="chips">${chips}</div>
          <div class="scroll"><div class="pet-grid">${list.map(p => ui.petCard(p)).join('') || '<p class="muted">No pets match this filter.</p>'}</div></div>
          ${footer}`,
      };
    },

    quests() {
      const tabs = `<div class="tabs">
        <button data-act="qtab" data-tab="daily" class="${ui.questTab === 'daily' ? 'active' : ''}">📜 Quests & Login</button>
        <button data-act="qtab" data-tab="ach" class="${ui.questTab === 'ach' ? 'active' : ''}">🏅 Achievements</button>
      </div>`;
      if (ui.questTab === 'ach') {
        const got = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
        return {
          title: `🏅 Achievements <small>${got}/${ACHIEVEMENTS.length}</small>`,
          body: `${tabs}<div class="scroll"><div class="badges">${ACHIEVEMENTS.map(a => {
            const has = state.achievements[a.id];
            return `<div class="badge ${has ? 'got' : ''}"><div class="ic">${a.icon}</div><b>${a.name}</b>
              <div class="muted">${a.desc}</div><div class="rw">${has ? '✔ Earned' : `💎 ${a.gems}`}</div></div>`;
          }).join('')}</div></div>`,
        };
      }
      const nextDay = nextLoginDay();
      const can = canClaimLogin();
      const cal = LOGIN_REWARDS.map((r, i) => {
        const day = i + 1;
        const done = can ? day < nextDay : day <= state.login.streak;
        const today = can && day === nextDay;
        return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''}"><small>Day ${day}</small><div class="ic">${r.icon}</div><span>${r.label}</span></div>`;
      }).join('');
      const qrow = (q, weekly) => `<div class="quest ${questReady(q) ? 'ready' : ''} ${q.claimed ? 'done' : ''}">
        <div class="info"><b>${weekly ? '🗓️ Weekly: ' : ''}${questText(q)}</b>
          ${ui.bar(q.progress / q.n)}<div class="prog">${U.fmt(q.progress)} / ${U.fmt(q.n)}</div></div>
        ${q.claimed ? '<div class="done-tag">✔</div>'
          : `<button data-act="claimQuest" data-w="${weekly ? 1 : 0}" data-i="${weekly ? 0 : state.daily.quests.indexOf(q)}" class="primary" ${questReady(q) ? '' : 'disabled'}>${rewardText(q.reward)}</button>`}
      </div>`;
      return {
        title: '📜 Quests',
        body: `${tabs}<div class="scroll">
          <h4>Login streak <span class="muted">Miss a day and the streak restarts at day 1.</span></h4>
          <div class="calendar">${cal}</div>
          <div class="row center"><button data-act="claimLogin" class="primary" ${can ? '' : 'disabled'}>${can ? `🎁 Claim day ${nextDay}` : 'Come back tomorrow'}</button></div>
          <h4>Daily quests <span class="muted">New quests every day</span></h4>
          <div class="quests">${state.daily.quests.map(q => qrow(q, false)).join('')}</div>
          <h4>Weekly quest</h4>
          <div class="quests">${state.weekly.quest ? qrow(state.weekly.quest, true) : ''}</div>
        </div>`,
      };
    },

    index() {
      const total = Object.keys(PETS).length;
      const found = Object.keys(PETS).filter(id => state.discovered[id]).length;
      return {
        title: `📖 Pet Index <small>${found}/${total}</small>`,
        body: `<div class="scroll">
          <p class="muted">Pets stay in your Index forever, even after you sell them or rebirth. Complete each egg's set for rewards.</p>
          ${ZONES.map(z => {
            const prog = indexProgress(z.index);
            const got = state.indexRewards[z.index] || 0;
            const steps = INDEX_STEPS.map((s, i) => {
              const r = indexRewardFor(z.index, i);
              const label = r.label || (r.coins ? `🪙 ${U.fmt(r.coins)}` : `💎 ${r.gems}`);
              return `<span class="step ${i < got ? 'got' : ''}">${Math.round(s * 100)}%: ${label}${i < got ? ' ✔' : ''}</span>`;
            }).join('');
            return `<div class="idx-zone">
              <div class="idx-head"><b>${z.egg}</b> <span class="muted">${z.hub ? 'Hub' : `Zone ${z.index} · ${z.name}`}</span>
                <span class="pct">${Math.round(prog * 100)}%</span></div>
              ${ui.bar(prog)}
              <div class="steps">${steps}</div>
              <div class="odds">${z.petIds.map(id => {
                const d = PETS[id];
                const known = state.discovered[id];
                return `<div class="odd r-${d.rarity}">
                  <div class="em ${known ? '' : 'unknown'}">${d.emoji}</div>
                  <div class="nm">${known ? d.name : '???'}</div>
                  <div class="ch" style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name}</div>
                  <div class="bp">⚔️ ${U.fmt(d.basePower)}</div>
                </div>`;
              }).join('')}</div>
            </div>`;
          }).join('')}</div>`,
      };
    },

    rebirth() {
      const tabs = `<div class="tabs">
        <button data-act="rtab" data-tab="rebirth" class="${ui.rebirthTab === 'rebirth' ? 'active' : ''}">🌀 Rebirth</button>
        <button data-act="rtab" data-tab="tree" class="${ui.rebirthTab === 'tree' ? 'active' : ''}">🌳 Token Tree <b class="tok">${state.tokens}</b></button>
      </div>`;
      if (ui.rebirthTab === 'tree') {
        return {
          title: `🌳 Token Tree <small>🔷 ${state.tokens} Rebirth Tokens</small>`,
          body: `${tabs}<div class="scroll"><p class="muted">Tokens and these upgrades are never reset.</p><div class="tree">${TREE.map(t => {
            const l = tl(t.id);
            const maxed = l >= t.max;
            const cost = maxed ? 0 : t.cost(l);
            return `<div class="node ${maxed ? 'maxed' : ''}">
              <div class="ic">${t.icon}</div>
              <div class="info"><b>${t.name}</b> <span class="lv">${t.max > 1 ? `${l}/${t.max}` : ''}</span>
                <div class="muted">${t.desc}</div>
                <div class="fx">Now: <b>${t.fx(l)}</b>${maxed ? '' : ` → <b class="next">${t.fx(l + 1)}</b>`}</div></div>
              <button data-act="buyTree" data-id="${t.id}" class="primary" ${maxed || state.tokens < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `🔷 ${cost}`}</button>
            </div>`;
          }).join('')}</div></div>`,
        };
      }
      const r = state.rebirths;
      const rz = rebirthZone();
      const can = canRebirth();
      const tokens = rebirthTokens();
      const x = v => `x${v.toFixed(2)}`;
      return {
        title: '🌀 Rebirth',
        body: `${tabs}<div class="scroll"><div class="rebirth">
          <div class="rb-req ${can ? 'ok' : ''}">${can ? '✔ Ready to rebirth!' : `🔒 Unlock <b>${ZONES[rz].name}</b> (zone ${rz}) to rebirth.`}
            <span class="muted">Each rebirth raises the requirement by one zone, up to ${ZONES[LAST_ZONE].name}. Going past it earns extra tokens.</span></div>
          <table class="compare">
            <tr><th></th><th>Now</th><th>After rebirth</th></tr>
            <tr><td>Rebirths</td><td>🌀 ${r}</td><td class="up">🌀 ${r + 1}</td></tr>
            <tr><td>Coin multiplier</td><td>${x(F.rebirthCoinMult(r))}</td><td class="up">${x(F.rebirthCoinMult(r + 1))}</td></tr>
            <tr><td>Pet power multiplier</td><td>${x(F.rebirthPowerMult(r))}</td><td class="up">${x(F.rebirthPowerMult(r + 1))}</td></tr>
            <tr><td>Rebirth Tokens</td><td>🔷 ${state.tokens}</td><td class="up">🔷 ${state.tokens + (can ? tokens : 0)}</td></tr>
            <tr><td>Coins</td><td>🪙 ${U.fmt(state.coins)}</td><td class="down">🪙 ${U.fmt(HEAD_START[tl('headStart')])}</td></tr>
            <tr><td>Gems</td><td>💎 ${U.fmt(state.gems)}</td><td class="down">💎 0</td></tr>
            <tr><td>Pets</td><td>${state.pets.length}</td><td class="down">${tl('keep') ? `Your best ${tl('keep')}` : 'Starter Puppy'}</td></tr>
            <tr><td>Player level</td><td>Lv ${state.level}</td><td class="down">Lv 1</td></tr>
            <tr><td>Zones</td><td>${ZONES[state.unlocked].name}</td><td class="down">Meadow</td></tr>
          </table>
          <div class="rb-cols">
            <div><h4>You keep</h4><ul><li>Rebirth Tokens and the Token Tree</li><li>Pet Index and its bonuses</li><li>Achievements, quests and login streak</li><li>Egg tickets and active boosts</li></ul></div>
            <div><h4>You reset</h4><ul><li>Coins, gems and pets${tl('keep') ? ` (except your best ${tl('keep')})` : ''}</li><li>Player level and XP</li><li>Unlocked zones and Giant Chest rewards</li></ul></div>
          </div>
          <button data-act="rebirth" class="primary big ${ui.confirmClass('rebirth')}" ${can ? '' : 'disabled'}>
            ${ui.pendingConfirm === 'rebirth' ? 'Tap again to confirm rebirth' : `🌀 Rebirth for +${can ? tokens : 0} 🔷`}</button>
        </div></div>`,
      };
    },

    settings() {
      const s = state.stats;
      const t = Math.floor(s.playTime);
      const time = `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
      const toggle = (key, label) =>
        `<button data-act="setting" data-key="${key}" class="${state.settings[key] ? 'on' : ''}">${label}: ${state.settings[key] ? 'ON' : 'OFF'}</button>`;
      const slider = (key, label) => `<label class="slider" for="set-${key}"><span>${label}</span>
        <input id="set-${key}" type="range" min="0" max="100" value="${Math.round(state.settings[key] * 100)}" data-setting="${key}">
        <b id="set-${key}-v">${Math.round(state.settings[key] * 100)}%</b></label>`;
      return {
        title: '⚙️ Settings',
        body: `<div class="scroll">
          <h4>Sound</h4>
          ${slider('music', '🎵 Music')}
          ${slider('sfx', '🔊 Sound effects')}
          <h4>Display</h4>
          <div class="row">
            ${toggle('perf', '⚡ Performance mode')}
            ${toggle('dmgNumbers', '🔢 Damage numbers')}
            ${toggle('shake', '📳 Screen shake')}
          </div>
          <h4>Redeem a code</h4>
          <div class="row">
            <input id="code-input" class="text" type="text" placeholder="Enter code" autocomplete="off" value="${ui.codeText}" data-ui="code">
            <button data-act="redeem" class="primary">Redeem</button>
          </div>
          <h4>Stats</h4>
          <div class="stats">
            <div><span>Play time</span><b>${time}</b></div>
            <div><span>Rebirths</span><b>🌀 ${state.rebirths}</b></div>
            <div><span>Highest level</span><b>${s.maxLevel}</b></div>
            <div><span>Eggs hatched</span><b>${U.fmt(s.hatched)}</b></div>
            <div><span>Things broken</span><b>${U.fmt(s.kills)}</b></div>
            <div><span>Giant Chests broken</span><b>${U.fmt(s.bosses)}</b></div>
            <div><span>Coins earned</span><b>🪙 ${U.fmt(s.coinsEarned)}</b></div>
            <div><span>Gems earned</span><b>💎 ${U.fmt(s.gemsEarned)}</b></div>
          </div>
          <h4>How to play</h4>
          <ul class="help">
            <li>Walk with <b>WASD / arrows</b> or tap the ground. <b>Auto Farm</b> walks you to coin piles for you.</li>
            <li>Your pets attack the nearest coin pile, crate, present or safe on their own. Tap one to focus it.</li>
            <li>💎 <b>Gem Piles</b> and rare <b>Gem Geodes</b> glow cyan. Each zone also has a <b>Giant Chest</b>: stand in its ring to break it.</li>
            <li>Level up to open new zones, and hatch eggs at each zone's stall. Equip slots grow at levels 10, 20 and 30.</li>
            <li>Rebirth for Rebirth Tokens and a permanent multiplier.</li>
            <li>Keys: <b>E</b> interact, <b>P</b> pets, <b>Q</b> quests, <b>I</b> index, <b>R</b> rebirth, <b>F</b> auto farm, <b>Esc</b> close.</li>
          </ul>
          <div class="row">
            <button data-act="save" class="primary">💾 Save now</button>
            <button data-act="reset" class="danger ${ui.confirmClass('reset')}">${ui.pendingConfirm === 'reset' ? 'Tap again to erase everything' : 'Reset progress'}</button>
          </div>
        </div>`,
      };
    },
  },

  onModalInput(e, isChange) {
    const t = e.target;
    if (t.dataset.setting) {
      const key = t.dataset.setting;
      state.settings[key] = Number(t.value) / 100;
      const v = document.getElementById(`set-${key}-v`);
      if (v) v.textContent = `${t.value}%`;
      sfx.applyVolume();
      return;
    }
    if (t.dataset.ui === 'code') { ui.codeText = t.value; return; }
    if (t.dataset.ui === 'sort' && isChange) { ui.sort = t.value; ui.refresh(); return; }
    if (t.dataset.devField) ui.devForm[t.dataset.devField] = t.value;
  },

  onModalClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (btn) {
      if (btn.disabled) { sfx.play('error'); return; }
      ui.act(btn.dataset.act, btn.dataset);
      return;
    }
    const card = e.target.closest('.pet-card');
    if (card) {
      const uid = +card.dataset.uid;
      if (ui.selectMode) {
        if (ui.selected.has(uid)) ui.selected.delete(uid); else ui.selected.add(uid);
      } else ui.selPet = ui.selPet === uid ? null : uid;
      sfx.play('click');
      ui.refresh();
    }
  },

  act(name, data) {
    const sel = findPet(ui.selPet);
    switch (name) {
      // Eggs
      case 'hatch': game.hatch(ui.arg, +data.n, { lucky: !!data.lucky }); break;
      case 'ticket': game.hatch(ui.arg, 1, { ticket: data.t }); break;
      case 'odds': ui.oddsOpen = ui.oddsOpen === data.k ? null : data.k; break;
      case 'autoHatch': ui.toggleAutoHatch(); break;
      // Pets
      case 'equipBest': equipBest(); game.syncPets(); sfx.play('buy'); break;
      case 'filter': ui.filter = data.r; break;
      case 'selectMode': ui.selectMode = !ui.selectMode; ui.selected.clear(); break;
      case 'clearSel': ui.selected.clear(); break;
      case 'selectDupes':
        state.pets.forEach(p => {
          if (!isEquipped(p.uid) && !p.variant && ['common', 'uncommon'].includes(PETS[p.id].rarity)) ui.selected.add(p.uid);
        });
        break;
      case 'sellSel': {
        const uids = [...ui.selected];
        if (!ui.confirmTap('sellSel', `Sell ${uids.length} pets? Tap Sell again to confirm.`)) break;
        const c = sellPets(uids);
        ui.selected.clear();
        game.syncPets();
        ui.toast(`Sold ${uids.length} pets for 🪙 ${U.fmt(c)}`, 'good');
        sfx.play('coin');
        break;
      }
      case 'equip': if (sel && !equipPet(sel.uid)) ui.toast('All equip slots are full', 'bad'); game.syncPets(); break;
      case 'unequip': if (sel) { unequipPet(sel.uid); game.syncPets(); } break;
      case 'train': if (sel && trainPet(sel)) { sfx.play('buy'); questProgress('fuse', 1); game.syncPets(); } break;
      case 'feed': if (sel && feedPet(sel)) { sfx.play('buy'); questProgress('fuse', 1); ui.toast(`🍖 ${petName(sel)} is now Lv ${sel.level}!`, 'good'); game.syncPets(); } break;
      case 'fuse': {
        if (!sel) break;
        const np = fusePet(sel);
        if (np) {
          ui.selPet = np.uid;
          questProgress('fuse', 1);
          sfx.play('reveal', rarityRank(np.id));
          ui.toast(`🔮 Fused into <b style="color:${RARITIES[PETS[np.id].rarity].color}">${petName(np)}</b>!`, 'good');
          game.syncPets();
        }
        break;
      }
      case 'reroll': {
        if (!sel) break;
        const r = rerollPet(sel);
        if (!r) break;
        if (r.improved) { sfx.play('reveal', 4); ui.toast(`🎲 Mutation upgraded to <b>${VARIANTS[r.variant].name}</b>!`, 'huge'); }
        else { sfx.play('click'); ui.toast(`🎲 Rolled ${VARIANTS[r.variant].name || 'no mutation'}. No change.`); }
        game.syncPets();
        break;
      }
      case 'sell':
        if (sel && ui.confirmTap('sell' + sel.uid, `Sell ${petName(sel)} for 🪙 ${U.fmt(sellValue(sel))}? Tap Sell again to confirm.`)) {
          const c = sellPets([sel.uid]);
          ui.selPet = null;
          game.syncPets();
          ui.toast(`Sold for 🪙 ${U.fmt(c)}`);
          sfx.play('coin');
        }
        break;
      // Quests
      case 'qtab': ui.questTab = data.tab; break;
      case 'claimLogin': { const txt = claimLogin(); if (txt) { sfx.play('achieve'); ui.toast(`🎁 Login reward: ${txt}`, 'good'); } break; }
      case 'claimQuest': {
        const q = +data.w ? state.weekly.quest : state.daily.quests[+data.i];
        const txt = claimQuest(q);
        if (txt) { sfx.play('achieve'); ui.toast(`📜 Quest complete: ${txt}`, 'good'); }
        break;
      }
      // Rebirth
      case 'rtab': ui.rebirthTab = data.tab; break;
      case 'buyTree':
        if (buyTree(data.id)) {
          sfx.play('buy');
          ui.refreshToggles();
          game.syncPets();
        }
        break;
      case 'rebirth':
        if (ui.confirmTap('rebirth', 'Rebirth resets coins, gems, pets, level and zones. Tap the button again to confirm.')) {
          game.rebirth();
          ui.rebirthTab = 'tree';
        }
        break;
      // Settings
      case 'setting': state.settings[data.key] = !state.settings[data.key]; sfx.play('click'); break;
      case 'redeem': {
        const r = redeemCode(ui.codeText);
        ui.toast(r.msg, r.ok ? 'good' : 'bad');
        sfx.play(r.ok ? 'achieve' : 'error');
        if (r.ok) ui.codeText = '';
        break;
      }
      case 'save': saveState(); ui.toast('💾 Game saved', 'good'); break;
      case 'reset':
        if (ui.confirmTap('reset', 'This erases ALL progress, including rebirths and the Index. Tap again to confirm.', 'bad')) {
          resetState();
          game.resetWorld();
          ui.close();
          ui.refreshToggles();
          ui.toast('Progress reset');
          return;
        }
        break;
      default:
        if (name.startsWith('dev')) devAct(name, data);
        break;
    }
    ui.updateHud(0, true);
    ui.refresh();
  },

  // ---------- Hatch reveal ----------
  // results: [{ id, variant, isNew }]; tier 0–5 sets how flashy the reveal is.
  showHatch(zi, results, fast, tier) {
    const z = ZONES[zi];
    const el = $('#hatch');
    const speed = hatchTimeMult();
    ui.hatching = true;
    const shout = tier >= 5 ? 'SECRET!!!' : tier >= 4 ? 'LEGENDARY!' : '';
    el.innerHTML = `${tier >= 4 ? '<div class="rays"></div>' : ''}
      <div class="hatch-row n${Math.min(results.length, 10)}">${results.map((r, i) => {
        const d = PETS[r.id];
        const v = VARIANTS[r.variant];
        return `<div class="hatch-slot" style="--d:${i * 0.05}s">
          <div class="egg-css shake" style="--c:${z.eggColor};--s:${z.eggSpots}"></div>
          <div class="reveal r-${d.rarity} ${variantClass(r.variant)}">
            ${r.isNew ? '<div class="new">NEW!</div>' : ''}
            ${v.name ? `<div class="vtag">${v.name}</div>` : ''}
            <div class="em">${d.emoji}</div>
            <div class="nm">${d.name}</div>
            <div class="rt" style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name}</div>
          </div>
        </div>`;
      }).join('')}</div>
      ${shout ? `<div class="shout">${shout}</div>` : ''}
      <button class="skip" id="hatch-skip">Skip ▸</button>`;
    el.className = `tier-${tier}`;
    if (!fast) sfx.play('shake');
    clearTimeout(ui._h1); clearTimeout(ui._h2);
    ui._h1 = setTimeout(() => { el.classList.add('open'); sfx.play('reveal', tier); }, (fast ? 350 : 1100) * speed);
    ui._h2 = setTimeout(() => ui.endHatch(), (fast ? 1300 : results.length > 1 ? 3800 : 3000) * speed + (tier >= 4 && !fast ? 1200 : 0));
  },
  endHatch() {
    clearTimeout(ui._h1); clearTimeout(ui._h2);
    $('#hatch').className = 'hidden';
    ui.hatching = false;
  },
};
