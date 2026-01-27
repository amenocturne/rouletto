# Rouletto

A casino-style spinning wheel for picking the next retro host. Real-time sync across all devices, Balatro-inspired visuals, no sign-ups required.

## How It Works

1. Someone opens the app and shares the link with the team
2. Everyone joins and enters their name
3. Betting phase: 60 seconds to guess who'll be picked
4. Host spins the wheel
5. Winner revealed with dramatic flair

## Setup

Requires [Bun](https://bun.sh).

```bash
# Install dependencies
bun install

# Run dev server
bun run dev
```

Open `http://localhost:3000` in your browser.

## Production

```bash
# Build and run
bun run build
bun run start
```

Or with Docker:

```bash
docker build -t rouletto .
docker run -p 3000:3000 rouletto
```

## Tech

- Bun (runtime, bundler, server)
- Pixi.js (WebGL rendering)
- WebSocket (real-time sync)
