# Epic Fantasy Chess Roadmap

## Vision

Turn the current local chess app into a full "Fantasy Battle Chess" game with progression, world-building, and competitive systems.

## Phase 1 - Core Stability (Current)

- Solid local two-player chess engine
- Strong UI themes and game feel (audio/visual feedback)
- Evaluation-based reactions and dramatic effects

## Phase 2 - Meta Systems

- Player profiles and save slots
- XP/level progression
- Unlockable board skins, piece styles, sound packs
- Achievement and quest system
- Match history and post-game analytics

## Phase 3 - Content Expansion

- Story mode: factions, bosses, scripted encounters
- Challenge puzzles and tactical dungeons
- Fantasy modifiers (fog zones, cursed squares, buff runes)
- Lore codex and collectible artifacts

## Phase 4 - Competitive Layer

- Online matchmaking (casual/ranked)
- Seasonal ladder and leagues
- Replay sharing and spectating
- Anti-cheat and fair-play validation

## Phase 5 - Live Game Platform

- Live events and limited-time modes
- Daily quests and rotating scenarios
- Economy/battle pass style progression
- Content pipeline for frequent updates

## Technical Milestones

1. Extract systems into clear domains (`engine`, `ui`, `audio`, `progression`, `content`).
2. Add event bus and state serialization.
3. Migrate to build tooling and test suites.
4. Add CI checks for gameplay invariants and regression tests.
5. Introduce backend services only after local systems are stable.
