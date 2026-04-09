/**
 * pptxBuilder.js — assemble a .pptx file from Claude's response using pptxgenjs
 *
 * Returns the pptxgen instance (call .writeFile() to download).
 */

import pptxgen from 'pptxgenjs'

/**
 * Build the PPTX from Claude's response.
 *
 * @param {object} claudeResponse — { slides: [...] }
 * @param {Array}  parsedSlides — from parser.parseSlides() (raw user content)
 * @param {object} formData — form values
 * @param {object} options — { confidentialityFooter: boolean }
 * @returns {pptxgen} pptx instance — call .writeFile({ fileName }) to download
 */
export async function buildPptx(claudeResponse, parsedSlides, formData, options = {}) {
  const pptx = new pptxgen()

  // Set presentation metadata
  pptx.author = 'Deck Generator'
  pptx.company = formData.customerName || 'Internal'
  pptx.subject = formData.deckType === 'cap' ? 'Capabilities & Services' : 'Project Proposal'
  pptx.title = formData.customerName
    ? `${formData.customerName} — ${pptx.subject}`
    : pptx.subject

  // Default slide dimensions (widescreen 16:9)
  pptx.layout = 'LAYOUT_16x9'

  const slides = claudeResponse?.slides || []

  // Fallback: if Claude returned nothing, build from parsed slides
  const sourceSlides = slides.length > 0 ? slides : parsedSlides.map((ps, i) => ({
    slide_number: i + 1,
    title: ps.title,
    bullets: ps.body.split('\n').filter((l) => l.trim()),
    body_text: ps.body,
    template_id: 'fallback',
    confidence: 0.5,
    content_fit: 'Fits',
    speaker_notes: '',
  }))

  sourceSlides.forEach((slideData, idx) => {
    const slide = pptx.addSlide()

    // ── Title ──
    slide.addText(slideData.title || `Slide ${idx + 1}`, {
      x: 0.5,
      y: 0.4,
      w: '85%',
      h: 0.8,
      fontSize: 24,
      bold: true,
      color: '003366',
      fontFace: 'Calibri',
    })

    // ── Body content ──
    const bullets = slideData.bullets && slideData.bullets.length > 0
      ? slideData.bullets
      : (slideData.body_text || '').split('\n').filter((l) => l.trim())

    if (bullets.length > 0) {
      // Render as bullet list
      slide.addText(
        bullets.map((b) => ({ text: b.replace(/^[-*•]\s*/, '').trim(), options: { bullet: true } })),
        {
          x: 0.5,
          y: 1.4,
          w: '90%',
          h: 4.0,
          fontSize: 16,
          color: '212529',
          fontFace: 'Calibri',
          valign: 'top',
        }
      )
    } else if (slideData.body_text) {
      slide.addText(slideData.body_text, {
        x: 0.5,
        y: 1.4,
        w: '90%',
        h: 4.0,
        fontSize: 16,
        color: '212529',
        fontFace: 'Calibri',
        valign: 'top',
      })
    }

    // ── Slide number (bottom right, always on) ──
    slide.addText(String(idx + 1), {
      x: '88%',
      y: '91%',
      w: '10%',
      h: '6%',
      fontSize: 10,
      color: '888888',
      align: 'right',
      fontFace: 'Calibri',
    })

    // ── Confidentiality footer ──
    if (options.confidentialityFooter) {
      slide.addText('Confidential — for discussion purposes only', {
        x: '3%',
        y: '91%',
        w: '70%',
        h: '6%',
        fontSize: 8,
        color: 'AAAAAA',
        fontFace: 'Calibri',
      })
    }

    // ── Speaker notes ──
    if (slideData.speaker_notes) {
      slide.addNotes(slideData.speaker_notes)
    }
  })

  return pptx
}
