import React, { useMemo } from 'react'
import { parseSlides } from '../lib/parser.js'

const INDUSTRIES = [
  'Banking & financial services',
  'Insurance',
  'Healthcare & life sciences',
  'Manufacturing & industrial',
  'Retail & consumer',
  'Technology & SaaS',
  'Government & public sector',
  'Energy & utilities',
  'Telecom & media',
]

const AUDIENCES = ['C-suite', 'Board', 'VP', 'Director', 'IT', 'Technical', 'Procurement', 'Mixed']
const MEETING_TYPES = ['Live presentation', 'Leave-behind', 'Email', 'Demo', 'Workshop']
const DENSITIES = ['Sparse', 'Balanced', 'Dense']
const ENGAGEMENT_TYPES = [
  'Assessment / advisory',
  'Proof of concept',
  'Fixed-scope implementation',
  'Managed service',
  'Multi-phase programme',
]
const IMPROVEMENTS = [
  { value: 'balanced', label: 'Balanced — refine phrasing, fit to slot' },
  { value: 'minimal', label: 'Minimal — only fix what overflows' },
  { value: 'polish', label: 'Polish — rewrite for impact' },
]
const SPEAKER_NOTES = [
  { value: 'generate', label: 'Generate' },
  { value: 'skip', label: 'Skip' },
]

const CAP_EXAMPLE = `## Company overview
Founded in 2010, we are a 500-person technology consultancy specialising in data, cloud, and AI.

## Our core services
- Cloud migration & modernisation
- Data platform engineering
- AI & machine learning solutions
- Managed services & support

## Why clients choose us
We combine deep technical expertise with sector knowledge to deliver outcomes, not just outputs.`

const PROP_EXAMPLE = `## Background
Tata Motors has been running a fragmented data landscape across 12 business units, creating reporting delays and inconsistent metrics.

## Problem statement
Manual reconciliation of data from siloed systems is costing the analytics team 3 days per reporting cycle and introducing errors.

## Solution approach
We propose a unified data platform on Azure, ingesting from all source systems into a governed lakehouse.

## Methodology
Agile delivery in two-week sprints, with a dedicated pod of 6 engineers and a client product owner.

## Implementation plan
Phase 1: Discovery & architecture (4 weeks). Phase 2: Build & migrate (8 weeks). Phase 3: Stabilise & handover (2 weeks).

## Timeline
14 weeks from kick-off to production go-live.

## Commercials
Fixed-scope engagement at ₹95L. Payment in three milestones: 30% / 40% / 30%.

## Next steps
Sign SOW by 20 April. Kick-off workshop scheduled for 28 April.`

const s = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px 80px',
  },
  h1: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6c757d',
    marginBottom: 28,
  },
  card: {
    background: '#fff',
    border: '1.5px solid #e9ecef',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#495057',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 16,
  },
  row: {
    display: 'flex',
    gap: 16,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  fieldWrap: {
    flex: 1,
    minWidth: 160,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#495057',
    marginBottom: 5,
  },
  input: {
    width: '100%',
    padding: '8px 11px',
    border: '1.5px solid #dee2e6',
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
    background: '#fff',
    color: '#212529',
    transition: 'border-color 0.15s',
  },
  select: {
    width: '100%',
    padding: '8px 11px',
    border: '1.5px solid #dee2e6',
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
    background: '#fff',
    color: '#212529',
    cursor: 'pointer',
  },
  hintBox: {
    background: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: 6,
    padding: '12px 16px',
    marginBottom: 14,
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'monospace',
    lineHeight: 1.6,
  },
  textarea: {
    width: '100%',
    minHeight: 380,
    padding: '12px 14px',
    border: '1.5px solid #dee2e6',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 1.6,
    resize: 'vertical',
    outline: 'none',
    color: '#212529',
    background: '#fff',
  },
  slideCounter: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 8,
    marginBottom: 10,
  },
  slideCounterOver: {
    fontSize: 12,
    color: '#dc3545',
    fontWeight: 600,
    marginTop: 8,
    marginBottom: 10,
  },
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#fff',
    borderTop: '1px solid #e9ecef',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  btnSecondary: {
    padding: '9px 18px',
    border: '1.5px solid #dee2e6',
    borderRadius: 6,
    background: '#fff',
    fontSize: 14,
    color: '#495057',
    cursor: 'pointer',
    fontWeight: 500,
  },
  hint: {
    fontSize: 13,
    color: '#6c757d',
  },
}

