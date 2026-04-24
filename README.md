# Royal Board Games (Local 2-Player)

A browser board-games project built with plain HTML, CSS, and JavaScript.

## Owner

Taha Ilter Akar

## Student Project Note

This is a humble student project made for learning and experimentation.  
It is intentionally ambitious in style and features, and still evolving.

If something feels rough, that is expected and part of the learning process.

## Current Features

- Landing game chooser (Chess, Backgammon, Blackjack)
- Local 2-player chess on one device
- Local 2-player backgammon with core standard rules (dice, bar entry, hits, bearing off, doubles)
- Local Blackjack mode with dedicated engine/UI modules
- Backgammon match scoring (single/gammon/backgammon), doubling cube flow, and dice-roll animation
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

```text
.
├── index.html
├── styles/
│   └── main.css
├── js/
│   ├── app.js
│   ├── constants.js
│   ├── chess-engine.js
│   ├── ui.js
│   ├── evaluation.js
│   ├── tactical-eval.js
│   ├── sound.js
│   ├── backgammon-engine.js
│   ├── backgammon-ui.js
│   ├── blackjack-engine.js
│   ├── blackjack-ui.js
│   ├── engine/
│   │   └── evaluator.js
│   ├── persistence/
│   │   └── game-storage.js
│   ├── state/
│   │   └── store.js
│   ├── systems/
│   │   ├── event-bus.js
│   │   └── progression-system.js
│   ├── training/
│   │   └── training-system.js
│   ├── ui/
│   │   ├── board-renderer.js
│   │   ├── chess-clock.js
│   │   ├── chess-history.js
│   │   ├── dice-animator.js
│   │   ├── game-feel.js
│   │   ├── move-manager.js
│   │   └── piece-animator.js
│   └── tests/
│       ├── engine-tests.js
│       ├── backgammon-tests.js
│       └── ui-state-tests.js
└── docs/
    ├── ARCHITECTURE.md
    ├── EPIC_GAME_ROADMAP.md
    ├── PRODUCT_SCOPE.md
    └── ROADMAP_BOARD.md
```

- `index.html` - main page shell and game chooser
- `styles/main.css` - shared visual styling
- `js/app.js` - application bootstrap and game wiring
- `js/constants.js` - shared constants/state enums
- `js/chess-engine.js` - chess rules and move legality
- `js/ui.js` - chess interaction and rendering layer
- `js/backgammon-engine.js` - backgammon rules, cube, scoring, and cheat dice logic
- `js/backgammon-ui.js` - backgammon rendering, drag/click interactions, HUD, and dice integration
- `js/blackjack-engine.js` - blackjack game rules/round logic
- `js/blackjack-ui.js` - blackjack UI flow and interactions
- `js/ui/dice-animator.js` - animated 3D dice component for backgammon
- `js/ui/move-manager.js` - validated move-path manager for backgammon
- `js/ui/game-feel.js` - shared toast/victory/game-feel helpers
- `js/ui/board-renderer.js` - board rendering helpers
- `js/ui/piece-animator.js` - chess piece animation helpers
- `js/ui/chess-clock.js` - chess timer helpers
- `js/ui/chess-history.js` - chess history timeline helpers
- `js/engine/evaluator.js` - evaluator adapter and fallback heuristic layer
- `js/evaluation.js` - heuristic scoring implementation
- `js/tactical-eval.js` - tactical signal helpers
- `js/sound.js` - Web Audio synthesis and DSP
- `js/training/training-system.js` - training content and mode helpers
- `js/persistence/game-storage.js` - local finished/ongoing game persistence
- `js/state/store.js` - central layered state store/reducers
- `js/systems/event-bus.js` - lightweight event bus
- `js/systems/progression-system.js` - persistent progression/profile system
- `js/tests/engine-tests.js` - chess engine regression tests
- `js/tests/backgammon-tests.js` - backgammon rule regression tests
- `js/tests/ui-state-tests.js` - UI/store transition tests
- `docs/ARCHITECTURE.md` - project architecture direction
- `docs/EPIC_GAME_ROADMAP.md` - long-term expansion roadmap
- `docs/PRODUCT_SCOPE.md` - v1 scope freeze and boundaries
- `docs/ROADMAP_BOARD.md` - issue/roadmap board structure

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

Designed and developed as a student learning project by Taha Ilter Akar.

## License

This project is licensed under the MIT License.  
Copyright (c) 2026 Taha Ilter Akar.

## Project Docs

- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `LICENSE`
- `docs/ROADMAP_BOARD.md`
