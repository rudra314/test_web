/**
 * build_embeddings.js
 *
 * Generates slide_embeddings.json from template_index.json
 * using @xenova/transformers (runs in Node.js via ESM).
 *
 * Usage:
 *   node --experimental-vm-modules scripts/setup/build_embeddings.js
 *
 * Prerequisites:
 *   - src/data/template_index.json must be populated (run generate_index.md first)
 *   - @xenova/transformers installed (already in package.json)
 *
 * Output:
 *   src/data/slide_embeddings.json — array of { id, vector }
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { pipeline, env } from '@xenova/transformers'

const ROOT = process.cwd()
const INDEX_PATH = resolve(ROOT, 'src/data/template_index.json')
const OUT_PATH = resolve(ROOT, 'src/data/slide_embeddings.json')

env.allowLocalModels = false
env.useBrowserCache = false

console.log('Loading sentence transformer model...')
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
  quantized: true,
})
console.log('Model loaded.')

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'))

if (!Array.isArray(index) || index.length === 0) {
  console.error('template_index.json is empty. Run generate_index.md first.')
  process.exit(1)
}

console.log(`Embedding ${index.length} slides...`)
const embeddings = []

for (const slide of index) {
  const text = [
    ...(slide.tags || []),
    ...(slide.type || []),
  ].join(' ')

  const output = await embedder(text, { pooling: 'mean', normalize: true })
  const vector = Array.from(output.data)

  embeddings.push({ id: slide.id, vector })
  process.stdout.write('.')
}

console.log('\nDone.')
writeFileSync(OUT_PATH, JSON.stringify(embeddings), 'utf-8')
console.log(`Saved ${embeddings.length} embeddings to ${OUT_PATH}`)
console.log('\nSetup complete! You can now run: npm run dev')
