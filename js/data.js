'use strict';

// All balance numbers live in this file. Formulas follow the design spec:
//   HP(n)       = HP_0 × 1.9^(n-1)          (HP_0 = 15)
//   Coins(n, r) = HP(n) × k × zoneCoinMult(n) × rebirthMult(r)   (per coin pile)
//   EggCost(n)  = EggCost_0 × 8^(n-1)        (spec target: 8–15x per zone)
//   Mult(r)     = 1.10^r coins, 1.05^r pet power (multiplicative per rebirth)
//   XP(l)       = 100 × l^1.4                 (XP needed to go from level l to l+1)

const ZW = 1400;           // zone width in world px
const ZH = 1000;           // zone height in world px
const MAX_PETS = 300;      // inventory cap
const ATTACK_INTERVAL = 0.6;  // seconds between shots for each pet (spec: 0.5–1s)
const ATTACK_RANGE = 340;  // pets attack breakables within this distance of the player
const STARTER_COOLDOWN = 20; // seconds between free Starter Egg hatches

const F = {
  hp: n => 15 * Math.pow(1.9, n - 1),
  coinK: 0.6,
  zoneCoinMult: n => Math.pow(2, n - 1),
  eggCost: n => 500 * Math.pow(8, n - 1),
  gateCost: n => (n <= 2 ? 1000 : 2 * 500 * Math.pow(8, n - 2)),
  luckyEggCost: n => 40 * n,
  xpToNext: l => Math.round(100 * Math.pow(l, 1.4)),
  xpPerKill: n => 1.5 * Math.pow(2.8, n - 1),
  petBase: n => 5 * Math.pow(1.9, n - 1),
  rebirthCoinMult: r => Math.pow(1.10, r),
  rebirthPowerMult: r => Math.pow(1.05, r),
  levelPower: l => 1 + 0.02 * (l - 1), // +2% power per pet level (1–100)
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'secret'];
const RARITIES = {
  common:    { name: 'Common',    color: '#a9b1bf', mult: 1,   weight: 60 },
  uncommon:  { name: 'Uncommon',  color: '#4fd26b', mult: 2,   weight: 25 },
  rare:      { name: 'Rare',      color: '#3d9bff', mult: 5,   weight: 10 },
  epic:      { name: 'Epic',      color: '#a55cff', mult: 15,  weight: 4 },
  legendary: { name: 'Legendary', color: '#ff9a1f', mult: 50,  weight: 0.9 },
  secret:    { name: 'Secret',    color: '#ff3b4e', mult: 150, weight: 0.1 },
};

// Rolled independently of rarity on every hatch.
const VARIANTS = [
  { id: 'normal',  name: '',        mult: 1,   chance: 0,      tint: '' },
  { id: 'shiny',   name: 'Shiny',   mult: 5,   chance: 0.02,   tint: '' },
  { id: 'golden',  name: 'Golden',  mult: 20,  chance: 0.003,  tint: 'gold' },
  { id: 'rainbow', name: 'Rainbow', mult: 100, chance: 0.0002, tint: 'rainbow' },
];
// Better odds when paying gems to reroll a pet's mutation.
const REROLL_CHANCES = [0, 0.15, 0.03, 0.003];

