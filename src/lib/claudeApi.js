/**
 * claudeApi.js — single API call to Claude to generate complete slide XML
 *
 * The API key is injected at build time by Vite from the environment variable
 * VITE_ANTHROPIC_API_KEY (set in GitHub Actions secrets).
 */

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `You are a PowerPoint presentation writer. You receive slide content and context, then rewrite and fit the content for each slide.

CONTENT-FIT RULES:
1. Content too long: distill to the core message. No truncation mid-sentence. No ellipsis.
2. Content too short: add one supporting point inferred from the brief and customer context.
3. Bullet lists: merge if more than 7 bullets. Keep each bullet under 15 words.
4. Never invent facts. If expanding, stay within what the user has implied.
5. Apply the improvement level: "minimal" = fix overflows only, "balanced" = refine phrasing, "polish" = rewrite for impact.

TEMPLATE SELECTION RULES:
- Score >= 0.75: use the top candidate template_id as-is.
- Score 0.50-0.74: use the top candidate but note what changed in content_fit_detail.
- Score < 0.50: pick the best matching template_id from the candidates list.

OUTPUT FORMAT — return ONLY a raw JSON object, no markdown fences, no explanation:
{
  "slides": [
    {
      "slide_number": 1,
      "title": "refined slide title",
      "template_id": "slide_042",
      "confidence": 0.91,
      "content_fit": "Fits",
      "content_fit_detail": "",
      "speaker_notes": "speaker note text or empty string",
      "bullets": ["bullet 1", "bullet 2"],
      "body_text": ""
    }
  ]
}

CRITICAL RULES FOR THE JSON:
- "bullets" MUST be a non-empty array whenever the slide content is a list. Never return an empty array if the slide has list items.
- "body_text" MUST be a non-empty string whenever the slide content is a paragraph (not a list).
- Exactly one of "bullets" or "body_text" must have content per slide — never both empty.
- "xml" field does NOT exist in the output. Do not include it.
- Return raw JSON only. Absolutely no markdown code fences (\`\`\`).`

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
    // Strip markdown code fences if Claude wrapped the response (e.g. ```json ... ```)
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    return JSON.parse(cleaned)
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
