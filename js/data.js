'use strict';

// Every zone is ZSCALE times richer (and tougher) than the one before it.
const ZSCALE = 6;
const ZW = 1600; // zone width in world px
const ZH = 1100; // zone height in world px
const MAX_PETS = 300;

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical', 'huge'];
const RARITIES = {
  common:    { name: 'Common',    color: '#b4bccb', mult: 1 },
  uncommon:  { name: 'Uncommon',  color: '#5fd35f', mult: 1.6 },
  rare:      { name: 'Rare',      color: '#3fa9ff', mult: 2.6 },
  epic:      { name: 'Epic',      color: '#b45cff', mult: 4.5 },
  legendary: { name: 'Legendary', color: '#ffb020', mult: 9 },
  mythical:  { name: 'Mythical',  color: '#ff4f7b', mult: 22 },
  huge:      { name: 'Huge',      color: '#ff3df2', mult: 80 },
};

const VARIANTS = [
  { name: '',        mult: 1 },
  { name: 'Golden',  mult: 2.5 },
  { name: 'Rainbow', mult: 6.5 },
];
const CRAFT_COST = 5; // pets of the same kind needed to upgrade a variant

const DEFAULT_WEIGHTS = { common: 50, uncommon: 30, rare: 14, epic: 5, legendary: 0.75, mythical: 0.2, huge: 0.05 };

const ZONES = [
  {
    name: 'Spawn', ground: '#86d160', ground2: '#7bc656', edge: '#4f8f36',
    deco: ['🌳', '🌷', '🌼', '🌳', '🪨', '🌻'], egg: 'Spawn Egg', eggColor: '#fff3d6', eggSpots: '#f4c46b',
    pets: [['Dog', '🐶', 'common'], ['Cat', '🐱', 'uncommon'], ['Bunny', '🐰', 'rare'],
           ['Hamster', '🐹', 'epic'], ['Fox', '🦊', 'legendary'], ['Huge Dog', '🐶', 'huge']],
  },
  {
    name: 'Forest', ground: '#4fa04a', ground2: '#479443', edge: '#2c6a2a',
    deco: ['🌲', '🌲', '🍄', '🌿', '🪵', '🌲'], egg: 'Forest Egg', eggColor: '#a8e07a', eggSpots: '#4f8a33',
    pets: [['Mouse', '🐭', 'common'], ['Hedgehog', '🦔', 'uncommon'], ['Raccoon', '🦝', 'rare'],
           ['Owl', '🦉', 'epic'], ['Deer', '🦌', 'legendary'], ['Huge Bear', '🐻', 'huge']],
  },
  {
    name: 'Beach', ground: '#f2dc9b', ground2: '#ecd38c', edge: '#c9a95a',
    deco: ['🌴', '🐚', '🌴', '🪸', '⛱️'], egg: 'Beach Egg', eggColor: '#8fd8ff', eggSpots: '#ffffff',
    pets: [['Crab', '🦀', 'common'], ['Turtle', '🐢', 'uncommon'], ['Tropical Fish', '🐠', 'rare'],
           ['Dolphin', '🐬', 'epic'], ['Octopus', '🐙', 'legendary'], ['Huge Shark', '🦈', 'huge']],
  },
  {
    name: 'Desert', ground: '#e9b86a', ground2: '#e0ad5e', edge: '#b57d34',
    deco: ['🌵', '🌵', '🪨', '🦴', '🏜️'], egg: 'Desert Egg', eggColor: '#ffcf70', eggSpots: '#c9772b',
    pets: [['Scorpion', '🦂', 'common'], ['Camel', '🐫', 'uncommon'], ['Snake', '🐍', 'rare'],
           ['Lizard', '🦎', 'epic'], ['Lion', '🦁', 'legendary'], ['Pharaoh Cat', '😼', 'mythical'],
           ['Huge Lion', '🦁', 'huge']],
  },
  {
    name: 'Tundra', ground: '#e8f3fb', ground2: '#dbeaf5', edge: '#a9c6dc',
    deco: ['🌲', '⛄', '❄️', '🧊', '🌲'], egg: 'Frost Egg', eggColor: '#bfe6ff', eggSpots: '#ffffff',
    pets: [['Penguin', '🐧', 'common'], ['Seal', '🦭', 'uncommon'], ['Wolf', '🐺', 'rare'],
           ['Mammoth', '🦣', 'epic'], ['Yeti', '🦍', 'legendary'], ['Frost Swan', '🦢', 'mythical'],
           ['Huge Penguin', '🐧', 'huge']],
  },
  {
    name: 'Volcano', ground: '#6b433d', ground2: '#613b35', edge: '#3a211d',
    deco: ['🌋', '🔥', '🪨', '💀', '🔥'], egg: 'Magma Egg', eggColor: '#ff7a3d', eggSpots: '#ffd23d',
    pets: [['Bat', '🦇', 'common'], ['Rooster', '🐓', 'uncommon'], ['Sauropod', '🦕', 'rare'],
           ['T-Rex', '🦖', 'epic'], ['Dragon', '🐉', 'legendary'], ['Phoenix', '🦅', 'mythical'],
           ['Huge Dragon', '🐲', 'huge']],
  },
  {
    name: 'Candyland', ground: '#ffc4e1', ground2: '#ffb8da', edge: '#e58cb9',
    deco: ['🍭', '🍬', '🧁', '🍩', '🍰'], egg: 'Candy Egg', eggColor: '#ff9ad5', eggSpots: '#9ae6ff',
    pets: [['Pig', '🐷', 'common'], ['Monkey', '🐵', 'uncommon'], ['Panda', '🐼', 'rare'],
           ['Koala', '🐨', 'epic'], ['Unicorn', '🦄', 'legendary'], ['Sugar Bee', '🐝', 'mythical'],
           ['Huge Unicorn', '🦄', 'huge']],
  },
  {
    name: 'Space', ground: '#262a4f', ground2: '#2d3260', edge: '#12142b',
    deco: ['⭐', '🪐', '🌙', '☄️', '🛸', '⭐'], egg: 'Cosmic Egg', eggColor: '#b57bff', eggSpots: '#ffffff',
    pets: [['Alien', '👽', 'common'], ['Robot', '🤖', 'uncommon'], ['Ghost', '👻', 'rare'],
           ['Invader', '👾', 'epic'], ['Star', '🌟', 'legendary'], ['Galaxy Cat', '😺', 'mythical'],
           ['Huge Alien', '👽', 'huge']],
  },
];

