import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

# Colors
BLUE = '#2563eb'
GREEN = '#16a34a'
PURPLE = '#7c3aed'
RED = '#dc2626'
ORANGE = '#d97706'
DARK = '#1f2937'
GRAY = '#6b7280'
TEAL = '#0d9488'


def make_diagram(ax, title, subtitle, components):
    """Generic diagram drawer."""
    ax.set_facecolor('#ffffff')
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 10)
    ax.axis('off')

    def box(x, y, w, h, label, sub="", color=DARK, bg='#f3f4f6'):
        b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.12",
                            facecolor=bg, edgecolor=color, linewidth=2.5)
        ax.add_patch(b)
        if sub:
            ax.text(x + w/2, y + h/2 + 0.18, label, ha='center', va='center',
                    fontsize=12, fontweight='bold', color=color, family='sans-serif')
            ax.text(x + w/2, y + h/2 - 0.18, sub, ha='center', va='center',
                    fontsize=8, color=GRAY, family='sans-serif')
        else:
            ax.text(x + w/2, y + h/2, label, ha='center', va='center',
                    fontsize=12, fontweight='bold', color=color, family='sans-serif')

    def arr(x1, y1, x2, y2, color=DARK, label="", lw=2):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color=color, lw=lw))
        if label:
            mx, my = (x1+x2)/2, (y1+y2)/2
            ax.text(mx, my + 0.22, label, ha='center', va='center',
                    fontsize=8, color=color, family='sans-serif', fontweight='bold',
                    bbox=dict(boxstyle='round,pad=0.15', facecolor='#ffffff', edgecolor='none'))

    def group(x, y, w, h, color, alpha=0.4):
        ax.plot([x, x+w, x+w, x, x], [y, y, y+h, y+h, y],
                color=color, linewidth=1.5, linestyle='--', alpha=alpha)

    # Title
    ax.text(8, 9.4, title, ha='center', va='center',
            fontsize=20, fontweight='bold', color=DARK, family='sans-serif')
    ax.text(8, 9.0, subtitle, ha='center', va='center',
            fontsize=14, color=GRAY, family='sans-serif')

    components(box, arr, group, ax)


# ═══════════════════════════════════════════════════════════════
# DIAGRAM 1: Current Architecture
# ═══════════════════════════════════════════════════════════════
def current(box, arr, group, ax):
    # Browser
    box(0.5, 6.5, 2.5, 1.2, "Browser", "User's Device", BLUE, '#dbeafe')

    # Frontend
    ax.text(5.4, 8.5, "Frontend — Next.js 15 + React 19", ha='center', va='center',
            fontsize=10, fontweight='bold', color=GREEN, family='sans-serif')
    group(3.8, 5.8, 3.2, 2.7, GREEN)
    box(4.0, 7.5, 2.8, 0.7, "Scenario Picker", "page.tsx", GREEN, '#dcfce7')
    box(4.0, 6.5, 2.8, 0.7, "Chat Interface", "session/[id]/page.tsx", GREEN, '#dcfce7')

    # Backend
    ax.text(9.4, 8.5, "Backend — Express.js + TypeScript", ha='center', va='center',
            fontsize=10, fontweight='bold', color=PURPLE, family='sans-serif')
    group(7.8, 4.8, 3.2, 3.9, PURPLE)
    box(8.0, 7.5, 2.8, 0.7, "REST API", "6 endpoints", PURPLE, '#ede9fe')
    box(8.0, 6.5, 2.8, 0.7, "SSE Streaming", "Real-time narration", PURPLE, '#ede9fe')
    box(8.0, 5.1, 2.8, 0.7, "Session Store", "In-memory (Map)", PURPLE, '#ede9fe')

    # OpenAI
    ax.text(13.5, 8.5, "OpenAI API", ha='center', va='center',
            fontsize=10, fontweight='bold', color=ORANGE, family='sans-serif')
    group(11.8, 5.8, 3.4, 2.7, ORANGE)
    box(12.0, 7.5, 3.0, 0.7, "GPT-5.4", "Narrator Model", ORANGE, '#fef3c7')
    box(12.0, 6.5, 3.0, 0.7, "GPT-5-nano", "Suggestion Model", ORANGE, '#fef3c7')

    # Shared
    box(4.0, 3.5, 2.8, 1.0, "@akboys/shared", "Types, Scenarios, Constants", DARK, '#f3f4f6')

    # Arrows
    arr(3.0, 7.1, 4.0, 7.1, BLUE, "HTTP")
    arr(6.8, 7.0, 8.0, 7.0, DARK, "REST + SSE")
    arr(10.8, 7.8, 12.0, 7.8, ORANGE, "Streaming")
    arr(5.4, 4.5, 5.4, 6.5, GREEN)
    arr(6.8, 4.2, 8.0, 5.1, PURPLE)

    # Legend
    box(0.5, 3.5, 2.5, 0.7, "Port 3000", "Frontend", GREEN, '#dcfce7')
    box(0.5, 2.5, 2.5, 0.7, "Port 3001", "Backend", PURPLE, '#ede9fe')

    # Status note
    ax.text(8, 1.5, "All sessions are in-memory — data lost on server restart", ha='center',
            fontsize=10, color=RED, family='sans-serif', style='italic')
    ax.text(8, 1.0, "Single-player only — no authentication", ha='center',
            fontsize=10, color=RED, family='sans-serif', style='italic')


