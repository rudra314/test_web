/**
 * pptxBuilder.js — assemble a .pptx file from Claude's response using pptxgenjs
 *
 * Smart layout engine:
 *  - 4–10 items that follow "Title — description" pattern → 2-column numbered cards
 *  - Everything else → clean bullet list
 *
 * Design tokens come from template_style.json.
 */

import pptxgen from 'pptxgenjs'

function hex(color, fallback) {
  return (color || fallback).replace('#', '')
}

export async function buildPptx(claudeResponse, parsedSlides, formData, options = {}, styleProfile = {}) {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Deck Generator'
  pptx.company = formData.customerName || 'Internal'
  pptx.subject = formData.deckType === 'cap' ? 'Capabilities & Services' : 'Project Proposal'
  pptx.title = formData.customerName
    ? `${formData.customerName} — ${pptx.subject}`
    : pptx.subject

  const primaryColor   = hex(styleProfile.primary_color,   '#003366')
  const accentColor    = hex(styleProfile.accent_color,    '#FF6600')
  const secondaryColor = hex(styleProfile.secondary_color, '#003366')
  const headingFont    = styleProfile.heading_font || 'Calibri'
  const bodyFont       = styleProfile.body_font    || 'Calibri'

  // Font sizes may be stored as "36pt" or as numbers — strip "pt" before parsing
  const parsePt = (val, fallback) => {
    const n = Number(String(val || '').replace(/pt$/i, '').trim())
    return isNaN(n) || n === 0 ? fallback : n
  }
  const headingSize = Math.min(parsePt(styleProfile.heading_size, 24), 32)
  const bodySize    = parsePt(styleProfile.body_size, 12)

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
    const raw = parsedSlides[idx]
    const slide = pptx.addSlide()

    // ── Colored header band ───────────────────────────────────────────────
    slide.addShape('rect', {
      x: 0, y: 0, w: 10, h: 1.15,
      fill: { color: primaryColor },
      line: { color: primaryColor },
    })

    // ── Accent rule below header ──────────────────────────────────────────
    slide.addShape('rect', {
      x: 0, y: 1.15, w: 10, h: 0.04,
      fill: { color: accentColor },
      line: { color: accentColor },
    })

    // ── Title ─────────────────────────────────────────────────────────────
    const title = slideData.title || raw?.title || `Slide ${idx + 1}`
    slide.addText(title, {
      x: 0.4, y: 0.12, w: 9.2, h: 0.9,
      fontSize: headingSize,
      bold: true,
      color: 'FFFFFF',
      fontFace: headingFont,
      valign: 'middle',
    })

    // ── Resolve body lines ────────────────────────────────────────────────
    let bodyLines = []
    if (Array.isArray(slideData.bullets) && slideData.bullets.length > 0) {
      bodyLines = slideData.bullets
    } else if (typeof slideData.body_text === 'string' && slideData.body_text.trim()) {
      bodyLines = slideData.body_text.split('\n').filter(l => l.trim())
    } else if (raw?.body?.trim()) {
      bodyLines = raw.body.split('\n').filter(l => l.trim())
    }

    // Clean bullet markers
    const cleanLines = bodyLines.map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)

    // ── Choose and render layout ──────────────────────────────────────────
    if (shouldUseCardLayout(cleanLines)) {
      renderCards(slide, cleanLines, bodyFont, primaryColor, secondaryColor)
    } else {
      renderBullets(slide, cleanLines, bodyFont, bodySize)
    }

    // ── Slide number ──────────────────────────────────────────────────────
    slide.addText(String(idx + 1), {
      x: 8.8, y: 6.9, w: 0.9, h: 0.3,
      fontSize: 9, color: 'AAAAAA', align: 'right', fontFace: bodyFont,
    })

    // ── Confidentiality footer ────────────────────────────────────────────
    if (options.confidentialityFooter) {
      slide.addText('Confidential — for discussion purposes only', {
        x: 0.3, y: 6.9, w: 7.5, h: 0.3,
        fontSize: 8, color: 'AAAAAA', fontFace: bodyFont,
      })
    }

    if (slideData.speaker_notes) {
      slide.addNotes(slideData.speaker_notes)
    }
  })

  return pptx
}

