# Pet Sim Astra

A browser pet-collecting incremental game inspired by *Pet Simulator 99*. It follows the design spec *Pet Simulator Game: Design & Build Spec*, adapted from Roblox to the web. It's plain HTML, CSS and JavaScript, with no build step and no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Progress autosaves to `localStorage`.

## The loop

1. Start in the **Hub** with a starter Puppy. The **Starter Egg** there is free every 20 seconds.
2. Walk into **Meadow**. Your pets attack the nearest coin pile, crate, present or safe on their own. **Auto Farm** walks you to the next one.
3. Breaking things gives **coins**, **XP** and rarely **gems**. Cyan **Gem Piles** and rare **Gem Geodes** drop gems every time.
4. Spend coins at each zone's **egg stall**, with x1 or x10 hatches and full odds shown. **Lucky Eggs** cost gems and have 4x Rare+ odds.
5. Reach the level shown on the next gate, pay its coin fee, and move on. There are 8 zones after the Hub: Meadow, Desert, Volcano, Frost, Jungle, Candy Kingdom, Crystal Caves and Starfall.
6. Each zone's **Giant Chest** only takes damage while you stand in its ring. The first break each cycle pays gems and a Rare+ Egg Ticket.
7. **Rebirth** once you reach the required zone. It resets coins, gems, pets, level and zones, but gives Rebirth Tokens and a permanent multiplier (1.10^r coins, 1.05^r power).

## Systems (per the spec)

- **Rarities:** Common 60%, Uncommon 25%, Rare 10%, Epic 4%, Legendary 0.9%, Secret 0.1%. Their power is 1x, 2x, 5x, 15x, 50x and 150x.
- **Mutations:** rolled on every hatch. Shiny 2% (5x), Golden 0.3% (20x), Rainbow 0.02% (100x). You can reroll a mutation with gems, and it never gets worse.
- **Pet levels:** levels 1–100, +2% power each. Train with coins, or feed 5 duplicates of the same rarity and mutation. **Fuse** 3 pets of one rarity into a guaranteed pet of the next rarity. Legendary and Secret pets have passive **abilities**.
- **Equip slots:** 3 to start, +1 at levels 10, 20 and 30, and +2 more from the Token Tree.
- **Player level:** XP needed is `100 × level^1.4`. Level-ups give coins, and gems every 5 levels.
- **Token Tree:** 12 permanent upgrades, including coin and power mastery, extra slots, keeping pets through rebirth, auto hatch and quick hatch.
- **Retention:** 3 daily quests, a weekly quest, a 7-day login streak, achievements with a badge screen, and Pet Index completion rewards. The Index is never wiped and pays +1% coins per finished egg.
- **Codes:** redeem in Settings. Try `LAUNCH2026`, `PETSIM`, `ASTRA` or `LUCKY`.
- **Settings:** music and sound volume, performance mode, damage numbers, screen shake.
- **Dev panel:** the 🛠️ button in the top right, or the `` ` `` key. It gives currency, pets, levels and tokens, unlocks zones, and has cheats for testing.

Robux monetization, trading, clans and global leaderboards need Roblox servers, so they aren't included in this single-player web version.

## Balancing

All numbers are in `js/data.js`, next to the spec's formulas. A simulated player gets:
- a new pet about every minute early on
- a new zone every 10–15 minutes
- a first rebirth at about 25 minutes (a human player takes longer)

## Controls

| Action | Input |
| --- | --- |
| Move | WASD / arrow keys, or tap the ground |
| Focus a target | Click or tap it |
| Egg stall, gate, skip chest timer | `E` or the orange button |
| Pets / Quests / Index / Rebirth | `P` / `Q` / `I` / `R` |
| Auto Farm | `F` |
| Close | `Esc` |

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Zones, pets, rarities, breakables, formulas, Token Tree, rewards |
| `js/state.js` | Save data and all game rules: pets, fusion, eggs, levels, rebirth, quests, codes, Index |
| `js/audio.js` | Synthesized sound effects and music |
| `js/ui.js` | HUD and every menu |
| `js/game.js` | World simulation, pet combat, rendering, input, main loop |
| `js/dev.js` | Dev panel |
| `js/util.js` | Number formatting, random helpers, emoji sprites |
