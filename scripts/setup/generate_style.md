# generate_style.md
## Follow-up prompt in the same Claude chat (same PPTX upload session)

Run this immediately after `generate_index.md` in the same chat window:

---

Now extract the design system from this template. Output JSON with:
primary_color, secondary_color, accent_color, background_color,
heading_font, body_font, heading_size, body_size, corner_radius,
spacing_unit, icon_style, dark_slides_used_for,
rules (array of 5-8 design rules — e.g. "Never use accent lines under titles",
"Always pair visual with text blocks", "Minimum 0.5in margins all sides").

Output JSON only. No explanation.

---

## After getting the output:

1. Copy the JSON object
2. Save it as `src/data/template_style.json` (replacing the placeholder)