# ═══════════════════════════════════════════════════════════════
# DIAGRAM 2: Final Architecture
# ═══════════════════════════════════════════════════════════════
def final(box, arr, group, ax):
    # ── Users ──
    box(0.3, 7.5, 2.0, 0.8, "Player 1", "", BLUE, '#dbeafe')
    box(0.3, 6.4, 2.0, 0.8, "Player 2", "", BLUE, '#dbeafe')
    box(0.3, 5.3, 2.0, 0.8, "Player N", "", BLUE, '#dbeafe')
    ax.text(1.3, 8.5, "Players", ha='center', va='center',
            fontsize=10, fontweight='bold', color=BLUE, family='sans-serif')

    # ── Frontend ──
    ax.text(4.6, 8.5, "Frontend", ha='center', va='center',
            fontsize=10, fontweight='bold', color=GREEN, family='sans-serif')
    ax.text(4.6, 8.15, "Next.js 15 + React 19", ha='center', va='center',
            fontsize=7, color=GRAY, family='sans-serif')
    group(3.0, 4.7, 3.2, 3.6, GREEN)
    box(3.2, 7.3, 2.8, 0.7, "Scenario Picker", "page.tsx", GREEN, '#dcfce7')
    box(3.2, 6.3, 2.8, 0.7, "Chat Interface", "session/[id]", GREEN, '#dcfce7')
    box(3.2, 5.3, 2.8, 0.7, "Multiplayer UI", "Player indicators", GREEN, '#dcfce7')

    # ── Backend ──
    ax.text(8.6, 8.5, "Backend", ha='center', va='center',
            fontsize=10, fontweight='bold', color=PURPLE, family='sans-serif')
    ax.text(8.6, 8.15, "Express.js + TypeScript", ha='center', va='center',
            fontsize=7, color=GRAY, family='sans-serif')
    group(7.0, 3.5, 3.2, 4.8, PURPLE)
    box(7.2, 7.3, 2.8, 0.7, "REST API", "6+ endpoints", PURPLE, '#ede9fe')
    box(7.2, 6.3, 2.8, 0.7, "SSE Streaming", "Real-time narration", PURPLE, '#ede9fe')
    box(7.2, 5.3, 2.8, 0.7, "Socket.IO", "Multiplayer engine", BLUE, '#dbeafe')
    box(7.2, 4.3, 2.8, 0.7, "GameState", "Room, Inventory, Turns", TEAL, '#ccfbf1')
    box(7.2, 3.5, 2.8, 0.7, "Auth Middleware", "Firebase Auth", RED, '#fee2e2')

    # ── OpenAI ──
    ax.text(13.0, 8.5, "OpenAI API", ha='center', va='center',
            fontsize=10, fontweight='bold', color=ORANGE, family='sans-serif')
    group(11.3, 5.5, 3.4, 3.2, ORANGE)
    box(11.5, 7.5, 3.0, 0.7, "GPT-5.4", "Narrator (streaming)", ORANGE, '#fef3c7')
    box(11.5, 6.5, 3.0, 0.7, "GPT-5-nano", "Suggestions", ORANGE, '#fef3c7')
    box(11.5, 5.5, 3.0, 0.7, "gpt-image-1.5", "Scene Images", ORANGE, '#fef3c7')

    # ── Database ──
    box(11.5, 3.5, 3.0, 1.0, "Firestore", "Sessions, Game States", RED, '#fee2e2')

    # ── Auth ──
    box(11.5, 2.0, 3.0, 1.0, "Firebase Auth", "Google / Email login", RED, '#fee2e2')

    # ── Shared ──
    box(3.2, 3.5, 2.8, 0.8, "@akboys/shared", "Types, Scenarios", DARK, '#f3f4f6')

    # ── Deploy ──
    box(0.3, 1.5, 2.5, 0.8, "Firebase Hosting", "Frontend deploy", RED, '#fee2e2')
    box(0.3, 0.4, 2.5, 0.8, "Cloud Run", "Backend deploy", RED, '#fee2e2')
    ax.text(1.55, 2.6, "Google Cloud Platform", ha='center', va='center',
            fontsize=9, fontweight='bold', color=RED, family='sans-serif')
    group(0.1, 0.2, 2.9, 2.6, RED)

    # ── Arrows ──
    # Players → Frontend
    arr(2.3, 7.9, 3.2, 7.6, BLUE, "HTTP")
    arr(2.3, 6.8, 3.2, 6.6, BLUE)
    arr(2.3, 5.7, 3.2, 5.6, BLUE)

    # Frontend → Backend (REST + SSE)
    arr(6.0, 7.0, 7.2, 7.0, DARK, "REST + SSE")

    # Frontend ↔ Backend (Socket.IO)
    arr(6.0, 5.7, 7.2, 5.7, BLUE, "Socket.IO")

    # Backend → OpenAI
    arr(10.0, 7.6, 11.5, 7.8, ORANGE, "Streaming")
    arr(10.0, 6.0, 11.5, 5.9, ORANGE, "Images")

    # Backend → Firestore
    arr(10.0, 4.5, 11.5, 4.0, RED, "Read/Write")

    # Backend → Auth
    arr(10.0, 3.8, 11.5, 2.8, RED, "Verify")

    # Shared → Frontend & Backend
    arr(4.6, 4.3, 4.6, 5.3, GREEN)
    arr(6.0, 4.0, 7.2, 4.3, PURPLE)

    # Deploy arrows
    arr(3.2, 5.0, 1.8, 2.3, RED)
    arr(7.2, 3.5, 2.0, 1.2, RED)


# ═══════════════════════════════════════════════════════════════
# Generate both diagrams
# ═══════════════════════════════════════════════════════════════
base = "/Users/batuhankaraman/comp491-akboys/docs"

# Current
fig1, ax1 = plt.subplots(1, 1, figsize=(16, 10))
fig1.patch.set_facecolor('#ffffff')
make_diagram(ax1, "Text-Based Adventure with LLMs",
             "Current Architecture (March 2026)", current)
plt.tight_layout()
fig1.savefig(f"{base}/architecture_current.png", dpi=200, facecolor='#ffffff', bbox_inches='tight')
print(f"Saved: {base}/architecture_current.png")

# Final
fig2, ax2 = plt.subplots(1, 1, figsize=(16, 10))
fig2.patch.set_facecolor('#ffffff')
make_diagram(ax2, "Text-Based Adventure with LLMs",
             "Final Architecture (Target)", final)
plt.tight_layout()
fig2.savefig(f"{base}/architecture_final.png", dpi=200, facecolor='#ffffff', bbox_inches='tight')
print(f"Saved: {base}/architecture_final.png")