// Zone 0 is the hub. Pets are listed in rarity order; the optional third field is a passive ability.
const ZONES = [
  {
    name: 'Hub', hub: true, ground: '#d8cdb4', ground2: '#cfc3a8', edge: '#8c7f62', ambient: null,
    deco: ['🌳', '🌷', '🌼', '🪴', '🌳'], egg: 'Starter Egg', eggColor: '#fff6e0', eggSpots: '#ffb86b',
    pets: [['Puppy', '🐶'], ['Kitten', '🐱'], ['Chick', '🐥']],
  },
  {
    name: 'Meadow', level: 0, ground: '#86d160', ground2: '#7bc656', edge: '#4f8f36', ambient: 'petal', accent: '#63cf5c',
    deco: ['🌳', '🌷', '🌼', '🌳', '🪨', '🌻'], egg: 'Meadow Egg', eggColor: '#e9ffd6', eggSpots: '#7cc95a',
    pets: [['Mouse', '🐭'], ['Hamster', '🐹'], ['Fox', '🦊'], ['Deer', '🦌'],
           ['Owl', '🦉', { coins: 0.1 }], ['Clover Bunny', '🐇', { gems: 0.1 }]],
  },
  {
    name: 'Desert', level: 5, altCoins: 10000, ground: '#e9b86a', ground2: '#e0ad5e', edge: '#b57d34', ambient: 'sand', accent: '#e0a040',
    deco: ['🌵', '🌵', '🪨', '🦴', '🌵'], egg: 'Desert Egg', eggColor: '#ffcf70', eggSpots: '#c9772b',
    pets: [['Scorpion', '🦂'], ['Camel', '🐫'], ['Snake', '🐍'], ['Lizard', '🦎'],
           ['Lion', '🦁', { coins: 0.1 }], ['Pharaoh Cat', '😼', { power: 0.1 }]],
  },
  {
    name: 'Volcano', level: 12, ground: '#6b433d', ground2: '#613b35', edge: '#3a211d', ambient: 'ember', accent: '#ff6a3d',
    deco: ['🌋', '🔥', '🪨', '💀', '🔥'], egg: 'Volcano Egg', eggColor: '#ff7a3d', eggSpots: '#ffd23d',
    pets: [['Bat', '🦇'], ['Rooster', '🐓'], ['Sauropod', '🦕'], ['T-Rex', '🦖'],
           ['Dragon', '🐉', { xp: 0.15 }], ['Phoenix', '🦅', { gems: 0.1 }]],
  },
  {
    name: 'Frost', level: 20, ground: '#e8f3fb', ground2: '#dbeaf5', edge: '#a9c6dc', ambient: 'snow', accent: '#8fd3ff',
    deco: ['🌲', '⛄', '❄️', '🧊', '🌲'], egg: 'Frost Egg', eggColor: '#bfe6ff', eggSpots: '#ffffff',
    pets: [['Penguin', '🐧'], ['Seal', '🦭'], ['Wolf', '🐺'], ['Mammoth', '🦣'],
           ['Yeti', '🦍', { coins: 0.1 }], ['Frost Swan', '🦢', { power: 0.1 }]],
  },
  {
    name: 'Jungle', level: 30, ground: '#3f9a4e', ground2: '#398d47', edge: '#1f5a2a', ambient: 'leaf', accent: '#9be15d',
    deco: ['🌴', '🌿', '🍃', '🌴', '🪵'], egg: 'Jungle Egg', eggColor: '#7fd67a', eggSpots: '#2f7d3a',
    pets: [['Frog', '🐸'], ['Parrot', '🦜'], ['Monkey', '🐵'], ['Tiger', '🐯'],
           ['Elephant', '🐘', { xp: 0.15 }], ['Ancient Sloth', '🦥', { coins: 0.15 }]],
  },
  {
    name: 'Candy Kingdom', level: 42, ground: '#ffc4e1', ground2: '#ffb8da', edge: '#e58cb9', ambient: 'sparkle', accent: '#ff7ac8',
    deco: ['🍭', '🍬', '🧁', '🍩', '🍰'], egg: 'Candy Egg', eggColor: '#ff9ad5', eggSpots: '#9ae6ff',
    pets: [['Pig', '🐷'], ['Bee', '🐝'], ['Panda', '🐼'], ['Koala', '🐨'],
           ['Unicorn', '🦄', { gems: 0.1 }], ['Cotton Candy Cat', '😸', { power: 0.15 }]],
  },
  {
    name: 'Crystal Caves', level: 56, ground: '#4a3f6b', ground2: '#443962', edge: '#262040', ambient: 'sparkle', accent: '#b48cff',
    deco: ['💎', '🪨', '🔮', '🪨', '💎'], egg: 'Crystal Egg', eggColor: '#c9b3ff', eggSpots: '#6ff0ff',
    pets: [['Snail', '🐌'], ['Beetle', '🪲'], ['Octopus', '🐙'], ['Squid', '🦑'],
           ['Crystal Shark', '🦈', { coins: 0.15 }], ['Prism Dragon', '🐲', { gems: 0.15 }]],
  },
  {
    name: 'Starfall', level: 72, final: true, ground: '#262a4f', ground2: '#2d3260', edge: '#12142b', ambient: 'star', accent: '#6f7bff',
    deco: ['⭐', '🪐', '🌙', '☄️', '🛸', '⭐'], egg: 'Starfall Egg', eggColor: '#b57bff', eggSpots: '#ffffff',
    // The final egg is Rare/Legendary-heavy.
    weights: { common: 40, uncommon: 28, rare: 18, epic: 10, legendary: 3.5, secret: 0.5 },
    pets: [['Alien', '👽'], ['Robot', '🤖'], ['Ghost', '👻'], ['Invader', '👾'],
           ['Star', '🌟', { power: 0.15 }], ['Galaxy Cat', '😺', { coins: 0.2 }]],
  },
];

