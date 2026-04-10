/**
 * matcher.js — pre-filter slides to top N template candidates
 *
 * Priority order:
 *  1. Semantic matching via transformers.js (when slide_embeddings.json is populated)
 *  2. Keyword matching against template tags/type (when only template_index.json is available)
 *  3. Stub fallback (when no template data at all)
 */

import { embed, cosineSim } from './embeddings.js'

const TOP_K = 5

/**
 * For each parsed slide, find the top-K matching template candidates.
 *
 * @param {Array} slides        — from parser.parseSlides()
 * @param {Array} embeddings    — from slide_embeddings.json: [{ id, vector }]
 * @param {Array} templateIndex — from template_index.json: [{ id, tags, slots, type, ... }]
 * @returns {Array<Array>} — one array of candidates per slide, sorted by score desc
 */
export async function preFilter(slides, embeddings, templateIndex) {
  const hasEmbeddings = embeddings && embeddings.length > 0
  const hasIndex = templateIndex && templateIndex.length > 0

  // No template data at all — return stub
  if (!hasIndex) {
    return slides.map(() => [{ id: 'slide_001', score: 0.5, tags: [], slots: 2 }])
  }

  // No embeddings but have index — use keyword matching
  if (!hasEmbeddings) {
    return slides.map((slide) => keywordMatch(slide, templateIndex))
  }

  // Full semantic matching
  return semanticMatch(slides, embeddings, templateIndex)
}

// ─── Keyword matching ────────────────────────────────────────────────────────

function keywordMatch(slide, templateIndex) {
  const query = (slide.title + ' ' + slide.body.slice(0, 150)).toLowerCase()
  const queryWords = query.split(/\W+/).filter((w) => w.length > 2)

  const scored = templateIndex.map((template) => {
    const templateText = [
      ...(template.tags || []),
      ...(template.type || []),
    ].join(' ').toLowerCase()

    const matchCount = queryWords.filter((w) => templateText.includes(w)).length
    // Score range 0.35–0.73 (amber zone — Claude will adapt these)
    const score = Math.min(0.73, 0.35 + matchCount * 0.08)

    // Bonus for item count match
    const slotBonus = template.slots === slide.item_count ? 0.05 : 0

    return {
      id: template.id,
      score: Math.min(0.74, score + slotBonus),
      tags: template.tags || [],
      slots: template.slots || 2,
      type: template.type || [],
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, TOP_K)
}

// ─── Semantic matching ───────────────────────────────────────────────────────

async function semanticMatch(slides, embeddings, templateIndex) {
  const indexById = {}
  for (const entry of templateIndex) {
    indexById[entry.id] = entry
  }

  const results = []

  for (const slide of slides) {
    const query = `${slide.title} ${slide.body.slice(0, 200)}`

    let queryVec
    try {
      queryVec = await embed(query)
    } catch {
      // Embedding failed — fall back to keyword match for this slide
      results.push(keywordMatch(slide, templateIndex))
      continue
    }

    const scored = embeddings.map((entry) => {
      const sim = cosineSim(queryVec, entry.vector)
      const meta = indexById[entry.id]
      const slotBonus = meta && meta.slots === slide.item_count ? 0.05 : 0

      return {
        id: entry.id,
        score: Math.min(1, sim + slotBonus),
        tags: meta?.tags || [],
        slots: meta?.slots || 0,
        type: meta?.type || [],
      }
    })

    scored.sort((a, b) => b.score - a.score)
    results.push(scored.slice(0, TOP_K))
  }

  return results
}
