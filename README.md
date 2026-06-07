# Mensch ärgere dich nicht 🎲

A mobile-optimized, browser-based version of the classic German board game
*Mensch ärgere dich nicht* (similar to Ludo / Trouble). Pure HTML, CSS and
vanilla JavaScript — no build step, no dependencies.

## Play

Open `index.html` in any modern browser (works great on phones — just open the
file or host it statically).

On the start screen, set each colour to **Mensch** (human), **Computer** (AI)
or **Aus** (off). You need at least two players.

## Rules implemented

- Roll a **6** to move a piece out of your base onto your start field.
- Rolling a **6** earns another roll.
- Move clockwise around the 40-field track and into your colour's home stretch.
- Landing on an opponent sends their piece back to its base.
- You can't land on your own piece, and you can't overshoot the home stretch.
- If all your pieces are in the base, you get up to **3 rolls** to get a 6.
- First player to get all **4 pieces** into the home stretch wins.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, board container, overlays |
| `style.css` | Responsive mobile-first styling, animations |
| `game.js` | Board model, rules, rendering and a simple AI |

## Tech notes

- The board is an 11×11 grid forming the classic cross; the 40 track fields,
  home stretches and bases are positioned with CSS percentages so the whole
  board scales fluidly with screen size.
- Touch-friendly: large tap targets, movable pieces pulse, and a single legal
  move is played automatically to reduce taps.
