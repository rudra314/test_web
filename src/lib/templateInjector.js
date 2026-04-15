/**
 * templateInjector.js
 *
 * Opens the real template PPTX as a ZIP, replaces text content in matched
 * slides, reorders presentation.xml, and returns a Blob ready for download.
 *
 * Text replacement uses two strategies:
 *  1. Placeholder-based  — looks for <p:ph type="title"> / <p:ph idx="1">
 *  2. Position-based     — fallback for custom shapes without placeholders;
 *                          sorts shapes by Y position (topmost = title,
 *                          largest below = body)
 *
 * The visual design (colors, shapes, images, fonts) is 100% preserved.
 */

import JSZip from 'jszip'

const BASE   = import.meta.env.BASE_URL?.replace(/\/$/, '') || ''
const NS_P   = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_A   = 'http://schemas.openxmlformats.org/drawingml/2006/main'

// Slide dimensions in EMU (English Metric Units). 1 inch = 914400 EMU.
// Standard 16:9 slide = 9144000 × 5143500 EMU
const SLIDE_W = 9144000
const SLIDE_H = 5143500

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function injectIntoTemplate(deckType, slides) {
  const fileName = deckType === 'cap' ? 'capabilities.pptx' : 'proposal.pptx'
  const url      = `${BASE}/templates/${fileName}`

  console.log(`[injector] Loading template: ${url}`)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load template (${res.status}): ${url}`)
  const buf = await res.arrayBuffer()

  const zip = await JSZip.loadAsync(buf)

  // List available slide files so we can detect out-of-range IDs
  const availableSlides = new Set(
    zip.file(/^ppt\/slides\/slide\d+\.xml$/).map(f => f.name)
  )
  console.log(`[injector] Template has ${availableSlides.size} slides`)

  for (const slide of slides) {
    const slideNum = templateIdToSlideNum(slide.template_id)
    const path     = `ppt/slides/slide${slideNum}.xml`

    if (!availableSlides.has(path)) {
      console.warn(`[injector] Slide ${slideNum} not in template (id: ${slide.template_id}) — skipping`)
      continue
    }

    const xml     = await zip.file(path).async('string')
    const content = resolveContent(slide)

    console.log(`[injector] Slide ${slideNum} (${slide.template_id}): ` +
      `title="${(slide.title || '').slice(0, 40)}", content lines=${content.length}`)

    const modified = injectText(xml, slide.title, content)
    zip.file(path, modified)
  }

  await reorderPresentation(zip, slides)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function templateIdToSlideNum(id) {
  const m = (id || '').match(/_(\d+)$/)
  return m ? parseInt(m[1], 10) : 1
}

function resolveContent(slide) {
  if (Array.isArray(slide.bullets) && slide.bullets.length > 0) return slide.bullets
  if (typeof slide.body_text === 'string' && slide.body_text.trim()) {
    return slide.body_text.split('\n').filter(Boolean)
  }
  return []
}

// ─── Text injection ───────────────────────────────────────────────────────────

function injectText(slideXml, title, lines) {
  const doc = new DOMParser().parseFromString(slideXml, 'text/xml')

  // ── Strategy 1: PowerPoint placeholder shapes ─────────────────────────────
  let titleShape = null
  const bodyShapes = [] // { sp, idx }

  for (const sp of doc.getElementsByTagNameNS(NS_P, 'sp')) {
    const nvPr = sp.getElementsByTagNameNS(NS_P, 'nvPr')[0]
    if (!nvPr) continue
    const ph = nvPr.getElementsByTagNameNS(NS_P, 'ph')[0]
    if (!ph) continue

    const phType = ph.getAttribute('type') || ''
    const phIdx  = parseInt(ph.getAttribute('idx') || '-1', 10)

    if (phType === 'title' || phType === 'ctrTitle') {
      titleShape = sp
    } else if (phType === 'body' || phIdx >= 1) {
      bodyShapes.push({ sp, idx: phIdx >= 0 ? phIdx : 999 })
    }
  }

  bodyShapes.sort((a, b) => a.idx - b.idx)

  // ── Strategy 2: Position-based fallback for custom/non-placeholder shapes ─
  if (!titleShape && bodyShapes.length === 0) {
    console.log('[injector] No placeholder shapes found — using position-based fallback')
    const positioned = getTextShapesByPosition(doc)

    console.log(`[injector] Found ${positioned.length} text shapes by position`)
    positioned.forEach((s, i) =>
      console.log(`  [${i}] y=${s.y} area=${s.area} text="${s.preview}"`)
    )

    if (positioned.length > 0) {
      // Topmost shape = title
      titleShape = positioned[0].sp

      // Remaining shapes sorted largest-area-first = body content areas
      positioned
        .slice(1)
        .sort((a, b) => b.area - a.area)
        .forEach((s, i) => bodyShapes.push({ sp: s.sp, idx: i + 1 }))
    }
  } else {
    console.log(`[injector] Placeholder strategy: titleShape=${!!titleShape}, bodyShapes=${bodyShapes.length}`)
  }

  // ── Apply replacements ────────────────────────────────────────────────────
  if (titleShape && title) {
    setShapeText(doc, titleShape, [title])
    console.log(`[injector] ✓ Title replaced`)
  } else if (!titleShape) {
    console.warn('[injector] ✗ No title shape found — title not injected')
  }

  if (bodyShapes.length > 0 && lines.length > 0) {
    const chunkSize = Math.ceil(lines.length / bodyShapes.length)
    bodyShapes.forEach(({ sp }, i) => {
      const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize)
      if (chunk.length > 0) {
        setShapeText(doc, sp, chunk)
        console.log(`[injector] ✓ Body shape ${i + 1}/${bodyShapes.length} replaced with ${chunk.length} lines`)
      }
    })
  } else if (lines.length === 0) {
    console.log('[injector] No content lines — body left as-is')
  } else {
    console.warn('[injector] ✗ No body shapes found — content not injected')
  }

  return new XMLSerializer().serializeToString(doc)
}

/**
 * Find all text-bearing shapes and return them sorted by Y position (top first).
 * Used as fallback when no PowerPoint placeholder shapes exist.
 */
function getTextShapesByPosition(doc) {
  const results = []

  for (const sp of doc.getElementsByTagNameNS(NS_P, 'sp')) {
    const txBody = sp.getElementsByTagNameNS(NS_A, 'txBody')[0]
    if (!txBody) continue

    // Get position + size from spPr > xfrm
    const spPr  = sp.getElementsByTagNameNS(NS_P, 'spPr')[0]
    const xfrm  = spPr?.getElementsByTagNameNS(NS_A, 'xfrm')[0]
    const off   = xfrm?.getElementsByTagNameNS(NS_A, 'off')[0]
    const ext   = xfrm?.getElementsByTagNameNS(NS_A, 'ext')[0]

    const y  = parseInt(off?.getAttribute('y')  ?? SLIDE_H, 10)
    const x  = parseInt(off?.getAttribute('x')  ?? 0,       10)
    const cx = parseInt(ext?.getAttribute('cx') ?? 0,       10)
    const cy = parseInt(ext?.getAttribute('cy') ?? 0,       10)

    // Skip tiny shapes (decorative labels, slide numbers < 5% slide area)
    const area = cx * cy
    if (area < SLIDE_W * SLIDE_H * 0.02) continue

    // Preview text for debugging
    const preview = Array.from(txBody.getElementsByTagNameNS(NS_A, 't'))
      .map(t => t.textContent)
      .join(' ')
      .slice(0, 50)

    results.push({ sp, y, x, cx, cy, area, preview })
  }

  // Sort top-to-bottom by Y coordinate
  results.sort((a, b) => a.y - b.y)
  return results
}

/**
 * Replace all text paragraphs in a shape's txBody.
 * Clones paragraph/run properties from the first existing paragraph so the
 * template's font size, bold, color, spacing, etc. are preserved.
 */
function setShapeText(doc, sp, lines) {
  const txBody = sp.getElementsByTagNameNS(NS_A, 'txBody')[0]
  if (!txBody) return

  const existingParas = Array.from(txBody.getElementsByTagNameNS(NS_A, 'p'))
  if (existingParas.length === 0) return

  const firstPara  = existingParas[0]
  const lastPara   = existingParas[existingParas.length - 1]

  // Clone formatting templates from first paragraph
  const tmplPPr    = firstPara.getElementsByTagNameNS(NS_A, 'pPr')[0]?.cloneNode(true)
  const firstRun   = firstPara.getElementsByTagNameNS(NS_A, 'r')[0]
  const tmplRPr    = firstRun?.getElementsByTagNameNS(NS_A, 'rPr')[0]?.cloneNode(true)
  const tmplEndRPr = lastPara.getElementsByTagNameNS(NS_A, 'endParaRPr')[0]?.cloneNode(true)

  // Remove all existing paragraphs
  for (const p of existingParas) txBody.removeChild(p)

  // Add one paragraph per content line
  for (const line of lines) {
    const p = doc.createElementNS(NS_A, 'a:p')
    if (tmplPPr) p.appendChild(tmplPPr.cloneNode(true))

    const r = doc.createElementNS(NS_A, 'a:r')

    if (tmplRPr) {
      r.appendChild(tmplRPr.cloneNode(true))
    } else {
      // No run properties found — add a minimal one so text renders
      const rPr = doc.createElementNS(NS_A, 'a:rPr')
      rPr.setAttribute('lang', 'en-US')
      rPr.setAttribute('dirty', '0')
      r.appendChild(rPr)
    }

    const t = doc.createElementNS(NS_A, 'a:t')
    t.textContent = line
    r.appendChild(t)
    p.appendChild(r)
    txBody.appendChild(p)
  }

  // PowerPoint requires a trailing empty paragraph
  const trail = doc.createElementNS(NS_A, 'a:p')
  if (tmplEndRPr) {
    trail.appendChild(tmplEndRPr.cloneNode(true))
  } else {
    const epr = doc.createElementNS(NS_A, 'a:endParaRPr')
    epr.setAttribute('lang', 'en-US')
    epr.setAttribute('dirty', '0')
    trail.appendChild(epr)
  }
  txBody.appendChild(trail)
}

// ─── Presentation reorder ─────────────────────────────────────────────────────

async function reorderPresentation(zip, slides) {
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')
  if (!relsXml) return

  const relsDoc  = new DOMParser().parseFromString(relsXml, 'text/xml')
  const relNodes = Array.from(relsDoc.getElementsByTagName('Relationship'))

  // Build slideNumber → rId map from the rels file
  const slideRidMap = {}
  for (const rel of relNodes) {
    const type   = rel.getAttribute('Type')   || ''
    const target = rel.getAttribute('Target') || ''
    const rId    = rel.getAttribute('Id')
    if (type.endsWith('/slide')) {
      const m = target.match(/slide(\d+)\.xml$/)
      if (m) slideRidMap[parseInt(m[1], 10)] = rId
    }
  }

  console.log(`[injector] slideRidMap has ${Object.keys(slideRidMap).length} entries`)

  const entries = slides
    .map((slide, i) => {
      const n   = templateIdToSlideNum(slide.template_id)
      const rId = slideRidMap[n]
      if (!rId) {
        console.warn(`[injector] No rId for slide ${n} (${slide.template_id}) — slide will be omitted`)
        return null
      }
      return `<p:sldId id="${300 + i}" r:id="${rId}"/>`
    })
    .filter(Boolean)

  if (entries.length === 0) {
    console.error('[injector] No valid slide entries — presentation.xml not updated')
    return
  }

  console.log(`[injector] Writing ${entries.length} slides to presentation.xml`)

  let presXml = await zip.file('ppt/presentation.xml')?.async('string')
  if (!presXml) return

  const updated = presXml.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
    `<p:sldIdLst>${entries.join('')}</p:sldIdLst>`
  )
  zip.file('ppt/presentation.xml', updated)
}
