# Product Scope (Phase 0 Freeze)

## Purpose

This document freezes the v1 product scope so the project grows in a controlled way.

Goal: build a polished local chess platform experience (inspired by chess.com/lichess), **without online multiplayer** in v1.

## v1 Parity Targets

### 1) Game Board + Clocks + Legal Moves

Must-have:

- Fully legal local 2-player chess flow
- Correct move legality, check/checkmate/stalemate/timeout handling
- Clocks with practical local time-control options
- Undo, reset, move history navigation basics

Done criteria:

- Core game can be played start-to-finish reliably
- Illegal move edge cases are blocked consistently

### 2) Strong UX (Premove optional later)

Must-have:

- Clear board highlights (selected square, legal destinations, last move)
- Readable status and game-state messaging
- Clean control layout (primary actions vs advanced settings)
- Optional board orientation controls

Deferred but noted:

- Premoves (candidate for later phase)

Done criteria:

- A new user can play a full match without confusion
- Controls are not visually overloaded

### 3) Analysis Tools (Eval + Move Quality + Review)

Must-have:

- Evaluation bar with meaningful tactical signals
- Move quality labels (good/mistake/blunder style)
- Post-game review foundation (already partially integrated)

Done criteria:

- Eval updates are coherent with game state
- Major tactical shifts are visibly reflected

### 4) Learning Tools (Puzzles/Openings/Drills)

Must-have for v1:

- Structural groundwork only (architecture hooks + roadmap)
- Opening presets and training-ready scaffolding

Not required in v1 release:

- Full puzzle mode
- Full opening trainer
- Full drill engine

Done criteria:

- Codebase has clear extension points and docs for adding these systems

### 5) Profiles / Progression / Statistics

Must-have:

- Persistent local profile (level/xp/matches/win rate)
- Achievement and quest progress tracking
- Basic stat integrity across sessions

Done criteria:

- Reloading browser preserves progress
- Match completion and move events update progression correctly

---

## v1 In Scope

- Local-only chess (same device, two players)
- Rule-correct gameplay with core draw/win/loss handling
- Fantasy UI/audio layer (current style)
- Evaluation + tactical hints
- Progression + achievements + quests
- Project docs and architecture clarity for future phases

## v1 Out of Scope

- Online multiplayer / matchmaking / ranked ladder
- Backend services, auth, cloud save
- Full-strength engine parity with Stockfish-like depth
- Mobile app packaging
- Payment/economy/live-ops systems
- Full campaign/story mode

## Non-Goals (for v1)

- Rebuilding into a framework-based SPA immediately
- Feature parity with complete chess.com/lichess ecosystems
- Performance optimizations beyond practical local smoothness

## Change Control

Any new feature request should be categorized as:

- **Now**: directly supports a v1 parity target
- **Later**: belongs to post-v1 phases
- **Reject**: out of project direction

If a request is “Later,” add it to roadmap docs, not active implementation scope.

## Acceptance Checklist (Phase 0 Complete)

- [x] v1 parity targets defined
- [x] in-scope and out-of-scope listed
- [x] non-goals documented
- [x] change-control rule established
