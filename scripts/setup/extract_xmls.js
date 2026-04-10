/**
 * extract_xmls.js
 *
 * Unpacks a master .pptx file → individual slide XMLs + slot_map.json
 *
 * Usage:
 *   node scripts/setup/extract_xmls.js path/to/master.pptx
 *
 * Outputs:
 *   slides/slide_NNN.xml  (one file per slide)
 *   src/data/slot_map.json
 *
 * Requires: npm install jszip (run once, not a project dependency)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import JSZip from 'jszip'

const pptxPath = process.argv[2]
if (!pptxPath) {
  console.error('Usage: node scripts/setup/extract_xmls.js path/to/master.pptx')
  process.exit(1)
}

const ROOT = resolve(process.cwd())
const SLIDES_DIR = join(ROOT, 'slides')
const SLOT_MAP_OUT = join(ROOT, 'src/data/slot_map.json')

mkdirSync(SLIDES_DIR, { recursive: true })

const buffer = readFileSync(resolve(pptxPath))
const zip = await JSZip.loadAsync(buffer)

const slideFiles = Object.keys(zip.files)
  .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  .sort()

console.log(`Found ${slideFiles.length} slides`)

const slotMap = {}

for (const filePath of slideFiles) {
  const xml = await zip.files[filePath].async('string')

  // Extract slide number from filename: ppt/slides/slide3.xml → 3
  const match = filePath.match(/slide(\d+)\.xml$/)
  if (!match) continue
  const num = parseInt(match[1], 10)
  const id = `slide_${String(num).padStart(3, '0')}`

  // Save XML
  const outPath = join(SLIDES_DIR, `${id}.xml`)
  writeFileSync(outPath, xml, 'utf-8')
  console.log(`  Saved ${id}.xml`)

  // Extract slot information from text boxes
  const slots = extractSlots(xml)
  slotMap[id] = slots
}

writeFileSync(SLOT_MAP_OUT, JSON.stringify(slotMap, null, 2), 'utf-8')
console.log(`\nSlot map saved to ${SLOT_MAP_OUT}`)
console.log('Done. Next: run build_embeddings.js')

/**
 * Parse the slide XML to extract text frame slots and estimate max_chars
 */
function extractSlots(xml) {
  // Find all <p:sp> (shape) elements containing <p:txBody>
  const shapeMatches = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)]

  const slots = []

  for (const shapeMatch of shapeMatches) {
    const shapeXml = shapeMatch[1]

    // Skip if no text body
    if (!shapeXml.includes('<p:txBody>')) continue

    // Check if it's a placeholder (content slot) vs decorative element
    const isPlaceholder = /<p:ph/.test(shapeXml)

    // Extract position and size from <p:spPr><a:xfrm>
    const xfrmMatch = shapeXml.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)
    let widthEmu = 6000000  // default ~6 inches
    let heightEmu = 1000000

    if (xfrmMatch) {
      const extMatch = xfrmMatch[1].match(/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
      if (extMatch) {
        widthEmu = parseInt(extMatch[1], 10)
        heightEmu = parseInt(extMatch[2], 10)
      }
    }

    // Extract font size from <a:rPr sz="NNN"> (hundredths of points)
    const fontMatch = shapeXml.match(/sz="(\d+)"/)
    const fontSizePt = fontMatch ? parseInt(fontMatch[1], 10) / 100 : 18

    // Approximate max chars: (width in inches) * chars_per_inch, * lines
    const widthInches = widthEmu / 914400
    const heightInches = heightEmu / 914400
    const charsPerLine = Math.floor(widthInches * (96 / fontSizePt) * 1.8)
    const linesPerSlot = Math.floor(heightInches * 72 / (fontSizePt * 1.4))
    const maxChars = Math.max(50, charsPerLine * linesPerSlot)

    slots.push({
      is_placeholder: isPlaceholder,
      width_emu: widthEmu,
      height_emu: heightEmu,
      font_size_pt: fontSizePt,
      max_chars: maxChars,
      bullet_max: Math.max(3, Math.floor(linesPerSlot)),
    })
  }

  return {
    slot_count: slots.filter((s) => s.is_placeholder).length || slots.length,
    slots,
    max_chars: slots.reduce((sum, s) => sum + s.max_chars, 0),
  }
}
