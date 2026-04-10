import React, { useState } from 'react'

function confidenceColor(score) {
  if (score >= 0.75) return { color: '#198754', background: '#d1e7dd', border: '1px solid #a3cfbb' }
  if (score >= 0.50) return { color: '#856404', background: '#fff3cd', border: '1px solid #ffda6a' }
  return { color: '#842029', background: '#f8d7da', border: '1px solid #f1aeb5' }
}

function ConfidenceBadge({ score }) {
  const style = confidenceColor(score)
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      ...style,
    }}>
      {score.toFixed(2)}
    </span>
  )
}

const s = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px 100px',
  },
  h1: { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6c757d', marginBottom: 28 },
  card: {
    background: '#fff',
    border: '1.5px solid #e9ecef',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 20,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
    fontWeight: 600,
    color: '#495057',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  td: {
    padding: '11px 12px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'middle',
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
    gap: 16,
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
  btnPrimary: {
    padding: '10px 22px',
    border: 'none',
    borderRadius: 6,
    background: '#0d6efd',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#fff',
  },
}

export default function LayoutReport({ reportData, templateIndex, onBack, onBuild }) {
  const [rows, setRows] = useState(reportData || [])

  const handleSwap = (slideIdx, candidateId, candidateScore) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== slideIdx) return row
      return { ...row, template_id: candidateId, confidence: candidateScore }
    }))
  }

  if (!rows || rows.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.h1}>Layout Selection Report</div>
        <div style={s.subtitle}>No slides to display. Go back and add slide content.</div>
        <button style={s.btnSecondary} onClick={onBack}>Back</button>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.h1}>Layout Selection Report</div>
      <div style={s.subtitle}>
        Review how each slide matched to a template. Swap overrides if needed before building.
      </div>

      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 40 }}>#</th>
              <th style={s.th}>Title</th>
              <th style={s.th}>Template matched</th>
              <th style={{ ...s.th, width: 100 }}>Confidence</th>
              <th style={s.th}>Content fit</th>
              <th style={{ ...s.th, width: 120 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ ...s.td, color: '#6c757d', fontWeight: 600 }}>{row.slide_number}</td>
                <td style={{ ...s.td, fontWeight: 500 }}>{row.title}</td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12, color: '#495057' }}>
                  {row.template_id}
                </td>
                <td style={s.td}>
                  <ConfidenceBadge score={row.confidence} />
                </td>
                <td style={{ ...s.td, color: '#6c757d', fontSize: 12 }}>
                  {row.content_fit}
                  {row.content_fit_detail && (
                    <span style={{ color: '#adb5bd', marginLeft: 4 }}>{row.content_fit_detail}</span>
                  )}
                </td>
                <td style={s.td}>
                  {row.candidates && row.candidates.length > 1 ? (
                    <SwapSelect
                      candidates={row.candidates}
                      currentId={row.template_id}
                      onSwap={(id, score) => handleSwap(idx, id, score)}
                    />
                  ) : (
                    <span style={{ color: '#dee2e6', fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, color: '#6c757d' }}>
        <span style={{ marginRight: 16 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#d1e7dd', borderRadius: 2, marginRight: 4 }} />
          Score &ge; 0.75 — high confidence
        </span>
        <span style={{ marginRight: 16 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#fff3cd', borderRadius: 2, marginRight: 4 }} />
          Score 0.50–0.74 — review recommended
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#f8d7da', borderRadius: 2, marginRight: 4 }} />
          Score &lt; 0.50 — Claude will invent layout
        </span>
      </div>

      <div style={s.bottomBar}>
        <button style={s.btnSecondary} onClick={onBack}>Back</button>
        <div style={{ fontSize: 13, color: '#6c757d' }}>
          {rows.length} slide{rows.length !== 1 ? 's' : ''} · review complete
        </div>
        <button style={s.btnPrimary} onClick={() => onBuild(rows)}>
          Build deck →
        </button>
      </div>
    </div>
  )
}

function SwapSelect({ candidates, currentId, onSwap }) {
  return (
    <select
      style={{
        fontSize: 11,
        padding: '3px 6px',
        border: '1px solid #dee2e6',
        borderRadius: 4,
        background: '#fff',
        color: '#495057',
        cursor: 'pointer',
      }}
      value={currentId}
      onChange={(e) => {
        const chosen = candidates.find((c) => c.id === e.target.value)
        if (chosen) onSwap(chosen.id, chosen.score)
      }}
    >
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          {c.id} ({c.score.toFixed(2)})
        </option>
      ))}
    </select>
  )
}
