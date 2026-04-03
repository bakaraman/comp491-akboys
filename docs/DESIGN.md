# DESIGN.md — UI Design System Reference

This is the single source of truth for all visual decisions. **Read this before writing any frontend code.**

---

## Color Palette

### Backgrounds (darkest → lightest)

| Hex | Name | Where to Use |
|-----|------|-------------|
| `#0a0a0a` | Page BG | `<body>`, page backgrounds, deepest layer |
| `#0d0d0d` | Header/Input BG | Header bar, ChatInput bar, fixed UI chrome |
| `#111111` | Card BG | Mode cards, sidebar player cards, input fields |
| `#141210` | Card Hover BG | Card `:hover` state (slightly warmer) |
| `#1a1a1a` | Narrator Bubble BG | Narrator chat messages, modal selects |
| `#1a1510` | Self-highlight BG | "You" card in sidebar, disabled buttons |
| `#151515` | Other Player Bubble BG | CommPanel received messages |
| `#1a2030` | DM Self Bubble BG | CommPanel direct message (you sent) |

### Borders

| Hex | Name | Where to Use |
|-----|------|-------------|
| `#1e1e1e` | Faint Border | Card borders when not focused/selected |
| `#2a2520` | Standard Border | Input borders, separators, sidebar borders, scroll dividers |
| `#2a3040` | DM Border | Direct message bubble border |
| `#3a3020` | Self-highlight Border | "You" card border in player sidebar |
| `#3a3530` | Disconnected BG | Offline player avatar background |

### Text

| Hex | Name | Where to Use |
|-----|------|-------------|
| `#e8e0d4` | Primary Text | Body text, card titles, names |
| `#b0a080` | Heading Text | Scenario titles, h3 headings |
| `#9a9080` | Secondary Text | Descriptions, profile name, subtitles |
| `#6a6050` | Muted Text | Close buttons, labels, observed message tags |
| `#5a5545` | Chrome Text | Monospace labels, uppercase subtitles |
| `#4a4540` | Loading Text | "Checking identity...", spinner labels |

### Accents

| Hex | Name | Where to Use |
|-----|------|-------------|
| `#d4a843` | **Gold** (Primary) | Titles, active borders, buttons, active tabs, avatars, host badges |
| `#c8894a` | Amber | Secondary accent, hover states |
| `#5ba3cf` | Blue | Direct messages, DM tab, blue player color |
| `#cf5b5b` | Red | Errors, red player color |
| `#5bcf7f` | Green | Green player color, success states |
| `#d46868` | Game Over Red | "Game Over" title, turn warning |
| `#d88b73` | Sign-out | Sign-out button text |
| `#4a8a4a` | Online Green | Online indicator dot + text |
| `#8a4a4a` | Offline Red | Offline indicator dot + text |

### Player Colors (assigned in order)

```typescript
// @akboys/shared/src/types/game.ts
export const PLAYER_COLORS = ['#d4a843', '#5ba3cf', '#cf5b5b', '#5bcf7f'] as const;
```

---

## Typography

| Element | Font | Size | Weight | Other |
|---------|------|------|--------|-------|
| Body default | `Georgia, 'Times New Roman', serif` | 16px | normal | Set in globals.css |
| Page title | Georgia | 42px | normal | `fontStyle: 'italic'`, color gold |
| Section subtitle | monospace | 13px | normal | `letterSpacing: '3px'`, `textTransform: 'uppercase'` |
| Card title | Georgia | inherit | bold | color `#b0a080` → gold on hover |
| Button text | monospace | 14-16px | bold | `letterSpacing: '2px'`, `textTransform: 'uppercase'` |
| Input text | Georgia | 16px | normal | |
| Chat message | Georgia | inherit | normal | Markdown rendered via react-markdown |
| Labels/tags | monospace | 10-13px | normal | |
| Room code input | monospace | 28px | bold | `letterSpacing: '8px'`, centered |

---

## Spacing

