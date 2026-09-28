# Pet Sim Astra

A browser pet-collecting simulator inspired by *Pet Simulator 99*. It's plain HTML, CSS and JavaScript: no build step and no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Progress saves automatically to `localStorage` every 10 seconds and when you close the tab.

## Features

- **8 zones:** Spawn, Forest, Beach, Desert, Tundra, Volcano, Candyland and Space. Each zone is unlocked with coins at a gate and is 6× richer than the one before it.
- **Breakables:** coin piles, crates, presents, safes and a big respawning chest in every zone. They drop coins and 💎 diamonds.
- **Pets:** 52 pets across Common → Uncommon → Rare → Epic → Legendary → Mythical → **Huge**. Equipped pets follow you and attack whatever you click.
- **Eggs:** one per zone, with visible odds, a hatch animation, multi-hatch (1/3/8) and auto-hatch.
- **Crafting:** combine 5 of the same pet into a **Golden** pet, and 5 Goldens into a **Rainbow** pet.
- **Diamond upgrades:** pet damage, coin bonus, extra pet slots, luck, multi-hatch, walk speed, magnet, auto farm and auto hatch.
- **Pet Index:** a collection log, plus stats and settings.
- **Controls:** keyboard, mouse and touch.

## Controls

| Action | Input |
| --- | --- |
| Move | WASD / arrow keys, or click/tap the ground (hold to steer) |
| Attack | Click a breakable to send your pets |
| Open egg / unlock gate | `E` or the on-screen button |
| Pets / Upgrades | `P` / `U` |
| Toggle auto farm | `F` |
| Close menus | `Esc` |

## Code layout

| File | Purpose |
| --- | --- |
| `js/util.js` | Number formatting, random helpers, cached emoji sprites |
| `js/data.js` | Zones, pets, rarities, breakables, upgrades (all balance numbers) |
| `js/state.js` | Save data, derived stats, pet inventory, egg odds |
| `js/ui.js` | HUD, menus, hatch animation |
| `js/game.js` | World simulation, rendering, input, main loop |
