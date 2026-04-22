'use client';

import { useState } from 'react';

export default function SourcePanel({ assignment }) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="source-panel">
      <div className="ai-usage-card">
        <h3>Källa</h3>
        <div className="source-field">
          <div className="source-label">Typ</div>
          <div>{assignment.sourceType}</div>
        </div>
        {assignment.sourceSubject && (
          <div className="source-field">
            <div className="source-label">Ämne</div>
            <div>{assignment.sourceSubject}</div>
          </div>
        )}
        {assignment.brokerEmail && (
          <div className="source-field">
            <div className="source-label">Mäklar-email</div>
            <div>{assignment.brokerEmail}</div>
          </div>
        )}
        <div className="source-field">
          <div className="source-label">Inkommet</div>
          <div>{new Date(assignment.createdAt).toLocaleString('sv-SE')}</div>
        </div>
        {assignment.extractionNotes && (
          <div className="source-field">
            <div className="source-label">AI-anmärkning</div>
            <div className="source-notes">{assignment.extractionNotes}</div>
          </div>
        )}
        {assignment.sourceRaw && (
          <>
            <button className="ai-toggle-btn" onClick={() => setShowRaw(!showRaw)} style={{ marginTop: 12 }}>
              {showRaw ? 'Dölj originalmail' : 'Visa originalmail'}
            </button>
            {showRaw && (
              <pre className="source-raw">{assignment.sourceRaw}</pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}