| Pattern | Value | Example |
|---------|-------|---------|
| Page padding | `24px` | All page containers |
| Card padding | `20px` to `36px` | Mode cards: 36px, scenario cards: 20px |
| Input padding | `14px 18px` | Text inputs |
| Button padding | `14px 28px` | Primary action buttons |
| Flex gap (small) | `8px` | Tight groups (badges, pills) |
| Flex gap (medium) | `12px` | Card grids, form rows |
| Flex gap (large) | `16px` | Section spacing |
| Header height | ~56px | `padding: 12px 20px` with content |

---

## Border Radius

| Element | Radius |
|---------|--------|
| Mode cards | `14px` |
| Scenario cards | `12px` |
| Popups/modals | `16px` |
| Input fields | `8px` |
| Buttons | `8px` |
| Pills/badges | `20px` to `24px` |
| Avatar circles | `50%` |
| Small tags | `4px` to `6px` |
| Narrator bubble | `4px 16px 16px 16px` (top-left sharp) |
| Player bubble | `16px 4px 16px 16px` (top-right sharp) |

---

## Z-Index Stack

| z-index | Element | Notes |
|---------|---------|-------|
| `30` | ProfileButton, Sign-out | Floating top-right |
| `40` | Sidebar/CommPanel backdrop | Dark overlay `rgba(0,0,0,0.5)` |
| `50` | Sidebar panel, CommPanel panel, Game Over overlay | Slide-out panels |
| `60` | Accusation modal, toasts | Above game-over |
| `70` | Reconnecting overlay | Above modals |
| `80` | NamePopup | Highest — blocks everything |

**Rule:** If you add a new overlay/panel, pick a z-index from this table. Never use random values.

---

## Animations & Transitions

| Name | CSS | Duration | Used For |
|------|-----|----------|----------|
| General transition | `transition: all 0.2s` | 200ms | Default for hover states |
| Card hover | `transition: all 0.3s ease` | 300ms | Cards, buttons |
| Panel slide | `transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)` | 300ms | Sidebar, CommPanel slide-in |
| Backdrop fade | `transition: opacity 0.3s ease` | 300ms | Dark overlays |
| `fadeIn` | `0→1 opacity` | use with `animation` | NamePopup backdrop |
| `scaleIn` | `0.95→1 scale + 0→1 opacity` | use with `animation` | NamePopup card |
| `spin` | `rotate(0→360deg)` | 1s linear infinite | Loading spinners |
| `pulse` | `scale(0.8)→scale(1.2) + opacity` | 1.4s infinite | Typing indicator dots |
| `fadeInUp` | `translateY(10px)→0 + 0→1 opacity` | use with `animation` | Toast messages |

---

## Component Patterns

### New Panel/Drawer
Follow CommPanel.tsx / PlayerSidebar.tsx pattern:
1. Backdrop: fixed, inset 0, `rgba(0,0,0,0.5)`, z-index 40, onClick closes
2. Panel: fixed, right 0, top 0, height 100vh, width Xpx, z-index 50, `translateX` slide
3. Escape key closes: `useEffect` with `keydown` listener
4. Body scroll lock: set `overflow: hidden` on open

### New Chat Bubble
Follow ChatMessage.tsx:
- Narrator: left-aligned, bg `#1a1a1a`, border-radius `4px 16px 16px 16px`
- Player: right-aligned, bg `#2a2010`, border-radius `16px 4px 16px 16px`
- System: centered, monospace, no bubble

### New Modal
Follow accusation modal in session/[id]/page.tsx:
- Backdrop: fixed, inset 0, bg `rgba(0,0,0,0.72)`, z-index 60
- Card: centered, bg `#111`, border `1px solid #2a2520`, border-radius 16px, padding 36px
- Close with Escape key

### New Card Grid
Follow singleplayer/page.tsx:
```tsx
gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))'
gap: '12px'
```

---

## Don'ts

- **Don't use Tailwind** — we use inline styles
- **Don't use CSS modules** — all styles are inline `style={{ }}`
- **Don't add new colors** — pick from the palette above
- **Don't use `position: absolute`** for overlays — use `position: fixed`
- **Don't add new fonts** — Georgia for content, monospace for UI chrome
- **Don't use `rem` or `em`** — use `px` for consistency
- **Don't use `!important`** — inline styles don't need it
