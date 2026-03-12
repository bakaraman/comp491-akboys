---
trigger: always_on
alwaysApply: true
---

# AK Boys — Text-Based Adventure with LLMs

## Project Overview

**COMP 491 Senior Design Project — Spring 2026**
AI-powered text adventure game with the "Structured Chaos" architecture:
Python/TS referee engine + LLM narrator + multiplayer co-op.

**Team:** Batuhan Karaman, Kadir Yigit Ozcelik, Serdar Yengil, Ata Berke Goktekin
**Advisor:** Baris Akgun

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | OpenAI GPT-5.4 (function calling) |
| Image Gen | OpenAI gpt-image-1.5 |
| Backend | Node.js + Express + TypeScript |
| Frontend | React + Next.js + TypeScript (TSX) |
| Multiplayer | Socket.IO (future) |
| Cloud | Google Cloud Platform (Cloud Run, Firebase Hosting) |
| Monorepo | npm workspaces |

---

## AI Agent Protocol

**READ → PLAN → THINK → CODE**

1. **READ** — Read all relevant files before making changes
2. **PLAN** — Describe what you will do and why
3. **THINK** — Consider edge cases, coupling, cohesion
4. **CODE** — Make minimal, deliberate, reviewable edits

---

## Core Behavior Principles

- You are an agent, not a chatbot. Each task is a scoped dev operation.
- Edits must be **deliberate, reviewable, and minimal**.
- Never guess — read the code first.
- Never create files unless absolutely necessary.
- Prefer editing existing files over creating new ones.

---

## Architecture Rules

### Low Coupling, High Cohesion

- Each module does ONE thing well.
- Dependencies flow downward: `web → server → shared`. Never upward.
- `@akboys/shared` is the only cross-package dependency.
- No circular imports. Ever.

### Monorepo Structure

```
comp491-akboys/
├── .agent/akboysrules.md     ← This file
├── .env                       ← API keys (gitignored)
├── .env.example               ← Template (committed)
├── packages/
│   ├── shared/                ← Types, constants, schemas
│   ├── server/                ← Express API + game engine
│   └── web/                   ← Next.js frontend
└── docs/
    ├── lecture-slides/        ← Course templates (read-only)
    ├── filled/                ← Submitted documents
    └── generators/            ← Python doc generation scripts
```

### Package Dependency Graph

```
@akboys/web ──→ @akboys/shared
@akboys/server ──→ @akboys/shared
```

---

## File Rules

### Size Limits

| Condition | Action |
|-----------|--------|
| File **200+ lines** | Review: can it be split? |
| File **800+ lines** | WARNING: must propose splitting |
| File **1000+ lines** | STOP: refactor before proceeding |

### File Header Comment (MANDATORY)

Every `.ts` / `.tsx` file MUST start with:

```typescript
/**
 * filename.ts — One-line description
 *
 * Longer explanation of what this file does and why it exists.
 *
 * @author AK Boys Team
 * @since YYYY-MM-DD
 */
```

### Module Structure

Each feature gets its own folder with an `index.ts` export hub:

```
features/
├── narrator/
│   ├── index.ts          ← Export hub
│   ├── buildPrompt.ts    ← Single function
│   ├── parseResponse.ts  ← Single function
│   └── types.ts          ← Local types
```

### Import Order

1. Node built-ins (`path`, `fs`)
2. External packages (`express`, `openai`, `react`)
3. Monorepo packages (`@akboys/shared`)
4. Local imports (`./`, `../`)

Blank line between each group.

---

## Coding Standards

### TypeScript

- **Strict mode** always enabled
- Prefer `interface` over `type` for object shapes
- Prefer `const` over `let`, never use `var`
- Explicit return types on exported functions
- No `any` — use `unknown` if truly needed

### React / TSX

- Functional components only (no class components)
- Custom hooks in `hooks/` folder
- Components in `components/` folder, one component per file
- Inline styles for now (will migrate to Tailwind later)
- No CSS-in-JS libraries

### Naming

- Files: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Folders: `kebab-case`

---

## Git & Deployment

### Branch Strategy

- `main` — stable, deployable
- `dev` — integration branch
- Feature branches: `feature/description`
- Bug fixes: `fix/description`

### Commit Messages

Format: `type: short description`

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

### Development

```bash
npm run dev:local    # Starts server (3001) + web (3000)
```

---

## Security

- **NEVER** commit `.env` files
- API keys go in `.env`, template in `.env.example`
- Set spending limits on OpenAI dashboard
- Validate all user input on the server side
- Rate limit API endpoints

---

## Non-Negotiable Rules

1. **Every file has a header comment** — no exceptions
2. **No file over 800 lines** without a plan to split
3. **READ before EDIT** — always read the file before changing it
4. **No `any` types** — use proper typing or `unknown`
5. **No secrets in code** — everything in `.env`
6. **Test the change** — `npm run dev:local` must work after every change
