# Week Closeout — 2026-04-03

## What Shipped

- `velvet-shadow.web.app` was provisioned as the new public-facing frontend URL.
- Firebase App Hosting now serves the frontend from the `packages/web` project root.
- The backend on Cloud Run now accepts requests from:
  - `https://velvet-shadow.web.app`
  - `https://akboys-web--comp491-akboys-2026.us-central1.hosted.app`
  - `http://localhost:3000`
- Firebase Auth is enabled and the app is back on a Google-only login screen.
- Firestore-backed session persistence is active in production.
- The AKBOYS brand text is now consistent across the UI and repo copy.
- A visible `Sign out` button was added to the home screen header flow.

## Closed Work By Owner

### Kadir — `#3` Multiplayer UI, `#5` Socket.IO Multiplayer

- Multiplayer lobby and room-code flow
- Player sidebar and typing indicators
- Shared session UI and real-time socket client wiring
- Multiplayer page split from single-player flow

### Serdar — `#4` Firebase Auth, `#6` GameState Tracking

- Firebase auth middleware and token verification groundwork
- Login page and protected route behavior
- Explicit server-side `GameState`
- Game-state endpoint and session ownership flow

### Ata Berke — `#7` Image Generation, `#8` Game Over Logic

- Scene image generation endpoint
- Frontend support for room visuals
- Accusation flow
- Win/lose state handling and replay reset behavior

### Batuhan — `#1` Cloud Run Deploy, `#2` Firestore Migration

- Cloud Run deployment pipeline for the backend
- Firestore-backed session store
- Firebase project setup and App Hosting rollout
- Public frontend domain setup through Firebase Hosting
- Cross-origin configuration between frontend and backend

## Current Production URLs

- Frontend: `https://velvet-shadow.web.app`
- App Hosting backend: `https://akboys-web--comp491-akboys-2026.us-central1.hosted.app`
- API backend: `https://comp491-akboys-backend-539067187174.europe-west1.run.app`

## Remaining Checks

- Verify the latest frontend rollout that includes the visible `Sign out` button after propagation.
- Run one full Google sign-in smoke test on `velvet-shadow.web.app`.
- Re-test single-player and multiplayer flows on the new public domain after the latest frontend rollout finishes.

## Recommended Next Week Focus

- Final UX polish on login, profile, and session flows
- One clean end-to-end demo script for presentation day
- Poster / final report assets and screenshots
- Small-scale multiplayer smoke testing with 2 to 4 users
- Cost sanity check for OpenAI image generation and narration traffic
