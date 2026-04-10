/**
 * matcher.js — pre-filter slides to top N template candidates
 * using semantic similarity + item count bonus
 */

import { embed, cosineSim } from './embeddings.js'

const TOP_K = 5

/**
 * For each parsed slide, find the top-K matching template candidates.
 *
 * @param {Array} slides — from parser.parseSlides()
 * @param {Array} embeddings — from slide_embeddings.json: [{ id, vector }]
 * @param {Array} templateIndex — from template_index.json: [{ id, tags, slots, type, ... }]
 * @returns {Array<Array>} — one array of candidates per slide, sorted by score desc
 */
export async function preFilter(slides, embeddings, templateIndex) {
  if (!embeddings || embeddings.length === 0) {
    // No embeddings available — return a stub candidate per slide
    return slides.map(() => [{ id: 'slide_001', score: 0.5, tags: [], slots: 2 }])
  }

  // Build a lookup map from id → template metadata
  const indexById = {}
  for (const entry of templateIndex) {
    indexById[entry.id] = entry
  }

  const results = []

  for (const slide of slides) {
    // Build query string: title + first 200 chars of body
    const query = `${slide.title} ${slide.body.slice(0, 200)}`

    let queryVec
    try {
      queryVec = await embed(query)
    } catch {
      // If embedding fails (e.g. model not loaded), fall back to score 0.5
      results.push([{ id: 'slide_001', score: 0.5, tags: [], slots: 2 }])
      continue
    }

    // Score every template entry
    const scored = embeddings.map((entry) => {
      const sim = cosineSim(queryVec, entry.vector)

      // Item count bonus: +0.05 if slot count matches item count exactly
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

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score)

    results.push(scored.slice(0, TOP_K))
  }

  return results
}
