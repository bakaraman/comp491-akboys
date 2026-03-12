from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Preformatted, KeepTogether, PageBreak
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Colors
BG = HexColor("#0d0d0d")
FG = HexColor("#d4d4d4")
ACCENT = HexColor("#ffab40")
GOLD = HexColor("#ffd54f")
DIM = HexColor("#888888")
CODE_BG = HexColor("#1a1a1a")
GREEN = HexColor("#a5d6a7")
BLUE = HexColor("#90caf9")
RED = HexColor("#ef9a9a")

# Page background
def bg_canvas(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    # Footer
    canvas.setFillColor(DIM)
    canvas.setFont("Courier", 7)
    canvas.drawCentredString(A4[0]/2, 12*mm, f"COMP 491 — Text-Based Adventure with LLMs — Page {canvas.getPageNumber()}")
    canvas.restoreState()

# Styles
title_style = ParagraphStyle("Title", fontName="Courier-Bold", fontSize=16, textColor=GOLD, alignment=TA_CENTER, spaceAfter=4*mm)
subtitle_style = ParagraphStyle("Subtitle", fontName="Courier", fontSize=9, textColor=DIM, alignment=TA_CENTER, spaceAfter=6*mm)
h1_style = ParagraphStyle("H1", fontName="Courier-Bold", fontSize=13, textColor=ACCENT, spaceBefore=7*mm, spaceAfter=3*mm)
h2_style = ParagraphStyle("H2", fontName="Courier-Bold", fontSize=10, textColor=GOLD, spaceBefore=5*mm, spaceAfter=2*mm)
body_style = ParagraphStyle("Body", fontName="Courier", fontSize=8.5, textColor=FG, leading=13, spaceAfter=2*mm)
code_style = ParagraphStyle("Code", fontName="Courier", fontSize=7.5, textColor=GREEN, leading=11, leftIndent=8*mm, spaceAfter=2*mm, backColor=CODE_BG)
dim_style = ParagraphStyle("Dim", fontName="Courier", fontSize=8, textColor=DIM, spaceAfter=1*mm)
bold_style = ParagraphStyle("Bold", fontName="Courier-Bold", fontSize=8.5, textColor=FG, leading=13, spaceAfter=2*mm)

def make_table(headers, rows):
    data = [headers] + rows
    t = Table(data, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a1a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 1), (-1, -1), FG),
        ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#333333")),
        ("BACKGROUND", (0, 1), (-1, -1), HexColor("#111111")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t

# Build PDF
doc = SimpleDocTemplate(
    "/Users/batuhankaraman/demo491/project_technical_document.pdf",
    pagesize=A4,
    leftMargin=18*mm, rightMargin=18*mm,
    topMargin=15*mm, bottomMargin=18*mm,
)

story = []

# Title
story.append(Spacer(1, 5*mm))
story.append(Paragraph("TEXT-BASED ADVENTURE WITH LLMs", title_style))
story.append(Paragraph("Technical Overview — COMP 491 Computer Engineering Design, Spring 2026", subtitle_style))
story.append(Paragraph("Team: Kadir Yigit Ozcelik (79975) · Serdar Yengil (80232) · Batuhan Karaman (79791) · Ata Berke Goktekin (80277)<br/>Advisor: Baris Akgun", dim_style))
story.append(Spacer(1, 3*mm))

# 1. What We Build
story.append(Paragraph("1. WHAT WE BUILD", h1_style))
story.append(Paragraph(
    "We build an AI-powered text adventure game where players type natural language commands and an LLM narrates the story. "
    "The twist: the LLM is only the storyteller. A Python engine acts as the referee, holds all game rules, and the LLM "
    "can only affect the game world through validated function calls. This means the AI brings creative narration "
    "while Python guarantees the game never breaks. Every playthrough is unique because the AI generates a fresh scenario each time.",
    body_style))

# 2. Architecture
story.append(Paragraph("2. HOW IT WORKS", h1_style))
story.append(Paragraph(
    "The player types something like <b>\"examine the body\"</b>. The LLM reads this and decides to call "
    "<font color='#a5d6a7'>investigate(target=\"body\")</font>. Python checks: does this target exist in the current room? "
    "Does the player meet the prerequisites? If yes, Python returns a JSON result with the description and any new evidence. "
    "The LLM takes this JSON and turns it into atmospheric, literary narration. The player never sees raw data.",
    body_style))

story.append(Paragraph("The flow looks like this:", dim_style))
story.append(Paragraph(
    'Player Input  →  LLM picks a function call  →  Python validates & updates state  →  LLM narrates the result  →  Player Output',
    code_style))

story.append(Paragraph("2.1 The Six Core Function Calls", h2_style))
story.append(Paragraph(
    "The LLM has exactly 6 functions it can call. There is no other way to change the game state:",
    body_style))

story.append(make_table(
    ["Function", "What it does", "What Python validates"],
    [
        ["maps(direction)", "Move between rooms", "Does this exit exist?"],
        ["investigate(target)", "Examine an object or area", "Is target here? Has prerequisite evidence?"],
        ["pickup_item(item)", "Put item into inventory", "Was it discovered first via investigate?"],
        ["interact_npc(name, action)", "Talk to / question / threaten NPC", "Is this NPC in the same room?"],
        ["accuse_suspect(who, evidence)", "Final accusation (ends game)", "Is evidence in inventory? Correct combo?"],
        ["take_damage(amount, reason)", "Reduce player sanity", "Amount capped 1-50. Game over at 0."],
    ]
))

story.append(Spacer(1, 3*mm))
story.append(Paragraph("2.2 Concrete Example: Evidence Chain", h2_style))
story.append(Paragraph(
    "In our demo, the player must solve a 1920s noir murder. The solution requires three steps in order. "
    "The LLM cannot skip any step because each function validates prerequisites:",
    body_style))

story.append(Paragraph(
    '1. investigate("body") in Study Room\n'
    '   → Python grants "poison_signs" evidence\n\n'
    '2. investigate("bushes") in Garden\n'
    '   → Python checks: does player have "poison_signs"?\n'
    '   → If no: "You need a clue first." If yes: reveals empty poison bottle\n\n'
    '3. pickup_item("empty_poison_bottle")\n'
    '   → Python checks: was this item discovered? If yes: added to inventory\n\n'
    '4. accuse_suspect("jenkins", "empty_poison_bottle")\n'
    '   → Correct suspect + correct evidence = YOU WIN',
    code_style))

story.append(Paragraph(
    "Even if the LLM hallucinates \"the player found a gun\", there is no add_to_inventory() function. "
    "The only path to inventory is pickup_item, which validates against discovered items.",
    body_style))

# 3. Sandbox
story.append(Paragraph("3. THREE LAYERS OF SANDBOX", h1_style))
story.append(Paragraph(
    "<b>Layer 1 — System Prompt:</b> The LLM receives a strict rule: \"You are the narrator. Never change game state yourself. "
    "All mechanics run through function calls.\" But prompts can be jailbroken, so we do not rely on this alone.",
    body_style))
story.append(Paragraph(
    "<b>Layer 2 — Function Call Gating:</b> This is the real enforcement. The LLM physically cannot modify game state "
    "except through the 6 validated functions. Each function checks rules before it allows anything. "
    "Wrong room? Rejected. Missing prerequisite? Rejected. Item not discovered? Rejected.",
    body_style))
story.append(Paragraph(
    "<b>Layer 3 — Scenario Schema:</b> The entire game world is a structured JSON. Rooms, exits, NPCs, items, evidence chains, "
    "and the solution are all pre-defined. The Python referee only allows actions within this schema. "
    "The LLM has freedom in HOW it describes events, never in WHAT events happen.",
    body_style))

# 4. Procedural Generation
story.append(Paragraph("4. PROCEDURAL STORY GENERATION", h1_style))
story.append(Paragraph(
    "We use the LLM in two separate phases. In <b>Phase 1</b> (before the game), the LLM acts as a scenario architect. "
    "We prompt it: \"Generate a cyberpunk murder mystery with 6 rooms, 3 suspects, 2 key evidence items. "
    "Output as JSON.\" Python validates the JSON: are all rooms connected? Is the evidence chain solvable? "
    "Do NPC locations match? If validation fails, we re-prompt with specific errors.",
    body_style))
story.append(Paragraph(
    "In <b>Phase 2</b> (during the game), a separate LLM session receives the scenario but NOT the solution. "
    "It narrates based on function call results, just like the player discovers the truth step by step. "
    "The narrator never knows who did it.",
    body_style))

story.append(Paragraph("Scenario schema (simplified):", dim_style))
story.append(Paragraph(
    '{\n'
    '  "rooms": {"study": {"exits": {"south": "kitchen"}, "targets": {...}}},\n'
    '  "npcs":  {"jenkins": {"location": "kitchen", "is_guilty": true}},\n'
    '  "items": {"poison_bottle": {"is_key_evidence": true}},\n'
    '  "solution": {"guilty": "jenkins", "evidence": "poison_bottle"}\n'
    '}',
    code_style))

story.append(Paragraph(
    "Each game template (noir, cyberpunk, fantasy, horror) provides a style prefix for the narrator, "
    "a generation prompt for the scenario architect, mechanic modifiers (horror makes sanity drop faster), "
    "and extra function calls (cyberpunk adds hack_terminal, fantasy adds cast_spell).",
    body_style))

# 5. Visuals
story.append(Paragraph("5. AI VISUAL GENERATION", h1_style))
story.append(Paragraph(
    "Every room transition triggers an image generation request. We compose the prompt from a template style prefix "
    "plus the room description. For example, the noir template prepends "
    "\"1920s noir ink illustration, dark shadows, sepia tones:\" to every room description. "
    "This keeps all images in the same visual style throughout the game. "
    "Images are cached per room (no re-generation on revisit), generated asynchronously (the game never freezes), "
    "and have a fallback placeholder if generation fails. We plan to use Stable Diffusion locally or Gemini Imagen.",
    body_style))

# 6. Multiplayer
story.append(Paragraph("6. MULTIPLAYER: QUEUE-BASED CO-OP", h1_style))
story.append(Paragraph(
    "We evaluated three approaches: strict turn-based (too slow, boring waits), free-for-all (race conditions, LLM confusion), "
    "and queue-based. We chose <b>queue-based</b>: players submit actions anytime, actions enter a FIFO queue, "
    "Python processes them one by one, and the narration is broadcast to all players via WebSocket.",
    body_style))

story.append(Paragraph(
    'Player A: "examine body"  →  Queue pos 1  →  Process  →  Broadcast narration\n'
    'Player B: "talk to Jenkins" →  Queue pos 2  →  Process  →  Broadcast narration\n'
    'Player A: "go south"      →  Queue pos 3  →  Process  →  Broadcast narration',
    code_style))

story.append(Paragraph(
    "<b>State split:</b> The map, evidence board, NPCs, and story progress are shared. "
    "Each player has their own location, inventory, sanity, and role.",
    body_style))

story.append(Paragraph(
    "<b>Roles:</b> Detective (can accuse, can dust for prints), Journalist (bonus NPC dialogue, cannot accuse), "
    "Doctor (can analyze substances, partial sanity immunity), Thief (can pick locks, loses extra sanity). "
    "Only the Detective can make the final accusation. NPCs remember interactions with all players: "
    "if Player A threatens Jenkins, Jenkins is hostile to Player B too.",
    body_style))

# 7. Tech Stack
story.append(Paragraph("7. TECH STACK & TIMELINE", h1_style))
story.append(make_table(
    ["Layer", "Technology"],
    [
        ["LLM & Images", "Vertex AI — Gemini 2.5 Flash (function calls + native image gen)"],
        ["Backend", "Google Cloud Run (FastAPI, serverless)"],
        ["Frontend", "React + Next.js (Vercel)"],
        ["Multiplayer", "WebSocket (Socket.IO)"],
        ["Database", "PostgreSQL (Cloud SQL)"],
        ["Cloud Credits", "GCP $300 free credit — 3 months"],
    ]
))

story.append(Spacer(1, 3*mm))
story.append(make_table(
    ["Weeks", "Milestone"],
    [
        ["1-2", "Project setup, proposal, GitHub repo"],
        ["3-4", "Procedural story generation, schema validation"],
        ["5-6", "Web UI (React + FastAPI), basic gameplay"],
        ["7-8", "AI visual generation, cache system"],
        ["9-10", "Multiplayer backend (WebSocket, queue)"],
        ["11-12", "Multiplayer frontend, roles, lobby"],
        ["13-14", "Polish, adversarial tests, poster"],
        ["15", "Poster event, final report, demo"],
    ]
))

# Build
doc.build(story, onFirstPage=bg_canvas, onLaterPages=bg_canvas)
print("PDF generated successfully")
