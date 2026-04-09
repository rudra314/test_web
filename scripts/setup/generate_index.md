# generate_index.md
## Prompt to run in Claude chat when uploading your master PPTX

Upload your master PowerPoint file (.pptx) to Claude, then send this prompt:

---

Analyse this PPTX. For every slide create a JSON index with these fields:
- id (slide number as string, zero-padded to 3 digits e.g. "012")
- tags (array of short keywords e.g. ["features","3-col","icons","light"])
- slots (number of editable content areas)
- has_image (true/false)
- has_chart (true/false)
- bg ("light" or "dark")
- type (array of content types e.g. ["features","comparison","timeline"])

Output the full JSON array only. No explanation. No markdown fences.

---

## After getting the output:

1. Copy the JSON array
2. Save it as `src/data/template_index.json` (replacing the empty placeholder)
3. Then run `generate_style.md` in the same Claude chat to extract the design system