// ---------- Derived tables ----------
const PETS = {};
ZONES.forEach((z, zi) => {
  z.index = zi;
  z.eggCost = zi === 0 ? 0 : F.eggCost(zi);
  z.gateCost = zi <= 1 ? 0 : F.gateCost(zi);
  z.petIds = z.pets.map(([name, emoji, ability], i) => {
    const id = `z${zi}_${i}`;
    const rarity = RARITY_ORDER[i];
    const base = zi === 0 ? F.petBase(1) * 0.7 : F.petBase(zi);
    PETS[id] = {
      id, name, emoji, rarity, zone: zi, ability: ability || null,
      basePower: base * RARITIES[rarity].mult,
    };
    return id;
  });
});
const LAST_ZONE = ZONES.length - 1;

const ABILITY_TEXT = {
  coins: v => `+${Math.round(v * 100)}% coins`,
  gems: v => `+${Math.round(v * 100)}% gem find`,
  xp: v => `+${Math.round(v * 100)}% XP`,
  power: v => `+${Math.round(v * 100)}% team power`,
};

// ---------- Breakables ----------
// hp / coins / xp are multiples of the zone's base values. gems = [min, max] guaranteed gem drop.
const BREAKABLES = {
  pile:    { name: 'Coin Pile', hp: 1,  coins: 1,   xp: 1,   r: 24, weight: 60 },
  crate:   { name: 'Crate',     hp: 3,  coins: 3.5, xp: 2.5, r: 28, weight: 24 },
  present: { name: 'Present',   hp: 6,  coins: 7,   xp: 4,   r: 28, weight: 9 },
  safe:    { name: 'Safe',      hp: 15, coins: 18,  xp: 8,   r: 30, weight: 4.2 },
  gems:    { name: 'Gem Pile',  hp: 2,  coins: 0.5, xp: 2,   r: 26, weight: 1.2, gems: [2, 5], sparkle: true },
  geode:   { name: 'Gem Geode', hp: 20, coins: 3,   xp: 10,  r: 38, weight: 0.2, gems: [15, 30], sparkle: true, announce: true },
};
const BREAKABLE_TYPES = Object.keys(BREAKABLES);
const NORMAL_GEM_CHANCE = 0.005; // rare gem drop from any other breakable
const BASE_BREAKABLES_PER_ZONE = 16;

// Each zone's "boss" is a Giant Chest in its arena. It only takes damage while you stand
// in the arena. The first break each rebirth cycle pays gems plus a Rare+ Egg Ticket.
const CHEST = {
  hpMult: 120,
  r: 80,
  arenaR: 200,
  cooldown: 180,
  firstGems: n => 25 * n,
  repeatGems: n => 5 * n,
  repeatCoinPiles: 40,  // later breaks pay this many coin piles' worth of coins
  xpPiles: 30,
  skipCost: n => 10 * n, // gems to skip the respawn timer
};
const chestName = zi => `Giant ${ZONES[zi].name} Chest`;

// ---------- Rebirth ----------
const REBIRTH = {
  requiredZone: r => Math.min(4 + r, LAST_ZONE),
  tokens: (r, unlocked) => 1 + Math.max(0, unlocked - Math.min(4 + r, LAST_ZONE)),
};

