# docs/ — Project Documentation

## Folder Structure

### `lecture-slides/`
Original templates provided by the COMP 491 course.
These are **read-only references** — do not edit directly.

- `COMP491_Registration_Form.docx` — Team registration template
- `COMP491_Proposal_Template.docx` — Project proposal template
- `Comp491_ProgressPresentationTemplate.pptx` — Progress meeting template
- `Comp491_ProgressPresentationTemplate_fixed.pptx` — Fixed version (corrupted image removed)
- `COMP491_PosterTemplate.pptx` — Poster template
- `COMP491-1minPresentationTemplate.pptx` — 1-min pitch template
- `COMP491_FinalReportTitlePage (1) (1).docx` — Final report title page
- `COMP491-ProjectVideoGuideline (2).pptx` — Video guideline

### `filled/`
Completed documents ready for submission.

- `COMP491_Registration_Form_FILLED.docx` — Submitted registration form
- `COMP491_Proposal_FILLED.docx` — Submitted project proposal (with Gantt chart)
- `COMP491_Progress1.pptx` — Progress Meeting 1 presentation
- `COMP491_Progress2.pptx` — Progress Meeting 2 presentation
- `COMP491_Progress3.pptx` — Progress Meeting 3 presentation
- `COMP491_Proposal_Updated_FILLED.docx` — Updated project proposal
- `project_technical_document.docx` — Technical overview document

### `generators/`
Python scripts that programmatically fill the templates.
Run these to regenerate filled documents if content changes.

- `fill_proposal.py` — Fills the proposal template in-place
- `fill_progress1.py` — Fills progress meeting 1 presentation
- `fill_progress2.py` — Fills progress meeting 2 presentation
- `fill_progress3.py` — Fills progress meeting 3 presentation
- `fill_proposal_updated.py` — Generates the updated proposal document
- `generate_architecture.py` — Generates current/final architecture diagrams
- `generate_doc.py` — Generates technical document DOCX
- `generate_pdf.py` — Generates technical document PDF (black background)
- `demo_v1.py` — Original Tkinter demo (single-player noir detective game)
