# Minimal Stop-Watch

A minimal, distraction-free stopwatch PWA — installable on Android and iOS.

## Features

- Giant time display — tap to configure
- Work / Break automatic phase switching with haptic feedback
- Custom themes — any bg + text color, saved to localStorage
- System / Black built-in themes (follows OS dark/light preference)
- Installable as a PWA (Android Chrome, iOS Safari)
- Screen wake lock — keeps display on while running
- Fullscreen mode
- Offline support via service worker

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
# output → dist/
```

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. The included `.github/workflows/deploy.yml` builds and deploys automatically on every push to `main`

Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## Install as PWA

**Android:** Chrome → three-dot menu → Add to Home Screen

**iOS:** Safari → Share → Add to Home Screen

## Usage

| Action | How |
|---|---|
| Start / Pause | Bottom-right button |
| Reset | Bottom-left button |
| Configure intervals | Tap the clock face |
| Change theme | Top-left button |
| Fullscreen | Top-right button |

## Stack

React 18 · TypeScript · Vite · PWA (Web Manifest + Service Worker)