// Rebirth Token upgrade tree. Never resets.
const TREE = [
  { id: 'coins', name: 'Coin Mastery', icon: '🪙', desc: '+15% coins', max: 10, cost: l => l + 1, fx: l => `+${15 * l}%` },
  { id: 'power', name: 'Pet Mastery', icon: '⚔️', desc: '+10% pet power', max: 10, cost: l => l + 1, fx: l => `+${10 * l}%` },
  { id: 'xp', name: 'Fast Learner', icon: '📘', desc: '+20% XP', max: 5, cost: l => l + 1, fx: l => `+${20 * l}%` },
  { id: 'gems', name: 'Gem Hunter', icon: '💎', desc: '+10% gems', max: 5, cost: l => l + 1, fx: l => `+${10 * l}%` },
  { id: 'luck', name: 'Lucky Charm', icon: '🍀', desc: '+10% Rare+ hatch odds', max: 5, cost: l => l + 1, fx: l => `+${10 * l}%` },
  { id: 'slots', name: 'Extra Slot', icon: '🐾', desc: '+1 equip slot', max: 2, cost: l => [3, 6][l], fx: l => `+${l}` },
  { id: 'keep', name: 'Loyal Companion', icon: '💞', desc: 'Keep your strongest pets through rebirth', max: 3, cost: l => [2, 4, 6][l], fx: l => `${l} pet${l === 1 ? '' : 's'}` },
  { id: 'headStart', name: 'Head Start', icon: '🚀', desc: 'Start each rebirth with coins', max: 3, cost: l => l + 2, fx: l => `🪙 ${[0, 2000, 20000, 200000][l].toLocaleString()}` },
  { id: 'speed', name: 'Swift Feet', icon: '👟', desc: '+10% walk speed', max: 3, cost: () => 1, fx: l => `+${10 * l}%` },
  { id: 'density', name: 'Crowded Zones', icon: '📦', desc: '+3 breakables per zone', max: 3, cost: l => l + 2, fx: l => `${BASE_BREAKABLES_PER_ZONE + 3 * l} per zone` },
  { id: 'hatchSpeed', name: 'Quick Hatch', icon: '⏩', desc: 'Hatch animation plays twice as fast', max: 1, cost: () => 2, fx: l => (l ? '2x' : '1x') },
  { id: 'autoHatch', name: 'Auto Hatch', icon: '♻️', desc: 'Keep hatching while you stand at an egg stall', max: 1, cost: () => 3, fx: l => (l ? 'Owned' : 'Locked') },
];
const HEAD_START = [0, 2000, 20000, 200000];

// ---------- Boosts (from rewards and codes) ----------
const BOOSTS = {
  coins: { name: '2x Coins', icon: '🪙', mult: 2, color: '#ffd23f' },
  power: { name: '2x Power', icon: '⚔️', mult: 2, color: '#ff7a7a' },
  luck:  { name: '2x Luck',  icon: '🍀', mult: 2, color: '#6ee07a' },
};

// ---------- Retention: login streak, codes, achievements ----------
const LOGIN_REWARDS = [
  { icon: '💎', label: '50 Gems', gems: 50 },
  { icon: '💰', label: 'Coin Bag', coinEggs: 5 },
  { icon: '🪙', label: '2x Coins · 15 min', boost: ['coins', 900] },
  { icon: '💎', label: '100 Gems', gems: 100 },
  { icon: '🎟️', label: 'Rare+ Egg Ticket', ticket: 'rare' },
  { icon: '⚔️', label: '2x Power · 15 min', boost: ['power', 900] },
  { icon: '👑', label: '250 Gems + Epic+ Ticket', gems: 250, ticket: 'epic' },
];

// Promo codes. Each can be redeemed once per save.
const CODES = {
  LAUNCH2026: { label: '100 Gems', gems: 100 },
  PETSIM:     { label: 'Rare+ Egg Ticket', ticket: 'rare' },
  ASTRA:      { label: '2x Coins for 30 minutes', boost: ['coins', 1800] },
  LUCKY:      { label: '2x Luck for 15 minutes', boost: ['luck', 900] },
};

