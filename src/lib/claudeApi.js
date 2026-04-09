/**
 * claudeApi.js — single API call to Claude to generate complete slide XML
 *
 * The API key is injected at build time by Vite from the environment variable
 * VITE_ANTHROPIC_API_KEY (set in GitHub Actions secrets).
 */

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `You are a PowerPoint deck builder. You receive slide content and matched template candidates. You pick the best template per slide, fit the content, and output complete PPTX slide XML.

LAYOUT SELECTION RULES:
- Score >= 0.75: use template as-is, fill content into slots
- Score 0.50-0.74: use template with adaptation, note what changed
- Score < 0.50: invent a new slide layout using template_style.json design rules

CONTENT-FIT RULES (apply to every slide):
1. Check slot_map max_chars for the matched slide before placing content
2. Content > max_chars: distill to fit. Keep core message. No mid-sentence truncation. No ellipsis.
3. Content < 50% of max_chars: expand with one supporting point inferred from the brief and customer context
4. Item count mismatches slot count: swap to nearest matching layout and report the swap
5. Bullet lists: never exceed bullet_max from slot_map. Merge bullets if needed.
6. Never invent facts. If expanding, stay within what the user has implied.

CONFIDENCE SCORING (for the layout report):
- slot_count_match: +0.40
- content_type_tag_match: +0.25
- visual_element_match: +0.20
- density_match: +0.10
- background_match: +0.05

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "slides": [
    {
      "slide_number": 1,
      "title": "slide title",
      "template_id": "slide_042",
      "confidence": 0.91,
      "content_fit": "Fits",
      "content_fit_detail": "",
      "speaker_notes": "optional notes here",
      "bullets": ["bullet 1", "bullet 2"],
      "body_text": "paragraph text if not bullets",
      "xml": ""
    }
  ]
}
Output JSON only. No explanation. No markdown fences.`

/**
 * Build and send the Claude API request.
 *
 * @param {object} formData — from DeckForm
 * @param {Array}  slides — from parser.parseSlides()
 * @param {Array}  candidates — from matcher.preFilter()
 * @param {object} matchedXmls — { [slide_id]: xml_string }
 * @param {object} slotMap — from slot_map.json
 * @param {object} styleProfile — from template_style.json
 * @returns {object} parsed Claude JSON response
 */
export async function generateDeck(formData, slides, candidates, matchedXmls, slotMap, styleProfile) {
  if (!API_KEY) {
    throw new Error(
      'VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file for local dev, or to GitHub Actions secrets for deployment.'
    )
  }

  const userPrompt = buildUserPrompt(formData, slides, candidates, matchedXmls, slotMap, styleProfile)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text

  if (!text) throw new Error('Empty response from Claude API')

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Failed to parse Claude response as JSON:\n${text.slice(0, 300)}`)
  }
}

function buildUserPrompt(formData, slides, candidates, matchedXmls, slotMap, styleProfile) {
  const deckSpecific =
    formData.deckType === 'prop'
      ? `Project: ${formData.projectName || 'N/A'}
Engagement: ${formData.engagementType || 'N/A'}
Timeline: ${formData.timeline || 'N/A'}
Budget: ${formData.budget || 'N/A'}`
      : `Meeting type: ${formData.meetingType || 'N/A'}`

  const slidesSection = slides
    .map((slide, i) => {
      const topCandidates = candidates[i] || []
      const topId = topCandidates[0]?.id || 'none'
      const topXml = matchedXmls[topId] || '(no template XML available — invent layout)'
      const topSlotMap = slotMap[topId] ? JSON.stringify(slotMap[topId], null, 2) : '{}'

      return `--- SLIDE ${i + 1} ---
Title: ${slide.title}
Content: ${slide.body}
Item count: ${slide.item_count}
Char count: ${slide.char_count}
Has numbers: ${slide.has_numbers}
Has table: ${slide.has_table}

Top 5 candidates:
${topCandidates.map((c) => `  - ${c.id} (score: ${c.score.toFixed(2)}) tags: ${(c.tags || []).join(', ')} slots: ${c.slots}`).join('\n') || '  (none)'}

Slot map for top candidate (${topId}):
${topSlotMap}

Template XML for top candidate:
${topXml}`
    })
    .join('\n\n')

  return `DECK CONTEXT:
Type: ${formData.deckType === 'cap' ? 'Capabilities & services' : 'Project proposal'}
Customer: ${formData.customerName || 'N/A'}
Industry: ${formData.industry || 'N/A'}
Audience: ${formData.audience || 'N/A'}
Density: ${formData.density || 'balanced'}
Improvement level: ${formData.improvement || 'balanced'}
Speaker notes: ${formData.speakerNotes || 'generate'}
Customer context: ${formData.customerContext || 'none provided'}
${deckSpecific}

TEMPLATE STYLE PROFILE:
${JSON.stringify(styleProfile, null, 2)}

SLIDES AND CANDIDATES:
${slidesSection}`
}