// ─── Layout detection ─────────────────────────────────────────────────────────

function shouldUseCardLayout(lines) {
  if (lines.length < 4 || lines.length > 10) return false
  // More than half the lines contain a separator (— or - or :) indicating "title — body"
  const withSep = lines.filter(l => /\s[—\-:]\s/.test(l)).length
  return withSep >= Math.ceil(lines.length * 0.5)
}

// ─── Card layout (2-column numbered grid) ────────────────────────────────────

function renderCards(slide, lines, bodyFont, primaryColor, secondaryColor) {
  const cols     = 2
  const rows     = Math.ceil(lines.length / cols)
  const startX   = 0.3
  const startY   = 1.27
  const gapX     = 0.18
  const gapY     = 0.14
  const totalW   = 9.4
  const totalH   = 5.85   // 7.5 - 1.27 header area - 0.38 footer
  const cardW    = (totalW - (cols - 1) * gapX) / cols
  const cardH    = (totalH - (rows - 1) * gapY) / rows
  const badgeW   = 0.48
  const badgePad = 0.07

  lines.forEach((line, i) => {
    if (i >= cols * rows) return
    const col = i % cols
    const row = Math.floor(i / cols)
    const x   = startX + col * (cardW + gapX)
    const y   = startY + row * (cardH + gapY)

    // Card background
    slide.addShape('roundRect', {
      x, y, w: cardW, h: cardH,
      fill: { color: 'E7F0F7' },
      line: { color: primaryColor, width: 0.5 },
      rectRadius: 0.05,
    })

    // Number badge
    slide.addShape('rect', {
      x: x + badgePad, y: y + badgePad,
      w: badgeW, h: cardH - badgePad * 2,
      fill: { color: primaryColor },
      line: { color: primaryColor },
    })
    slide.addText(String(i + 1).padStart(2, '0'), {
      x: x + badgePad, y: y + badgePad,
      w: badgeW, h: cardH - badgePad * 2,
      fontSize: 13, bold: true, color: 'FFFFFF',
      fontFace: bodyFont, align: 'center', valign: 'middle',
    })

    // Parse "Title — Description" split
    const sepIdx = line.search(/\s[—\-:]\s/)
    const cardTitle = sepIdx > -1 ? line.slice(0, sepIdx).trim() : line.trim()
    const cardBody  = sepIdx > -1 ? line.slice(sepIdx).replace(/^\s*[—\-:]\s*/, '').trim() : ''

    const textX = x + badgePad + badgeW + 0.1
    const textW = cardW - badgePad - badgeW - 0.15
    const titleH = cardBody ? cardH * 0.42 : cardH - badgePad * 2

    // Card title
    slide.addText(cardTitle, {
      x: textX, y: y + badgePad,
      w: textW, h: titleH,
      fontSize: 9.5, bold: true,
      color: primaryColor,
      fontFace: bodyFont, valign: 'middle',
    })

    // Card body
    if (cardBody) {
      slide.addText(cardBody, {
        x: textX, y: y + badgePad + titleH,
        w: textW, h: cardH - badgePad - titleH - badgePad,
        fontSize: 8.5, color: '333333',
        fontFace: bodyFont, valign: 'top',
      })
    }
  })
}

// ─── Bullet layout ────────────────────────────────────────────────────────────

function renderBullets(slide, lines, bodyFont, bodySize) {
  slide.addText(
    lines.map(line => ({
      text: line,
      options: { bullet: true },
    })),
    {
      x: 0.5, y: 1.27, w: 9.0, h: 5.85,
      fontSize: bodySize,
      color: '222222',
      fontFace: bodyFont,
      valign: 'top',
      paraSpaceBefore: 0,
      paraSpaceAfter: 5,
    }
  )
}