const ownsRarity = r => Object.keys(state.discovered).some(id => PETS[id] && PETS[id].rarity === r);
const ownsVariant = v => !!(state.variantsSeen && state.variantsSeen[v]);

const ACHIEVEMENTS = [
  { id: 'hatch1', icon: '🥚', name: 'First Hatch', desc: 'Hatch your first egg', gems: 10, check: () => state.stats.hatched >= 1 },
  { id: 'hatch100', icon: '🐣', name: 'Egg Addict', desc: 'Hatch 100 eggs', gems: 50, check: () => state.stats.hatched >= 100 },
  { id: 'hatch1000', icon: '🧺', name: 'Egg Tycoon', desc: 'Hatch 1,000 eggs', gems: 200, check: () => state.stats.hatched >= 1000 },
  { id: 'kill100', icon: '🔨', name: 'Smasher', desc: 'Break 100 coin piles, crates and more', gems: 20, check: () => state.stats.kills >= 100 },
  { id: 'kill1000', icon: '⛏️', name: 'Demolisher', desc: 'Break 1,000 things', gems: 75, check: () => state.stats.kills >= 1000 },
  { id: 'kill10000', icon: '💥', name: 'Wrecking Ball', desc: 'Break 10,000 things', gems: 300, check: () => state.stats.kills >= 10000 },
  ...ZONES.slice(2).map(z => ({
    id: 'zone' + z.index, icon: '🗺️', name: `Reach ${z.name}`, desc: `Unlock zone ${z.index}: ${z.name}`,
    gems: 20 * z.index, check: () => state.stats.maxZone >= z.index,
  })),
  { id: 'boss1', icon: '👑', name: 'Chest Cracker', desc: 'Break a Giant Chest', gems: 25, check: () => state.stats.bosses >= 1 },
  { id: 'bossAll', icon: '🏆', name: 'Treasure King', desc: 'Break every zone\'s Giant Chest at least once', gems: 300,
    check: () => ZONES.slice(1).every(z => state.stats.bossesEver[z.index]) },
  { id: 'legendary', icon: '🟧', name: 'Legendary!', desc: 'Own a Legendary pet', gems: 50, check: () => ownsRarity('legendary') },
  { id: 'secret', icon: '🟥', name: 'Top Secret', desc: 'Own a Secret pet', gems: 250, check: () => ownsRarity('secret') },
  { id: 'shiny', icon: '✨', name: 'Sparkly', desc: 'Own a Shiny pet', gems: 25, check: () => ownsVariant('shiny') },
  { id: 'golden', icon: '🥇', name: 'Midas Touch', desc: 'Own a Golden pet', gems: 100, check: () => ownsVariant('golden') },
  { id: 'rainbow', icon: '🌈', name: 'Over the Rainbow', desc: 'Own a Rainbow pet', gems: 500, check: () => ownsVariant('rainbow') },
  { id: 'level10', icon: '📈', name: 'Rising Star', desc: 'Reach player level 10', gems: 30, check: () => state.stats.maxLevel >= 10 },
  { id: 'level25', icon: '📊', name: 'Veteran', desc: 'Reach player level 25', gems: 100, check: () => state.stats.maxLevel >= 25 },
  { id: 'level50', icon: '🎖️', name: 'Master Trainer', desc: 'Reach player level 50', gems: 300, check: () => state.stats.maxLevel >= 50 },
  { id: 'rebirth1', icon: '🌀', name: 'Born Again', desc: 'Rebirth once', gems: 50, check: () => state.rebirths >= 1 },
  { id: 'rebirth5', icon: '🌀', name: 'Cycle Rider', desc: 'Rebirth 5 times', gems: 150, check: () => state.rebirths >= 5 },
  { id: 'rebirth10', icon: '🌀', name: 'Eternal', desc: 'Rebirth 10 times', gems: 400, check: () => state.rebirths >= 10 },
  { id: 'index50', icon: '📖', name: 'Collector', desc: 'Fill half the Pet Index', gems: 100,
    check: () => Object.keys(state.discovered).length >= Object.keys(PETS).length / 2 },
];
