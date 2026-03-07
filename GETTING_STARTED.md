# BalanceIQ — Getting Started

## What you're getting

| File | What it is | Where to put it |
|------|-----------|-----------------|
| `app.jsx` | The complete working React app | Goes into `src/App.jsx` after scaffolding |
| `CLAUDE.md` | Briefing doc for Claude Code — tells it everything about the project | Project root |
| `ROADMAP.md` | Full product roadmap | Project root |

## Prerequisites

Make sure you have these installed on your Mac:

1. **Node.js** (v18+) — check: `node --version`
   - Install: `brew install node` or download from nodejs.org
2. **Claude Code** — already installed

## Setup

Open Terminal and run these commands one at a time:

```bash
mkdir ~/balanceiq
cd ~/balanceiq
```

Move the 3 files you downloaded from this chat into that folder. You can either drag and drop them in Finder, or use Terminal:

```bash
mv ~/Downloads/CLAUDE.md ~/balanceiq/
mv ~/Downloads/ROADMAP.md ~/balanceiq/
mv ~/Downloads/app.jsx ~/balanceiq/
```

Your folder should now have:
```
balanceiq/
├── CLAUDE.md
├── ROADMAP.md
└── app.jsx
```

## Launch Claude Code

```bash
cd ~/balanceiq
claude
```

Claude Code opens in your terminal and automatically reads CLAUDE.md for context.

## First instruction to give Claude Code

Paste this:

```
Read CLAUDE.md and ROADMAP.md to understand this project. Set up a complete
Electron + React project. Migrate app.jsx into the structure. Replace all 
window.storage calls with SQLite using better-sqlite3 via IPC. Update the 
branding: header says "BalanceIQ", icon letters "BIQ" with the orange 
gradient. All UI text stays in French. Make the app launch with npm start.
```

## What happens next

Claude Code will:
1. Create `package.json` with all dependencies
2. Set up Electron main process + preload
3. Scaffold the React entry point
4. Migrate your app.jsx with SQLite storage
5. Apply BalanceIQ branding
6. Run `npm install`
7. Tell you to run `npm start`

## Test the app

```bash
npm start
```

This opens BalanceIQ in a real desktop window. Test everything — caisses, reconciliation, inventory, P&L, intelligence.

## Keep building

Talk to Claude Code naturally:

- "Wire the Open-Meteo weather API to auto-fill weather"
- "Add the gas price scraper for the Régie de l'énergie"  
- "Build the .exe and .dmg installers"
- "Pick the next low-effort upgrade from ROADMAP.md"

## Tips

- **Test after each change** — `npm start` to verify
- **Use Git** — `git init && git add . && git commit -m "initial"` then commit after each working change
- **If something breaks** — describe the error to Claude Code, it'll fix it
- **Come back to Claude.ai** anytime to prototype new features visually before building them

## Building installers (when ready)

Tell Claude Code:

```
Set up electron-builder to create installers. I need a .dmg for Mac 
and a .exe for Windows. App name is BalanceIQ, use the orange gradient 
branding.
```