// ---------- Derived tables ----------
const PETS = {};
ZONES.forEach((z, zi) => {
  const scale = Math.pow(ZSCALE, zi);
  z.index = zi;
  z.eggCost = Math.round(100 * scale);
  z.gateCost = zi === 0 ? 0 : Math.round(1500 * Math.pow(ZSCALE, zi - 1));
  z.hpBase = 12 * scale;
  z.valueBase = 5 * scale;
  const hasMythical = z.pets.some(p => p[2] === 'mythical');
  z.petIds = z.pets.map(([name, emoji, rarity], i) => {
    const id = `z${zi}_${i}`;
    let weight = DEFAULT_WEIGHTS[rarity];
    if (rarity === 'legendary' && !hasMythical) weight += DEFAULT_WEIGHTS.mythical;
    PETS[id] = {
      id, name, emoji, rarity, zone: zi, weight,
      basePower: 3 * scale * RARITIES[rarity].mult,
    };
    return id;
  });
});

const BREAKABLES = {
  pile:    { hp: 1,   value: 1,   r: 24, weight: 60, orbs: 3,  gem: [0.02, 1, 1] },
  crate:   { hp: 4,   value: 5,   r: 28, weight: 25, orbs: 5,  gem: [0.05, 1, 1] },
  present: { hp: 10,  value: 13,  r: 28, weight: 10, orbs: 6,  gem: [0.15, 1, 2] },
  safe:    { hp: 30,  value: 42,  r: 30, weight: 5,  orbs: 8,  gem: [0.4, 1, 3] },
  chest:   { hp: 120, value: 250, r: 62, weight: 0,  orbs: 20, gem: [1, 12, 22] },
};
const BREAKABLE_SPAWN = Object.keys(BREAKABLES).filter(k => BREAKABLES[k].weight > 0);
const CHEST_RESPAWN = 60;
const MAX_BREAKABLES_PER_ZONE = 22;

// ---------- Diamond shop ----------
const UPGRADES = [
  { id: 'damage', name: 'Pet Damage', icon: '⚔️', desc: '+25% pet damage per level', max: 25,
    cost: l => Math.floor(6 * Math.pow(1.45, l)) },
  { id: 'coins', name: 'Coin Bonus', icon: '🪙', desc: '+20% coins per level', max: 25,
    cost: l => Math.floor(6 * Math.pow(1.45, l)) },
  { id: 'slots', name: 'Pet Slots', icon: '🐾', desc: '+1 pet equipped at once', max: 8,
    cost: l => Math.floor(20 * Math.pow(2, l)) },
  { id: 'luck', name: 'Luck', icon: '🍀', desc: '+15% chance for Rare+ pets', max: 15,
    cost: l => Math.floor(15 * Math.pow(1.6, l)) },
  { id: 'hatch', name: 'Multi Hatch', icon: '🥚', desc: 'Hatch more eggs at once (1 → 3 → 8)', max: 2,
    cost: l => [40, 400][l] },
  { id: 'speed', name: 'Walk Speed', icon: '👟', desc: '+8% walk speed per level', max: 10,
    cost: l => Math.floor(5 * Math.pow(1.5, l)) },
  { id: 'magnet', name: 'Magnet', icon: '🧲', desc: 'Pick up coins from further away', max: 10,
    cost: l => Math.floor(5 * Math.pow(1.5, l)) },
  { id: 'autofarm', name: 'Auto Farm', icon: '🤖', desc: 'Pets automatically attack nearby breakables', max: 1,
    cost: () => 15 },
  { id: 'autohatch', name: 'Auto Hatch', icon: '♻️', desc: 'Keep hatching while standing at an egg', max: 1,
    cost: () => 60 },
];
