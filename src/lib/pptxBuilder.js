/**
 * pptxBuilder.js — assemble a .pptx file from Claude's response using pptxgenjs
 *
 * Applies colors, fonts and layout from template_style.json so every slide
 * matches the brand even before full template XML setup is complete.
 *
 * Returns the pptxgen instance — call .writeFile({ fileName }) to download.
 */

import pptxgen from 'pptxgenjs'

// Strip '#' from hex color strings for pptxgenjs
function hex(color, fallback) {
  return (color || fallback).replace('#', '')
}

/**
 * @param {object} claudeResponse — { slides: [...] } from claudeApi
 * @param {Array}  parsedSlides   — raw slides from parser (always populated)
 * @param {object} formData       — form values
 * @param {object} options        — { confidentialityFooter: boolean }
 * @param {object} styleProfile   — from template_style.json
 */
export async function buildPptx(claudeResponse, parsedSlides, formData, options = {}, styleProfile = {}) {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Deck Generator'
  pptx.company = formData.customerName || 'Internal'
  pptx.subject = formData.deckType === 'cap' ? 'Capabilities & Services' : 'Project Proposal'
  pptx.title = formData.customerName
    ? `${formData.customerName} — ${pptx.subject}`
    : pptx.subject

  // ── Design tokens from template_style.json ───────────────────────────────
  const primaryColor = hex(styleProfile.primary_color, '#003366')
  const accentColor  = hex(styleProfile.accent_color,  '#FF6600')
  const headingFont  = styleProfile.heading_font || 'Calibri'
  const bodyFont     = styleProfile.body_font    || 'Calibri'
  const headingSize  = Math.min(Number(styleProfile.heading_size) || 24, 28)
  const bodySize     = Number(styleProfile.body_size) || 14

  // ── Source slides ─────────────────────────────────────────────────────────
  // Prefer Claude's response; fall back to raw parsed slides
  const claudeSlides = claudeResponse?.slides || []
  const sourceSlides = claudeSlides.length > 0
    ? claudeSlides
    : parsedSlides.map((ps, i) => ({
        slide_number: i + 1,
        title: ps.title,
        bullets: [],
        body_text: ps.body,
        speaker_notes: '',
      }))

  sourceSlides.forEach((slideData, idx) => {
    // Raw fallback for this slide (in case Claude returned empty body)
    const raw = parsedSlides[idx]

    const slide = pptx.addSlide()

    // ── Colored header band ───────────────────────────────────────────────
    // Use string 'rect' — pptxgenjs shape name, not ShapeType enum
    slide.addShape('rect', {
      x: 0, y: 0, w: 10, h: 1.2,
      fill: { color: primaryColor },
      line: { color: primaryColor },
    })

    // ── Accent rule below header ──────────────────────────────────────────
    slide.addShape('rect', {
      x: 0, y: 1.2, w: 10, h: 0.05,
      fill: { color: accentColor },
      line: { color: accentColor },
    })

    // ── Title (white text inside header) ─────────────────────────────────
    const title = slideData.title || raw?.title || `Slide ${idx + 1}`
    slide.addText(title, {
      x: 0.45, y: 0.14, w: 9.1, h: 0.92,
      fontSize: headingSize,
      bold: true,
      color: 'FFFFFF',
      fontFace: headingFont,
      valign: 'middle',
    })

    // ── Body content ─────────────────────────────────────────────────────
    // Priority: Claude bullets → Claude body_text → raw parsed body
    let bodyLines = []
    if (Array.isArray(slideData.bullets) && slideData.bullets.length > 0) {
      bodyLines = slideData.bullets
    } else if (typeof slideData.body_text === 'string' && slideData.body_text.trim()) {
      bodyLines = slideData.body_text.split('\n').filter(l => l.trim())
    } else if (raw?.body?.trim()) {
      bodyLines = raw.body.split('\n').filter(l => l.trim())
    }

    if (bodyLines.length > 0) {
      slide.addText(
        bodyLines.map(line => ({
          text: line.replace(/^[-*•]\s*/, '').trim(),
          options: { bullet: true },
        })),
        {
          x: 0.5,
          y: 1.38,
          w: 9.0,
          h: 5.1,
          fontSize: bodySize,
          color: '222222',
          fontFace: bodyFont,
          valign: 'top',
          paraSpaceAfter: 6,
        }
      )
    }

    // ── Slide number (bottom right) ───────────────────────────────────────
    slide.addText(String(idx + 1), {
      x: 8.8, y: 6.88, w: 0.9, h: 0.32,
      fontSize: 9,
      color: 'AAAAAA',
      align: 'right',
      fontFace: bodyFont,
    })

    // ── Confidentiality footer (bottom left) ──────────────────────────────
    if (options.confidentialityFooter) {
      slide.addText('Confidential — for discussion purposes only', {
        x: 0.3, y: 6.88, w: 7.5, h: 0.32,
        fontSize: 8,
        color: 'AAAAAA',
        fontFace: bodyFont,
      })
    }

    // ── Speaker notes ─────────────────────────────────────────────────────
    if (slideData.speaker_notes) {
      slide.addNotes(slideData.speaker_notes)
    }
  })

  return pptx
}
