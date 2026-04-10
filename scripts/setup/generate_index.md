# generate_index.md
<<<<<<< HEAD
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
=======
## Prompts to run in Claude chat — one for each PPTX

You have two templates (Capabilities and Proposal). Run the matching prompt
for each file, then combine the outputs into one template_index.json.

---

## Prompt for the CAPABILITIES PPTX

Upload your capabilities .pptx to Claude chat, then send:

```
Analyse this PPTX. For every slide create a JSON index entry with these fields:
- id: "cap_" followed by the slide number zero-padded to 3 digits (e.g. "cap_001", "cap_002")
- tags: array of short keywords describing layout and content (e.g. ["hero","dark","full-bleed"] or ["3-col","icons","features","light"])
- slots: number of editable text areas on the slide
- has_image: true/false
- has_chart: true/false
- bg: "light" or "dark"
- type: array of content types (e.g. ["cover","section-divider","features","comparison","timeline","team","quote","closing"])

Output the full JSON array only. No explanation. No markdown fences.
```

Save the output — you'll need it in Step 3 below.

---

## Prompt for the PROPOSAL PPTX

Upload your proposal .pptx to Claude chat, then send the same prompt but with "prop_" prefix:

```
Analyse this PPTX. For every slide create a JSON index entry with these fields:
- id: "prop_" followed by the slide number zero-padded to 3 digits (e.g. "prop_001", "prop_002")
- tags: array of short keywords describing layout and content (e.g. ["hero","dark","full-bleed"] or ["3-col","icons","features","light"])
- slots: number of editable text areas on the slide
- has_image: true/false
- has_chart: true/false
- bg: "light" or "dark"
- type: array of content types (e.g. ["cover","background","problem","solution","timeline","commercials","next-steps","closing"])

Output the full JSON array only. No explanation. No markdown fences.
```

Save the output.

---

## Step 3 — Combine into one file

Your final template_index.json should be one array containing all slides from both decks:

```json
[
  { "id": "cap_001", "tags": [...], "slots": 2, ... },
  { "id": "cap_002", "tags": [...], "slots": 3, ... },
  ...rest of capabilities slides...,
  { "id": "prop_001", "tags": [...], "slots": 2, ... },
  { "id": "prop_002", "tags": [...], "slots": 1, ... },
  ...rest of proposal slides...
]
```

Simply paste the capabilities array contents, then a comma, then the proposal array contents,
all inside one outer pair of square brackets [ ].

---

## Step 4 — Upload to GitHub

1. Go to github.com/rudra314/test_web
2. Navigate to src/data/template_index.json
3. Click the pencil (edit) icon
4. Select all → delete → paste your combined JSON
5. Click "Commit changes"
>>>>>>> origin/main
