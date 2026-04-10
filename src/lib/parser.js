/**
 * parser.js — split raw slide text on ## delimiters and extract metadata signals
 */

export function parseSlides(rawText) {
  if (!rawText || !rawText.trim()) return []

  // Split on ## headings (keep delimiter via lookahead)
  const blocks = rawText.split(/(?=^##\s)/m).filter((b) => b.trim())

  const slides = []

  for (const block of blocks) {
    const lines = block.split('\n')
    const headingLine = lines[0] || ''

    // Strip the leading ## and trim
    const title = headingLine.replace(/^##\s*/, '').trim()
    if (!title) continue

    const body = lines.slice(1).join('\n').trim()
    const charCount = body.length
    const itemCount = countItems(body)
    const hasNumbers = /\d/.test(body)
    const hasTable = body.includes('|')

    slides.push({
      title,
      body,
      char_count: charCount,
      item_count: itemCount,
      has_numbers: hasNumbers,
      has_table: hasTable,
    })
  }

  return slides
}

/**
 * Count meaningful content items:
 * - Bullet points (lines starting with -, *, •, or numbered list)
 * - Paragraphs (separated by blank lines) if no bullets found
 */
function countItems(body) {
  if (!body) return 0

  // Check for bullet list items
  const bulletLines = body.split('\n').filter((l) => /^\s*[-*•]\s+\S/.test(l) || /^\s*\d+\.\s+\S/.test(l))
  if (bulletLines.length > 0) return bulletLines.length

  // Fallback: count non-empty paragraphs
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  return paragraphs.length || 1
}