function typeCardStyle(active, type) {
  const blue = { border: '2px solid #0d6efd', background: '#e8f0fe' }
  const teal = { border: '2px solid #20c997', background: '#e6f9f4' }
  const inactive = { border: '1.5px solid #e9ecef', background: '#fff' }
  if (!active) return { ...s.card, cursor: 'pointer', padding: '16px 20px', marginBottom: 0, flex: 1, ...inactive }
  return { ...s.card, cursor: 'pointer', padding: '16px 20px', marginBottom: 0, flex: 1, ...(type === 'cap' ? blue : teal) }
}

function generateBtnStyle(deckType) {
  const base = {
    padding: '10px 22px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#fff',
    transition: 'background 0.15s',
  }
  return { ...base, background: deckType === 'cap' ? '#0d6efd' : '#20c997' }
}

export default function DeckForm({ formData, onChange, onGenerate, onLoadPrevious }) {
  const update = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    onChange({ ...formData, [key]: val })
  }

  const slideCount = useMemo(() => {
    if (!formData.slideContent.trim()) return 0
    return parseSlides(formData.slideContent).length
  }, [formData.slideContent])

  const slideCounterText = useMemo(() => {
    if (!formData.slideContent.trim()) return 'Start typing to see slide count'
    if (slideCount > 20) return `${slideCount} slides detected — consider splitting into two decks`
    return `${slideCount} slide${slideCount !== 1 ? 's' : ''} detected`
  }, [slideCount, formData.slideContent])

  const handleSubmit = (e) => {
    e.preventDefault()
    onGenerate(formData)
  }

  const deckHint = formData.deckType === 'prop' ? PROP_EXAMPLE : CAP_EXAMPLE

  const centerHint = [
    formData.deckType === 'cap' ? 'Capabilities deck' : 'Proposal deck',
    formData.customerName || null,
  ].filter(Boolean).join(' · ')

  return (
    <form onSubmit={handleSubmit} style={s.page}>
      <div style={s.h1}>Deck Generator</div>
      <div style={s.subtitle}>Fill in the details below, paste your slide content, and generate a polished .pptx in seconds.</div>

      {/* Deck type selector */}
      <div style={{ ...s.card, padding: '16px 20px' }}>
        <div style={s.cardTitle}>Deck type</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div
            style={typeCardStyle(formData.deckType === 'cap', 'cap')}
            onClick={() => onChange({ ...formData, deckType: 'cap' })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onChange({ ...formData, deckType: 'cap' })}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Capabilities &amp; services</div>
            <div style={{ fontSize: 12, color: '#6c757d' }}>Who we are, what we offer</div>
          </div>
          <div
            style={typeCardStyle(formData.deckType === 'prop', 'prop')}
            onClick={() => onChange({ ...formData, deckType: 'prop' })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onChange({ ...formData, deckType: 'prop' })}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Project proposal</div>
            <div style={{ fontSize: 12, color: '#6c757d' }}>Scope, approach, timeline, investment</div>
          </div>
        </div>
      </div>

      {/* Deck context card */}
      <div style={s.card}>
        <div style={s.cardTitle}>Deck context</div>

        {/* Row 1: Customer, Industry, Audience */}
        <div style={s.row}>
          <div style={s.fieldWrap}>
            <label style={s.label}>Customer name</label>
            <input
              style={s.input}
              type="text"
              placeholder="e.g. Tata Motors Ltd"
              value={formData.customerName}
              onChange={update('customerName')}
            />
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Industry</label>
            <select style={s.select} value={formData.industry} onChange={update('industry')}>
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Audience</label>
            <select style={s.select} value={formData.audience} onChange={update('audience')}>
              <option value="">Select audience</option>
              {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Capabilities-only fields */}
        {formData.deckType === 'cap' && (
          <div style={s.row}>
            <div style={s.fieldWrap}>
              <label style={s.label}>Meeting type</label>
              <select style={s.select} value={formData.meetingType} onChange={update('meetingType')}>
                <option value="">Select type</option>
                {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={s.fieldWrap}>
              <label style={s.label}>Density</label>
              <select style={s.select} value={formData.density} onChange={update('density')}>
                {DENSITIES.map((d) => <option key={d} value={d.toLowerCase()}>{d}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Proposal-only fields */}
        {formData.deckType === 'prop' && (
          <>
            <div style={s.row}>
              <div style={s.fieldWrap}>
                <label style={s.label}>Project name</label>
                <input
                  style={s.input}
                  type="text"
                  placeholder="e.g. Data platform modernisation"
                  value={formData.projectName}
                  onChange={update('projectName')}
                />
              </div>
              <div style={s.fieldWrap}>
                <label style={s.label}>Engagement type</label>
                <select style={s.select} value={formData.engagementType} onChange={update('engagementType')}>
                  <option value="">Select type</option>
                  {ENGAGEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={s.fieldWrap}>
                <label style={s.label}>Density</label>
                <select style={s.select} value={formData.density} onChange={update('density')}>
                  {DENSITIES.map((d) => <option key={d} value={d.toLowerCase()}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={s.row}>
              <div style={s.fieldWrap}>
                <label style={s.label}>Timeline</label>
                <input
                  style={s.input}
                  type="text"
                  placeholder="e.g. 14 weeks"
                  value={formData.timeline}
                  onChange={update('timeline')}
                />
              </div>
              <div style={s.fieldWrap}>
                <label style={s.label}>Investment / budget</label>
                <input
                  style={s.input}
                  type="text"
                  placeholder="e.g. ₹80L – 1.2Cr"
                  value={formData.budget}
                  onChange={update('budget')}
                />
              </div>
            </div>
          </>
        )}

        {/* Customer context — both types */}
        <div>
          <label style={s.label}>Customer context</label>
          <input
            style={s.input}
            type="text"
            placeholder="e.g. Key challenges, what they mentioned in discovery — optional, helps Claude personalise slide headlines"
            value={formData.customerContext}
            onChange={update('customerContext')}
          />
        </div>
      </div>

      {/* Slide content card */}
      <div style={s.card}>
        <div style={s.cardTitle}>Slide content</div>

        <div style={s.hintBox}>
          <strong>Format</strong> — one ## heading per slide
          <br /><br />
          {formData.deckType === 'cap' ? (
            <>
              {'## Slide title'}<br />
              {'Your content here — bullets, paragraphs, numbers, any format.'}<br />
              <br />
              {'## Next slide title'}<br />
              {'Content for this slide...'}
            </>
          ) : (
            '## Background / ## Problem statement / ## Solution approach / ## Methodology / ## Implementation plan / ## Timeline / ## Commercials / ## Next steps'
          )}
          <div style={{ marginTop: 10, color: '#868e96', fontSize: 11 }}>
            Use ## to mark each slide title. The app picks the best template for each slide and fits your content into it.
          </div>
        </div>

        <div style={slideCount > 20 ? s.slideCounterOver : s.slideCounter}>
          {slideCounterText}
        </div>

        <textarea
          style={s.textarea}
          placeholder={deckHint}
          value={formData.slideContent}
          onChange={update('slideContent')}
        />

        {/* Output options row */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={s.fieldWrap}>
            <label style={s.label}>Claude improvement</label>
            <select style={s.select} value={formData.improvement} onChange={update('improvement')}>
              {IMPROVEMENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Speaker notes</label>
            <select style={s.select} value={formData.speakerNotes} onChange={update('speakerNotes')}>
              {SPEAKER_NOTES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
            <input
              type="checkbox"
              id="confFooter"
              checked={formData.confidentialityFooter}
              onChange={update('confidentialityFooter')}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="confFooter" style={{ fontSize: 13, color: '#495057', cursor: 'pointer' }}>
              Add confidentiality footer
            </label>
          </div>
        </div>
      </div>

      {/* Bottom bar spacer */}
      <div style={{ height: 20 }} />

      {/* Bottom bar */}
      <div style={s.bottomBar}>
        <button type="button" style={s.btnSecondary} onClick={onLoadPrevious}>
          Load previous
        </button>
        <span style={s.hint}>{centerHint || 'Select deck type and fill in customer name'}</span>
        <button type="submit" style={generateBtnStyle(formData.deckType)}>
          Generate deck →
        </button>
      </div>
    </form>
  )
}
