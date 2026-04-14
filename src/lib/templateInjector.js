/**
 * templateInjector.js
 *
 * Opens the real template PPTX as a ZIP, modifies only the text content in
 * the matched template slides, reorders presentation.xml to show exactly the
 * slides the user requested, and returns a Blob ready for download.
 *
 * The visual design (colors, shapes, images, fonts, layouts) is 100% preserved
 * from the original PPTX — we only touch <a:t> text nodes.
 */

import JSZip from 'jszip'

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') || ''

// Namespace URIs used in PPTX XML
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

/**
 * Main entry point.
 * @param {string} deckType  — 'cap' | 'prop'
 * @param {Array}  slides    — Claude response slides: [{ template_id, title, bullets, body_text }]
 * @returns {Blob}  — ready to download as .pptx
 */
export async function injectIntoTemplate(deckType, slides) {
  const fileName = deckType === 'cap' ? 'capabilities.pptx' : 'proposal.pptx'
  const url = `${BASE}/templates/${fileName}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load template (${res.status}): ${url}`)
  const buf = await res.arrayBuffer()

  const zip = await JSZip.loadAsync(buf)

  // Step 1 — Modify text in each needed template slide (in-place in the ZIP)
  for (const slide of slides) {
    const slideNum = templateIdToSlideNum(slide.template_id)
    const path = `ppt/slides/slide${slideNum}.xml`
    const file = zip.file(path)
    if (!file) {
      console.warn(`[injector] Template slide not found: ${path} — skipping`)
      continue
    }
    const xml = await file.async('string')
    const content = resolveContent(slide)
    const modified = injectText(xml, slide.title, content)
    zip.file(path, modified)
  }

  // Step 2 — Rewrite presentation.xml so only our slides appear, in order
  await reorderPresentation(zip, slides)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "cap_042" → 42,  "prop_015" → 15 */
function templateIdToSlideNum(id) {
  const m = (id || '').match(/_(\d+)$/)
  return m ? parseInt(m[1], 10) : 1
}

/** Pick bullets array or split body_text into lines */
function resolveContent(slide) {
  if (Array.isArray(slide.bullets) && slide.bullets.length > 0) return slide.bullets
  if (typeof slide.body_text === 'string' && slide.body_text.trim()) {
    return slide.body_text.split('\n').filter(Boolean)
  }
  return []
}

// ─── XML text injection ───────────────────────────────────────────────────────

function injectText(slideXml, title, lines) {
  const doc = new DOMParser().parseFromString(slideXml, 'text/xml')

  // Collect all <p:sp> shapes
  const shapes = Array.from(doc.getElementsByTagNameNS(NS_P, 'sp'))

  let titleShape = null
  const bodyShapes = [] // { sp, idx }

  for (const sp of shapes) {
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

  // Sort body shapes by their idx so we fill left-to-right / top-to-bottom
  bodyShapes.sort((a, b) => a.idx - b.idx)

  // Replace title
  if (titleShape && title) {
    setShapeText(doc, titleShape, [title])
  }

  // Distribute content lines evenly across however many body placeholders exist
  if (bodyShapes.length > 0 && lines.length > 0) {
    const chunkSize = Math.ceil(lines.length / bodyShapes.length)
    bodyShapes.forEach(({ sp }, i) => {
      const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize)
      if (chunk.length > 0) setShapeText(doc, sp, chunk)
    })
  }

  return new XMLSerializer().serializeToString(doc)
}

/**
 * Replace all text inside a shape's <p:txBody> with `lines`.
 * Preserves the original run properties (<a:rPr>) and paragraph properties
 * (<a:pPr>) so font size, bold, color, etc. remain exactly as designed.
 */
function setShapeText(doc, sp, lines) {
  const txBody = sp.getElementsByTagNameNS(NS_A, 'txBody')[0]
  if (!txBody) return

  const existingParas = Array.from(txBody.getElementsByTagNameNS(NS_A, 'p'))
  if (existingParas.length === 0) return

  // Clone formatting from first paragraph so we can reuse it
  const firstPara = existingParas[0]
  const lastPara  = existingParas[existingParas.length - 1]
  const tmplPPr   = firstPara.getElementsByTagNameNS(NS_A, 'pPr')[0]?.cloneNode(true)
  const firstRun  = firstPara.getElementsByTagNameNS(NS_A, 'r')[0]
  const tmplRPr   = firstRun?.getElementsByTagNameNS(NS_A, 'rPr')[0]?.cloneNode(true)
  const tmplEndRPr = lastPara.getElementsByTagNameNS(NS_A, 'endParaRPr')[0]?.cloneNode(true)

  // Remove all existing paragraphs
  for (const p of existingParas) txBody.removeChild(p)

  // Add one paragraph per line, reusing the template formatting
  for (const line of lines) {
    const p = doc.createElementNS(NS_A, 'a:p')
    if (tmplPPr) p.appendChild(tmplPPr.cloneNode(true))

    const r = doc.createElementNS(NS_A, 'a:r')
    if (tmplRPr) r.appendChild(tmplRPr.cloneNode(true))

    const t = doc.createElementNS(NS_A, 'a:t')
    t.textContent = line
    r.appendChild(t)
    p.appendChild(r)
    txBody.appendChild(p)
  }

  // PowerPoint requires a trailing empty paragraph with endParaRPr
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

/**
 * Rewrites <p:sldIdLst> in presentation.xml so only the requested slides
 * appear, in the requested order. All other template files stay untouched.
 */
async function reorderPresentation(zip, slides) {
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')
  if (!relsXml) return

  // Parse rels to build: slideNumber → rId
  const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml')
  const relNodes = Array.from(relsDoc.getElementsByTagName('Relationship'))

  const slideRidMap = {} // { 1: 'rId2', 2: 'rId3', ... }
  for (const rel of relNodes) {
    const type   = rel.getAttribute('Type') || ''
    const target = rel.getAttribute('Target') || ''
    const rId    = rel.getAttribute('Id')
    if (type.endsWith('/slide')) {
      const m = target.match(/slide(\d+)\.xml$/)
      if (m) slideRidMap[parseInt(m[1], 10)] = rId
    }
  }

  // Build new <p:sldId> entries for each output slide
  const entries = slides
    .map((slide, i) => {
      const n   = templateIdToSlideNum(slide.template_id)
      const rId = slideRidMap[n]
      if (!rId) {
        console.warn(`[injector] No rId found for slide ${n} (${slide.template_id})`)
        return null
      }
      // id must be unique; start at 300 to avoid collisions
      return `<p:sldId id="${300 + i}" r:id="${rId}"/>`
    })
    .filter(Boolean)

  if (entries.length === 0) return

  // Replace the <p:sldIdLst> block in presentation.xml
  let presXml = await zip.file('ppt/presentation.xml')?.async('string')
  if (!presXml) return

  const updated = presXml.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
    `<p:sldIdLst>${entries.join('')}</p:sldIdLst>`
  )
  zip.file('ppt/presentation.xml', updated)
}
