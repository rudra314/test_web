/**
 * pptxBuilder.js — assemble a .pptx file from Claude's response using pptxgenjs
 *
 * Layout engine:
 *  - 3–9 short items  → card grid (3 cols for 3/6/9 items, else 2 cols)
 *  - Everything else  → branded bullet list
 *
 * Design tokens come from template_style.json.
 */

import pptxgen from 'pptxgenjs'

function hex(color, fallback) {
  return (color || fallback).replace('#', '')
}

// Strip "pt" suffix before Number() — handles "36pt" or plain 36
function parsePt(val, fallback) {
  const n = Number(String(val || '').replace(/pt$/i, '').trim())
  return isNaN(n) || n === 0 ? fallback : n
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

  const primaryColor   = hex(styleProfile.primary_color,   '#0070C0')
  const accentColor    = hex(styleProfile.accent_color,    '#E97132')
  const secondaryColor = hex(styleProfile.secondary_color, '#0A2342')
  const headingFont    = styleProfile.heading_font || 'Calibri'
  const bodyFont       = styleProfile.body_font    || 'Calibri'
  const headingSize    = Math.min(parsePt(styleProfile.heading_size, 24), 32)
  const bodySize       = parsePt(styleProfile.body_size, 12)

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

    // ── Slide background (very light tint on content area) ────────────────
    slide.addShape('rect', {
      x: 0, y: 1.19, w: 10, h: 6.31,
      fill: { color: 'F7F9FC' },
      line: { color: 'F7F9FC' },
    })

    // ── Colored header band ───────────────────────────────────────────────
    slide.addShape('rect', {
      x: 0, y: 0, w: 10, h: 1.15,
      fill: { color: primaryColor },
      line: { color: primaryColor },
    })

    // ── Accent stripe below header ────────────────────────────────────────
    slide.addShape('rect', {
      x: 0, y: 1.15, w: 10, h: 0.06,
      fill: { color: accentColor },
      line: { color: accentColor },
    })

    // ── Title ─────────────────────────────────────────────────────────────
    const title = slideData.title || raw?.title || `Slide ${idx + 1}`
    slide.addText(title, {
      x: 0.4, y: 0.1, w: 9.2, h: 0.95,
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
    const layout = chooseLayout(cleanLines)
    if (layout.useCards) {
      renderCards(slide, cleanLines, bodyFont, bodySize, primaryColor, accentColor, layout.cols)
    } else {
      renderBullets(slide, cleanLines, bodyFont, bodySize, primaryColor)
    }

    // ── Slide number ──────────────────────────────────────────────────────
    slide.addText(String(idx + 1), {
      x: 8.8, y: 7.05, w: 0.9, h: 0.25,
      fontSize: 9, color: 'AAAAAA', align: 'right', fontFace: bodyFont,
    })

    // ── Confidentiality footer ────────────────────────────────────────────
    if (options.confidentialityFooter) {
      slide.addText('Confidential — for discussion purposes only', {
        x: 0.3, y: 7.05, w: 7.5, h: 0.25,
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

function chooseLayout(lines) {
  const n = lines.length
  // Too few or too many items → bullets
  if (n < 3 || n > 9) return { useCards: false }
  // Long-form paragraphs → bullets (avg line > 120 chars means prose, not list items)
  const avgLen = lines.reduce((s, l) => s + l.length, 0) / n
  if (avgLen > 120) return { useCards: false }
  // 3-col for counts cleanly divisible by 3, else 2-col
  const cols = n % 3 === 0 ? 3 : 2
  return { useCards: true, cols }
}

// ─── Card layout ─────────────────────────────────────────────────────────────
// Renders a 2-col or 3-col grid of rounded cards matching the brand style.
// Items that contain a "Title — Description" separator get a two-part card;
// plain items render as a titled card with no body text.

function renderCards(slide, lines, bodyFont, bodySize, primaryColor, accentColor, cols) {
  const rows    = Math.ceil(lines.length / cols)
  const startX  = 0.3
  const startY  = 1.28
  const gapX    = 0.15
  const gapY    = 0.12
  const totalW  = 9.4
  const totalH  = 5.72   // content area height (above footer)
  const cardW   = (totalW - (cols - 1) * gapX) / cols
  const cardH   = (totalH - (rows - 1) * gapY) / rows
  // Brand spec: ~8pt corner radius ≈ 0.11in
  const radius  = 0.11
  const badgeW  = 0.44
  const padV    = 0.08
  const padH    = 0.09

  lines.forEach((line, i) => {
    if (i >= cols * rows) return
    const col = i % cols
    const row = Math.floor(i / cols)
    const x   = startX + col * (cardW + gapX)
    const y   = startY + row * (cardH + gapY)

    // ── Card background (brand: #E7F0F7 light blue tint) ─────────────────
    slide.addShape('roundRect', {
      x, y, w: cardW, h: cardH,
      fill: { color: 'E7F0F7' },
      line: { color: primaryColor, width: 0.6 },
      rectRadius: radius,
    })

    // ── Number badge (accent orange per brand rule for numbered steps) ────
    slide.addShape('roundRect', {
      x: x + padH, y: y + padV,
      w: badgeW, h: cardH - padV * 2,
      fill: { color: accentColor },
      line: { color: accentColor },
      rectRadius: 0.06,
    })
    slide.addText(String(i + 1), {
      x: x + padH, y: y + padV,
      w: badgeW, h: cardH - padV * 2,
      fontSize: cols === 3 ? 14 : 16,
      bold: true, color: 'FFFFFF',
      fontFace: bodyFont, align: 'center', valign: 'middle',
    })

    // ── Parse optional "Title — Description" ─────────────────────────────
    const sepIdx   = line.search(/\s[—\-:]\s/)
    const cardTitle = sepIdx > -1 ? line.slice(0, sepIdx).trim() : line.trim()
    const cardBody  = sepIdx > -1 ? line.slice(sepIdx).replace(/^\s*[—\-:]\s*/, '').trim() : ''

    const textX  = x + padH + badgeW + 0.1
    const textW  = cardW - padH - badgeW - 0.14
    const titleH = cardBody ? cardH * 0.4 : cardH - padV * 2
    const titleSize = cols === 3
      ? Math.max(9, bodySize - 1)
      : Math.max(10, bodySize)

    // ── Card title ────────────────────────────────────────────────────────
    slide.addText(cardTitle, {
      x: textX, y: y + padV,
      w: textW, h: titleH,
      fontSize: titleSize, bold: true,
      color: primaryColor,
      fontFace: bodyFont, valign: 'middle',
      wrap: true,
    })

    // ── Card body (description after separator) ───────────────────────────
    if (cardBody) {
      slide.addText(cardBody, {
        x: textX, y: y + padV + titleH,
        w: textW, h: cardH - padV - titleH - padV,
        fontSize: Math.max(8, titleSize - 1.5),
        color: '444444',
        fontFace: bodyFont, valign: 'top',
        wrap: true,
      })
    }
  })
}

// ─── Bullet layout ────────────────────────────────────────────────────────────
// Uses branded colored bullets (filled circle in primary blue).

function renderBullets(slide, lines, bodyFont, bodySize, primaryColor) {
  slide.addText(
    lines.map(line => ({
      text: line,
      options: {
        bullet: { code: '25CF', color: primaryColor },
        paraSpaceAfter: 8,
      },
    })),
    {
      x: 0.45, y: 1.32, w: 9.1, h: 5.6,
      fontSize: bodySize,
      color: '1A1A2E',
      fontFace: bodyFont,
      valign: 'top',
      lineSpacingMultiple: 1.15,
    }
  )
}
