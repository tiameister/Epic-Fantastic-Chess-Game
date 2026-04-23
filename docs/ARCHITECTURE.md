# Architecture Foundation

## Current Modules

- `js/chess-engine.js` - game rules and legal moves
- `js/ui.js` - rendering and interaction orchestration
- `js/sound.js` - procedural audio engine
- `js/evaluation.js` - evaluation heuristics for game feedback

## Target Modular Architecture

- `engine/`
  - move generation
  - position evaluation
  - game state transitions
- `ui/`
  - board renderer
  - HUD/status components
  - VFX layer
- `audio/`
  - synthesis primitives
  - mood/DSP controller
  - event-driven sound cues
- `systems/`
  - progression
  - quests/achievements
  - save/load profile
- `content/`
  - themes/skins
  - campaigns
  - challenge definitions

## Next Engineering Steps

1. Introduce an event bus for decoupled communication.
2. Move transient UI state and persistent game state into dedicated stores.
3. Add deterministic test cases for castling, en passant, promotion, checkmate.
4. Define JSON schemas for content packs and scenarios.
5. Add telemetry hooks for balancing move-quality thresholds and sound intensity.
