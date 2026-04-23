# Royal Chess (Local 2-Player)

A browser chess project built with plain HTML, CSS, and JavaScript.

## Student Project Note

This is a humble student project made for learning and experimentation.  
It is intentionally ambitious in style and features, and still evolving.

If something feels rough, that is expected and part of the learning process.

## Current Features

- Local 2-player chess on one device
- Core chess rules including castling, en passant, and promotion
- Check, checkmate, stalemate, and timeout handling
- Move highlighting, last-move tracking, undo, and move history
- Pause/resume clock, resign, draw offer (local), and rematch actions
- Training scaffolds: opening trainer, puzzle mode with streak, and endgame drills
- Profile 2.0: accuracy trend, best puzzle streak, and JSON export/import
- PGN import/export, saved finished-game index search, and continue-last-game skeleton
- Multiple themes and fantasy-style visual effects
- Web Audio based reactive sound system
- Evaluation bar with tactical signals (including mate-in-1 warnings)
- Progression layer with XP, level, achievements, and quests

## Run Locally

Open `index.html` in a modern browser.

## Run Tests

Run deterministic engine regression checks:

- `npm test`

## Keyboard Shortcuts

- `N` new game
- `U` undo
- `F` flip board
- `Space` pause/resume clock
- `R` resign
- `D` offer draw (local)
- `M` rematch

## Project Structure

- `index.html` - main page shell
- `styles/main.css` - all visual styling
- `js/chess-engine.js` - chess rules and move legality
- `js/engine/evaluator.js` - evaluator adapter and fallback heuristic layer
- `js/training/training-system.js` - training content and mode helpers
- `js/persistence/game-storage.js` - local finished/ongoing game persistence
- `js/ui.js` - interaction and rendering layer
- `js/evaluation.js` - scoring and evaluation logic
- `js/tactical-eval.js` - tactical signal helpers
- `js/state/store.js` - central layered state store/reducers
- `js/sound.js` - Web Audio synthesis and DSP
- `js/tests/engine-tests.js` - perft-style and critical position tests
- `js/tests/ui-state-tests.js` - UI store transition regression tests
- `js/systems/progression-system.js` - persistent meta progression
- `docs/ARCHITECTURE.md` - project architecture direction
- `docs/EPIC_GAME_ROADMAP.md` - long-term expansion roadmap
- `docs/PRODUCT_SCOPE.md` - v1 scope freeze and boundaries

## Roadmap Context

This repository is being prepared as the base for a bigger "epic fantasy chess" game.  
The current target is to keep the code understandable, modular, and easy to extend.

## Screenshots / GIFs

Add preview assets in a `docs/media/` folder (suggested):

- `docs/media/board.png`
- `docs/media/analysis.png`
- `docs/media/training.gif`

Then reference them here with markdown images once captured.

## Known Limitations

- No online multiplayer yet
- Evaluation is lightweight, not full-engine strength
- UI/UX still being iterated as features grow

## Credits

Designed and developed as a student learning project.

## Project Docs

- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `LICENSE`
- `docs/ROADMAP_BOARD.md`
