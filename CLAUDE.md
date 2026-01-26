# Claude Context

## How to Use This Project

**To implement this project**: Read `TASKS.md` which contains the complete task breakdown with all context needed. Execute tasks one at a time, stopping after each for user review.

**Quick start**: "Read TASKS.md and start with Task 1"

---

## Project Overview

Casino wheel app for choosing the next retro host. Single-use, single-session app with real-time sync via WebSocket.

## Tech Stack

- **Runtime**: Bun (server, bundler, test runner, package manager)
- **Server**: `Bun.serve()` with native WebSocket
- **Frontend**: TypeScript + Pixi.js
- **Formatter/Linter**: Biome
- **Deployment**: Docker

## Code Style

- **Functional programming**: No mutable variables, use `const` everywhere, pure functions for state transitions
- **KISS**: No unnecessary abstractions, keep it simple
- **Strong typing**: Use TypeScript strictly, avoid `any`
- **Immutability**: Use spread operator, `readonly` arrays/objects in types

## Project Structure

```
src/
├── server/       # Bun server code
├── client/       # Browser code (bundled by Bun)
└── shared/       # Types shared between server and client
public/           # Static assets (sounds, etc.)
```

## Commands

```bash
bun install       # Install dependencies
bun run dev       # Start dev server
bun run build     # Build for production
bun run start     # Run production build
bun run format    # Format code with Biome
bun run lint      # Lint code with Biome
bun test          # Run tests
```

## Git Conventions

- Minimal commit messages (no co-author tags, no emojis)
- Examples: "add player list", "fix betting logic", "implement wheel spin"

## Key Files

- `PLAN.md` - Original product spec
- `TASKS.md` - Task breakdown with technical details

## Testing

- Use `bun test` for unit tests
- Pure functions (game state) should have unit tests
- UI requires manual testing (see TASKS.md for scenarios)

## Important Notes

- Single session only - no persistence, no database
- First player to join is host
- All state transitions happen through pure functions in `src/shared/` or `src/server/`
- WebSocket broadcasts full state on every change
- Wheel animation is client-side only, server just sends winner ID
