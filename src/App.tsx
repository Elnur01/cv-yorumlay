import React, { useState } from 'react';

import { evaluateCV, rebuildCV, errorMessage, MODEL_LABEL } from './lib/api';
import type { PersonaProfile, CVScoreReport, CVRebuildReport } from './lib/api';
import confetti from 'canvas-confetti';
import './index.css';

const SENIORITY_OPTIONS = [
  { value: 'entry', label: 'Entry-level' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'executive', label: 'Executive' },
  { value: 'academic', label: 'Academic / Scientific Research' },
];

function App() {
  const [formData, setFormData] = useState({
    targetJob: '',
    country: '',
    sector: '',
    seniority: 'mid',
  });
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [report, setReport] = useState<CVScoreReport | null>(null);
  const [personaProfile, setPersonaProfile] = useState<PersonaProfile | null>(null);
  const [rebuildReport, setRebuildReport] = useState<CVRebuildReport | null>(null);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);

  const addToast = (message: string, type: 'success' | 'error' = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError('Please upload a valid PDF file.');
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please upload your CV first.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await evaluateCV(
        file,
        formData,
        consent,
        (step) => setProgressStep(step),
        () => addToast('Report generated, but we could not save it to the database.', 'error')
      );

      setReport(result.report);
      setPersonaProfile(result.profile);
      setRebuildReport(null);

      if ((result.report.overall_score ?? 0) >= 85) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#8E2DE2', '#4CAF50', '#FF6B35'],
        });
      }

      addToast('Analysis completed successfully!', 'success');
    } catch (err: unknown) {
      console.error(err);
      const raw = errorMessage(err, 'An error occurred during evaluation. Please try again.');
      let message = raw;
      if (raw.includes('Hard Gate Failed')) {
        message = 'Could not fetch market data. Please check the spelling of your Target Country.';
      } else if (raw.includes('schema') || raw.includes('JSON')) {
        message = 'The AI generated an invalid format. Please try again.';
      }
      setError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
      setProgressStep('');
    }
  };

  const handleRebuild = async () => {
    if (!file || !personaProfile) return;
    setLoading(true);
    setError('');
    try {
      const result = await rebuildCV(file, personaProfile, (step) => setProgressStep(step));
      setRebuildReport(result);
      addToast('CV rebuilt successfully!', 'success');
    } catch (err: unknown) {
      const message = errorMessage(err, 'An error occurred during CV rebuilding.');
      setError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
      setProgressStep('');
    }
  };

  const renderStep = (id: string, label: string, activeStep: string) => {
    const steps = ['scanning', 'market_search', 'ai_analysis', 'complete'];
    const currentIndex = steps.indexOf(activeStep);
    const stepIndex = steps.indexOf(id);

    let status = 'pending';
    if (currentIndex === stepIndex) status = 'loading';
    if (currentIndex > stepIndex || activeStep === 'complete') status = 'complete';

    return (
      <div className={`progress-step ${status}`}>
        <div className="step-icon">
          {status === 'complete' ? '✅' : status === 'loading' ? <div className="mini-spinner"></div> : '⚪'}
        </div>
        <span className="step-label">{label}</span>
      </div>
    );
  };

  const getScoreClass = (score: number) => {
    if (score >= 85) return 'score-excellent';
    if (score >= 70) return 'score-good';
    return 'score-needs-work';
  };

  return (
    <div className="app-container">
      {/* Toasts Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? '✅' : '⚠️'} {t.message}
          </div>
        ))}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="progress-container">
            <h2>Evaluating your CV...</h2>
            <div className="progress-list">
              {renderStep('scanning', 'Scanning Document & Extracting Text', progressStep)}
              {renderStep('market_search', 'Fetching Regional Market Benchmarks', progressStep)}
              {renderStep('ai_analysis', 'Running 5-Domain AI Analysis', progressStep)}
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        <aside className="sidebar">
          <div className="sidebar-panel">
            <div className="sidebar-brand">
              <h1>
                CV <span>Yorumlayıcısı</span>
              </h1>
              <p>Data-driven CV analysis benchmarked against regional market standards.</p>
              <div className="engine-badge">
                <img src="/assets/deepseek.png" alt="" aria-hidden="true" />
                <span>Powered by {MODEL_LABEL}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="targetJob">Target Job Title</label>
                <input
                  id="targetJob"
                  type="text"
                  name="targetJob"
                  className="form-control"
                  value={formData.targetJob}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. Senior Marketing Manager"
                />
              </div>

              <div className="form-group">
                <label htmlFor="country">Target Country/Region</label>
                <input
                  id="country"
                  type="text"
                  name="country"
                  className="form-control"
                  value={formData.country}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. Germany"
                />
              </div>

              <div className="form-group">
                <label htmlFor="sector">Industry Sector</label>
                <input
                  id="sector"
                  type="text"
                  name="sector"
                  className="form-control"
                  value={formData.sector}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. Technology"
                />
              </div>

              <div className="form-group">
                <label htmlFor="seniority">Seniority Level</label>
                <select
                  id="seniority"
                  name="seniority"
                  className="form-control"
                  value={formData.seniority}
                  onChange={handleInputChange}
                  required
                >
                  {SENIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Upload CV (PDF only)</label>
                <div className="file-upload-wrapper">
                  <input type="file" accept="application/pdf" onChange={handleFileChange} required />
                  <span className="file-upload-text">Click to browse or drag and drop</span>
                  {file && <span className="file-upload-selected">{file.name}</span>}
                </div>
              </div>

              <div className="consent-wrapper">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <label htmlFor="consent">
                  I explicitly consent to having my CV and the generated evaluation report securely
                  stored for system improvement purposes. If unchecked, your data will be processed
                  ephemerally and will not be saved.
                </label>
              </div>

              {error && <div className="form-error">{error}</div>}

              <button type="submit" className="btn-primary" disabled={loading}>
                Analyze My CV
              </button>
            </form>
          </div>
        </aside>

        <main className="results-area">
          {!report ? (
            <div className="card empty-state">
              <div className="empty-state-icon floating">📄</div>
              <h2>Ready for your audit</h2>
              <p>
                Upload your CV and fill out the intake form to receive a critical, evidence-based
                assessment of your profile.
              </p>
            </div>
          ) : (
            <div className="results-container slide-up">
              <div className={`score-card ${getScoreClass(report.overall_score ?? 0)}`}>
                <div className="score-circle">
                  <span className="score-value">{report.overall_score ?? 0}</span>
                  <span className="score-max">/ 100</span>
                </div>
                <h2 className="verdict">{report.verdict}</h2>
                <p>Target Region: {report.target?.region}</p>
                {report.persona && (
                  <p className="score-meta">
                    Persona: <strong>{report.persona}</strong> · Localization:{' '}
                    <strong>{report.target?.company_type}</strong>
                  </p>
                )}
                {report.model_used && (
                  <p className="score-meta">
                    Model: <strong>{report.model_used}</strong>
                    {report.provider ? ` · ${report.provider}` : ''}
                    {report.elapsed_seconds != null ? ` · ${report.elapsed_seconds}s` : ''}
                  </p>
                )}
              </div>

              {report.dimensions && (
                <div className="card">
                  <h3 className="card-heading">Modular Dimension Rubric</h3>
                  <div className="section-grid">
                    {report.dimensions.map((sec, idx) => (
                      <div key={idx} className="metric-card">
                        <div className="metric-header">
                          <span className="metric-title">{sec.label}</span>
                          <span className="metric-score">{sec.score}/100</span>
                        </div>
                        <p className="metric-obs">{sec.rationale}</p>
                        <div className="metric-footer">
                          <span>
                            Weight: <strong>{(sec.weight * 100).toFixed(0)}%</strong>
                          </span>
                          <span className={`severity-badge severity-${sec.severity}`}>
                            {sec.severity.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.findings && (
                <div className="card">
                  <h3 className="card-heading">Audited Findings &amp; Fix Hints</h3>
                  <ul className="findings-list">
                    {report.findings.map((f, idx) => (
                      <li key={idx} className={`finding finding-${f.type}`}>
                        <strong className="finding-type">
                          {f.type} ({f.dimension_key})
                        </strong>
                        <p className="finding-message">{f.message}</p>
                        {f.fix_hint && <div className="finding-hint">💡 Fix Hint: {f.fix_hint}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.ats && (
                <div className="card card-ats">
                  <h3 className="card-heading card-heading-ats">
                    ATS Quality Check (Score: {report.ats.score}/100)
                  </h3>
                  <div className="two-column">
                    <div>
                      <strong className="column-title">Missing Keywords:</strong>
                      {report.ats.missing_keywords && report.ats.missing_keywords.length > 0 ? (
                        <ul className="plain-list">
                          {report.ats.missing_keywords.map((kw, idx) => (
                            <li key={idx}>{kw}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="metric-obs positive">✓ All critical target keywords detected.</p>
                      )}
                    </div>
                    <div>
                      <strong className="column-title">Formatting Parse Risks:</strong>
                      {report.ats.parse_risks && report.ats.parse_risks.length > 0 ? (
                        <ul className="plain-list negative">
                          {report.ats.parse_risks.map((risk, idx) => (
                            <li key={idx}>{risk}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="metric-obs positive">✓ No ATS layout parser risks detected.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {rebuildReport && (
                <div className="card rebuild-showcase-card">
                  <div className="rebuild-header">
                    <h3>✨ AI CV Rebuild Output</h3>
                    <span className="rebuild-format-tag">
                      Format: {rebuildReport.format_used.toUpperCase()}
                    </span>
                  </div>
                  <p className="rebuild-subtitle">
                    Output Language: <strong>{rebuildReport.output_language.toUpperCase()}</strong> ·
                    Persona: <strong>{rebuildReport.persona}</strong>
                  </p>

                  <div className="rebuilt-cv-document">
                    {rebuildReport.sections.map((sec, sIdx) => (
                      <div key={sIdx} className="rebuilt-cv-section">
                        <h4>{sec.title}</h4>
                        {sec.blocks.map((block, bIdx) => (
                          <div key={bIdx} className="rebuild-cv-block">
                            {block.type === 'paragraph' && <p>{block.content as string}</p>}
                            {block.type === 'bullet_list' && (
                              <ul>
                                {(Array.isArray(block.content) ? block.content : [block.content]).map(
                                  (bullet, buIdx) => (
                                    <li key={buIdx}>{bullet}</li>
                                  )
                                )}
                              </ul>
                            )}
                            {block.type === 'entry' && (
                              <div className="rebuild-entry">{block.content as string}</div>
                            )}
                            {block.source_ref && (
                              <span className="rebuild-source-ref">
                                Source ref: <em>"{block.source_ref}"</em>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {rebuildReport.applied_fixes && rebuildReport.applied_fixes.length > 0 && (
                    <div className="rebuild-note rebuild-note-applied">
                      <strong>✓ Applied Rubric Optimizations</strong>
                      <ul>
                        {rebuildReport.applied_fixes.map((fix, fIdx) => (
                          <li key={fIdx}>
                            <strong>{fix.finding_ref}:</strong> {fix.what_changed}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rebuildReport.still_missing && rebuildReport.still_missing.length > 0 && (
                    <div className="rebuild-note rebuild-note-missing">
                      <strong>⚠️ Remaining Unresolved Data Gaps (Honoring Anti-Fabrication Rule)</strong>
                      <ul>
                        {rebuildReport.still_missing.map((gap, gIdx) => (
                          <li key={gIdx}>
                            <strong>{gap.field}:</strong> {gap.why_it_matters}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="actions-footer">
                <button onClick={() => window.print()} className="btn-secondary">
                  Download / Print Report
                </button>
                {report.rebuild_ready && !rebuildReport && (
                  <button onClick={handleRebuild} className="btn-primary btn-rebuild">
                    ✨ Rebuild / Optimize CV
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
