/**
 * embeddings.js — browser-side text embedding via transformers.js
 * Uses a lightweight sentence-transformer model loaded from HuggingFace CDN.
 */

let pipeline = null
let pipelineLoading = null

async function getEmbedder() {
  if (pipeline) return pipeline
  if (pipelineLoading) return pipelineLoading

  // Lazy import to avoid Vite pre-bundling issues
  pipelineLoading = (async () => {
    const { pipeline: createPipeline, env } = await import('@xenova/transformers')
    // Use local cache if available, else CDN
    env.allowLocalModels = false
    const p = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    })
    pipeline = p
    return p
  })()

  return pipelineLoading
}

/**
 * Embed a single string → Float32Array
 */
export async function embed(text) {
  const embedder = await getEmbedder()
  const output = await embedder(text, { pooling: 'mean', normalize: true })
  // output.data is a Float32Array
  return Array.from(output.data)
}

/**
 * Cosine similarity between two vectors (arrays of numbers)
 */
export function cosineSim(a, b) {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
