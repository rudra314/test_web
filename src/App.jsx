import React, { useState, useCallback } from 'react'
import DeckForm from './components/DeckForm.jsx'
import LayoutReport from './components/LayoutReport.jsx'
import DownloadScreen from './components/DownloadScreen.jsx'
import { parseSlides } from './lib/parser.js'
import { preFilter } from './lib/matcher.js'
import templateIndex from './data/template_index.json'
import slideEmbeddings from './data/slide_embeddings.json'

const SCREENS = { FORM: 'form', REPORT: 'report', DOWNLOAD: 'download' }

const defaultFormData = {
  deckType: 'cap',
  customerName: '',
  industry: '',
  audience: '',
  meetingType: '',
  projectName: '',
  engagementType: '',
  timeline: '',
  budget: '',
  density: 'balanced',
  customerContext: '',
  slideContent: '',
  improvement: 'balanced',
  speakerNotes: 'generate',
  confidentialityFooter: true,
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.FORM)
  const [formData, setFormData] = useState(defaultFormData)
  const [reportData, setReportData] = useState(null)
  const [parsedSlides, setParsedSlides] = useState([])
  const [candidates, setCandidates] = useState([])

  const STORAGE_KEY = 'deckgen_previous'

  const handleLoadPrevious = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setFormData(JSON.parse(saved))
    } catch {}
  }, [])

  const handleGenerate = useCallback(async (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    setFormData(data)

    const slides = parseSlides(data.slideContent)
    setParsedSlides(slides)

    // preFilter handles all cases: semantic, keyword, or stub fallback
    const matchCandidates = await preFilter(slides, slideEmbeddings, templateIndex)
    setCandidates(matchCandidates)

    const report = slides.map((slide, i) => ({
      slide_number: i + 1,
      title: slide.title,
      template_id: matchCandidates[i]?.[0]?.id || templateIndex[0]?.id || 'slide_001',
      confidence: matchCandidates[i]?.[0]?.score || 0.5,
      content_fit: 'Fits',
      content_fit_detail: '',
      candidates: matchCandidates[i] || [],
    }))
    setReportData(report)
    setScreen(SCREENS.REPORT)
  }, [])

  const handleBuildDeck = useCallback((updatedReport) => {
    setReportData(updatedReport)
    setScreen(SCREENS.DOWNLOAD)
  }, [])

  const handleReset = useCallback(() => {
    setFormData(defaultFormData)
    setReportData(null)
    setParsedSlides([])
    setCandidates([])
    setScreen(SCREENS.FORM)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {screen === SCREENS.FORM && (
        <DeckForm
          formData={formData}
          onChange={setFormData}
          onGenerate={handleGenerate}
          onLoadPrevious={handleLoadPrevious}
        />
      )}
      {screen === SCREENS.REPORT && (
        <LayoutReport
          reportData={reportData}
          templateIndex={templateIndex}
          onBack={() => setScreen(SCREENS.FORM)}
          onBuild={handleBuildDeck}
        />
      )}
      {screen === SCREENS.DOWNLOAD && (
        <DownloadScreen
          formData={formData}
          reportData={reportData}
          parsedSlides={parsedSlides}
          candidates={candidates}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
