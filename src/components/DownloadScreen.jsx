import React, { useState, useEffect, useRef } from 'react'
import { generateDeck } from '../lib/claudeApi.js'
import { buildPptx } from '../lib/pptxBuilder.js'
import templateStyle from '../data/template_style.json'
import slotMap from '../data/slot_map.json'

const STAGES = [
  { key: 'claude', label: 'Sending content to Claude...', duration: 8000 },
  { key: 'parse', label: 'Parsing Claude response...', duration: 2000 },
  { key: 'build', label: 'Assembling slide deck...', duration: 5000 },
  { key: 'done', label: 'Done!', duration: 0 },
]

const s = {
  page: {
    maxWidth: 600,
    margin: '80px auto',
    padding: '0 24px',
    textAlign: 'center',
  },
  card: {
    background: '#fff',
    border: '1.5px solid #e9ecef',
    borderRadius: 12,
    padding: '40px 32px',
  },
  h1: { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6c757d', marginBottom: 32 },
  progressTrack: {
    background: '#e9ecef',
    borderRadius: 8,
    height: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  stageLabel: { fontSize: 13, color: '#495057', marginBottom: 32 },
  btnPrimary: {
    padding: '12px 32px',
    border: 'none',
    borderRadius: 8,
    background: '#0d6efd',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#fff',
    marginBottom: 16,
    display: 'block',
    width: '100%',
  },
  btnSecondary: {
    padding: '10px 24px',
    border: '1.5px solid #dee2e6',
    borderRadius: 8,
    background: '#fff',
    fontSize: 14,
    color: '#495057',
    cursor: 'pointer',
    fontWeight: 500,
    display: 'block',
    width: '100%',
    marginTop: 12,
  },
  errorBox: {
    background: '#f8d7da',
    border: '1px solid #f1aeb5',
    borderRadius: 8,
    padding: '16px',
    color: '#842029',
    fontSize: 13,
    textAlign: 'left',
    marginBottom: 24,
  },
  successIcon: { fontSize: 48, marginBottom: 16 },
}

export default function DownloadScreen({ formData, reportData, parsedSlides, candidates, onReset }) {
  const [stageIdx, setStageIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [pptxReady, setPptxReady] = useState(false)
  const hasRun = useRef(false)
  const pptxRef = useRef(null)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true
    runPipeline()
  }, [])

  async function runPipeline() {
    try {
      setStageIdx(0)
      setProgress(10)

      // Build matched XMLs map (placeholder: empty since no real template XMLs)
      const matchedXmls = {}
      reportData.forEach((row) => {
        matchedXmls[row.template_id] = ''
      })

      setProgress(20)

      let claudeResponse
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

      if (apiKey && reportData.length > 0) {
        claudeResponse = await generateDeck(
          formData,
          parsedSlides,
          candidates,
          matchedXmls,
          slotMap,
          templateStyle
        )
      } else {
        // Fallback: build from parsed slides without Claude
        claudeResponse = {
          slides: parsedSlides.map((slide, i) => ({
            slide_number: i + 1,
            title: slide.title,
            template_id: reportData[i]?.template_id || 'slide_001',
            confidence: reportData[i]?.confidence || 0.5,
            content_fit: 'Fits',
            content_fit_detail: '',
            xml: '',
          }))
        }
      }

      setStageIdx(1)
      setProgress(60)

      await new Promise((r) => setTimeout(r, 300))

      setStageIdx(2)
      setProgress(80)

      const pptx = await buildPptx(claudeResponse, parsedSlides, formData, {
        confidentialityFooter: formData.confidentialityFooter,
      })
      pptxRef.current = pptx

      setProgress(100)
      setStageIdx(3)
      setPptxReady(true)
      setDone(true)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'An unexpected error occurred. Please try again.')
    }
  }

  const handleDownload = async () => {
    if (!pptxRef.current) return
    const date = new Date().toISOString().slice(0, 10)
    const customerSafe = (formData.customerName || 'Customer').replace(/\s+/g, '_')
    const typeSafe = formData.deckType === 'cap' ? 'Capabilities' : 'Proposal'
    const fileName = `${customerSafe}_${typeSafe}_${date}.pptx`
    await pptxRef.current.writeFile({ fileName })
  }

  const currentStageLabel = STAGES[Math.min(stageIdx, STAGES.length - 1)]?.label

  return (
    <div style={s.page}>
      <div style={s.card}>
        {!done && !error && (
          <>
            <div style={s.h1}>Building your deck</div>
            <div style={s.subtitle}>
              {formData.deckType === 'cap' ? 'Capabilities' : 'Proposal'} deck
              {formData.customerName ? ` · ${formData.customerName}` : ''}
            </div>
            <div style={s.progressTrack}>
              <div
                style={{
                  height: '100%',
                  background: '#0d6efd',
                  borderRadius: 8,
                  width: `${progress}%`,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <div style={s.stageLabel}>{currentStageLabel}</div>
            <AnimatedDots />
          </>
        )}

        {error && (
          <>
            <div style={s.h1}>Something went wrong</div>
            <div style={{ ...s.errorBox, marginTop: 16 }}>
              <strong>Error:</strong> {error}
            </div>
            <button style={s.btnSecondary} onClick={onReset}>Start over</button>
          </>
        )}

        {done && pptxReady && (
          <>
            <div style={s.successIcon}>✓</div>
            <div style={s.h1}>Your deck is ready</div>
            <div style={s.subtitle}>
              {parsedSlides.length} slide{parsedSlides.length !== 1 ? 's' : ''} assembled ·{' '}
              {formData.deckType === 'cap' ? 'Capabilities' : 'Proposal'} deck
            </div>
            <button style={s.btnPrimary} onClick={handleDownload}>
              Download .pptx
            </button>
            <button style={s.btnSecondary} onClick={onReset}>
              Start a new deck
            </button>
          </>
        )}
      </div>

      {/* Slide summary */}
      {done && reportData && (
        <div style={{ marginTop: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 8, paddingLeft: 4 }}>Slides included</div>
          {reportData.map((row, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #e9ecef',
                borderRadius: 6,
                padding: '8px 14px',
                marginBottom: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span>
                <span style={{ color: '#adb5bd', marginRight: 10, fontWeight: 600 }}>{i + 1}</span>
                {row.title}
              </span>
              <span style={{ fontSize: 11, color: '#adb5bd', fontFamily: 'monospace' }}>{row.template_id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AnimatedDots() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const t = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '.' : d + '.'))
    }, 500)
    return () => clearInterval(t)
  }, [])
  return <div style={{ fontSize: 24, color: '#adb5bd', letterSpacing: 4 }}>{dots}</div>
}
