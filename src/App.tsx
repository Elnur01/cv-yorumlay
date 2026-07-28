import React, { useState } from 'react';

import { evaluateCV, rebuildCV } from './lib/gemini';
import confetti from 'canvas-confetti';
import './index.css';


function App() {
  const [formData, setFormData] = useState({
    currentJob: '',
    targetJob: '',
    country: '',
    sector: '',
    seniority: 'mid',
    companyTypeHint: 'unknown',
    selectedModel: 'deepseek-v4-flash'
  });
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [report, setReport] = useState<any | null>(null);
  const [personaProfile, setPersonaProfile] = useState<any | null>(null);
  const [rebuildReport, setRebuildReport] = useState<any | null>(null);
  const [compareMonolith, setCompareMonolith] = useState(false);
  const [monolithReport, setMonolithReport] = useState<any | null>(null);
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
        { ...formData, compareMonolith },
        consent,
        (step) => setProgressStep(step),
        () => addToast('Report generated, but we could not save it to the database.', 'error')
      );
      
      setReport(result.report);
      setPersonaProfile(result.profile);
      setMonolithReport(result.monolith_report || null);
      setRebuildReport(null);
      
      const finalScore = result.report.overall_score ?? (result.report as any).executiveSummary?.finalScore ?? 0;
      if (finalScore >= 85) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#8E2DE2', '#4CAF50', '#FF6B35']
        });
      }
      
      addToast('Analysis completed successfully!', 'success');

    } catch (err: any) {
      console.error(err);
      let errorMessage = 'An error occurred during evaluation. Please try again.';
      if (err.message) {
        if (err.message.includes('Hard Gate Failed')) {
          errorMessage = 'Could not fetch market data. Please check the spelling of your Target Country.';
        } else if (err.message.includes('schema') || err.message.includes('JSON')) {
          errorMessage = 'The AI generated an invalid format. Please try again.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      addToast(errorMessage, 'error');
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
      const rebuildResult = await rebuildCV(file, personaProfile, formData.selectedModel, (step) => setProgressStep(step));
      setRebuildReport(rebuildResult);
      addToast('CV rebuilt successfully!', 'success');
    } catch (err: any) {
      setError(err.message ?? 'An error occurred during CV rebuilding.');
      addToast(err.message ?? 'An error occurred during CV rebuilding.', 'error');
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

      <header className="header">
        <h1>CV <span>Yorumlayıcısı</span></h1>
        <p>Data-driven CV analysis benchmarked against real-time regional market standards.</p>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="card">
            <h2 style={{ marginBottom: '24px', color: 'var(--color-anthracite)' }}>Intake Flow</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Current Job Title</label>
                <input 
                  type="text" 
                  name="currentJob" 
                  className="form-control" 
                  value={formData.currentJob} 
                  onChange={handleInputChange} 
                  required 
                  placeholder="e.g. Marketing Specialist" 
                />
              </div>
              <div className="form-group">
                <label>Target Job Title</label>
                <input 
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
                <label>Target Country/Region</label>
                <input 
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
                <label>Industry Sector</label>
                <input 
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
                <label>Seniority Level</label>
                <select 
                  name="seniority" 
                  className="form-control" 
                  value={formData.seniority} 
                  onChange={handleInputChange}
                  required
                >
                  <option value="entry">Entry-level (0-2 years)</option>
                  <option value="mid">Mid-level (3-5 years)</option>
                  <option value="senior">Senior (6+ years)</option>
                  <option value="executive">Executive (C-level / Director)</option>
                  <option value="academic">Academic / Scientific Research</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Company Type</label>
                <select 
                  name="companyTypeHint" 
                  className="form-control" 
                  value={formData.companyTypeHint} 
                  onChange={handleInputChange}
                >
                  <option value="unknown">Auto-detect from target region</option>
                  <option value="domestic">TR-Domestic Market</option>
                  <option value="multinational">Multinational / Global Remote</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  🤖 Select AI Intelligence Model for Scoring
                </label>
                <div className="model-selector-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginTop: '8px' }}>
                  {[
                    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', desc: '⚡ High Speed & Fast Analytics', logo: '/assets/deepseek.png', badge: 'Default' },
                    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro (R1)', desc: '🧠 Deep Reasoning & Strict Verification', logo: '/assets/deepseek.png', badge: 'Pro Reasoning' },
                    { id: 'llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct', desc: '🚀 Flagship 70B Reasoning Model', logo: '/assets/meta_llama.png', badge: 'NVIDIA NIM' },
                    { id: 'llama-3.2-90b-vision-instruct', name: 'Meta Llama 3.2 90B Vision', desc: '👁️ Vision + Visual Layout Parsing', logo: '/assets/meta_llama.png', badge: 'Multimodal' },
                    { id: 'nemotron-nano-12b-v2-vl', name: 'NVIDIA Nemotron 12B VL', desc: '⚡ Fast Document Vision-Language', logo: '/assets/nvidia_nemotron.png', badge: 'NVIDIA NIM' },
                  ].map((m) => {
                    const selected = (formData.selectedModel || 'deepseek-v4-flash') === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setFormData({ ...formData, selectedModel: m.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: selected ? '2px solid var(--color-purple)' : '1px solid #e2e8f0',
                          backgroundColor: selected ? '#f6f2ff' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: selected ? '0 2px 8px rgba(124, 58, 237, 0.15)' : 'none',
                        }}
                      >
                        <img src={m.logo} alt={m.name} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{m.name}</span>
                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: selected ? 'var(--color-purple)' : '#e2e8f0', color: selected ? '#fff' : '#64748b' }}>{m.badge}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                  I explicitly consent to having my CV and the generated evaluation report securely stored for system improvement purposes. If unchecked, your data will be processed ephemerally and will not be saved.
                </label>
              </div>

              <div className="consent-wrapper" style={{ marginTop: '12px' }}>
                <input 
                  type="checkbox" 
                  id="compareMonolith" 
                  checked={compareMonolith} 
                  onChange={(e) => setCompareMonolith(e.target.checked)} 
                />
                <label htmlFor="compareMonolith">
                  Run comparison check with Monolith Prompt (A/B Test)
                </label>
              </div>

              {error && <div style={{ color: 'red', marginBottom: '16px', fontWeight: 500 }}>{error}</div>}

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
              <p>Upload your CV and fill out the intake form to receive a critical, evidence-based assessment of your profile.</p>
            </div>
          ) : (
            <div className="results-container slide-up">
              <div className={`score-card ${getScoreClass(report.overall_score ?? report.executiveSummary?.finalScore ?? 0)}`}>
                <div className="score-circle">
                  <span className="score-value">{report.overall_score ?? report.executiveSummary?.finalScore ?? 0}</span>
                  <span className="score-max">/ 100</span>
                </div>
                <h2 className="verdict">{report.verdict ?? report.executiveSummary?.verdict}</h2>
                <p>Target Region: {report.target?.region ?? report.executiveSummary?.targetRegion}</p>
                {report.persona && (
                  <p style={{ fontSize: '0.85em', opacity: 0.8, marginTop: '8px' }}>
                    Persona: <strong>{report.persona}</strong> | Localization: <strong>{report.target?.company_type}</strong>
                  </p>
                )}
              </div>

              {/* Monolith Comparison A/B Test block */}
              {monolithReport && (
                <div className="card" style={{ border: '2px dashed var(--color-orange)', backgroundColor: 'rgba(255, 107, 53, 0.03)' }}>
                  <h3 style={{ color: 'var(--color-orange)', marginBottom: '12px' }}>A/B Test Benchmark (Monolithic Prompt)</h3>
                  <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                    <div>
                      <strong>Monolith Score:</strong> {monolithReport.executiveSummary?.finalScore} / 100
                    </div>
                    <div>
                      <strong>Monolith Verdict:</strong> {monolithReport.executiveSummary?.verdict}
                    </div>
                    <div style={{ fontSize: '0.9em', color: 'gray' }}>
                      Assembled score: {report.overall_score} (Delta: {report.overall_score - (monolithReport.executiveSummary?.finalScore || 0)})
                    </div>
                  </div>
                </div>
              )}

              {/* New Schema: Dimensions */}
              {report.dimensions && (
                <div className="card">
                  <h3 style={{ marginBottom: '24px' }}>Modular Dimension Rubric</h3>
                  <div className="section-grid">
                    {report.dimensions.map((sec: any, idx: number) => (
                      <div key={idx} className="metric-card">
                        <div className="metric-header">
                          <span className="metric-title">{sec.label}</span>
                          <span className="metric-score">{sec.score}/100</span>
                        </div>
                        <p className="metric-obs">{sec.rationale}</p>
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '0.85em' }}>
                          <span>Weight: <strong>{(sec.weight * 100).toFixed(0)}%</strong></span>
                          <span className={`severity-badge severity-${sec.severity}`} style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontWeight: 'bold',
                            backgroundColor: sec.severity === 'ok' ? '#e2f0d9' : sec.severity === 'minor' ? '#fff2cc' : '#f8cecc',
                            color: sec.severity === 'ok' ? 'green' : sec.severity === 'minor' ? 'orange' : 'red'
                          }}>
                            {sec.severity.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Old Schema: Sections */}
              {report.sections && (
                <div className="card">
                  <h3 style={{ marginBottom: '24px' }}>Modular Analysis</h3>
                  <div className="section-grid">
                    {report.sections.map((sec: any, idx: number) => (
                      <div key={idx} className="metric-card">
                        <div className="metric-header">
                          <span className="metric-title">{sec.category}</span>
                          <span className="metric-score">{sec.score}/100</span>
                        </div>
                        <p className="metric-obs">{sec.primaryObservation}</p>
                        {sec.deductionLog && sec.deductionLog.length > 0 && (
                          <div className="deduction-log">
                            <strong>Deductions:</strong>
                            <ul>
                              {sec.deductionLog.map((log: any, lIdx: number) => <li key={lIdx}>{log}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Schema: Findings & Fix Hints */}
              {report.findings && (
                <div className="card">
                  <h3 style={{ marginBottom: '24px' }}>Audited Findings & Fix Hints</h3>
                  <ul className="improvements-list" style={{ listStyleType: 'none', paddingLeft: 0 }}>
                    {report.findings.map((f: any, idx: number) => (
                      <li key={idx} style={{ 
                        marginBottom: '16px', 
                        padding: '12px', 
                        borderRadius: '6px', 
                        borderLeft: '4px solid',
                        borderColor: f.type === 'strength' ? 'green' : f.type === 'weakness' ? 'orange' : f.type === 'data_gap' ? '#d0a000' : 'red',
                        backgroundColor: '#fdfdfd'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '0.9em', textTransform: 'uppercase', color: f.type === 'strength' ? 'green' : f.type === 'weakness' ? 'orange' : f.type === 'data_gap' ? '#b08000' : 'red' }}>
                            {f.type} ({f.dimension_key})
                          </strong>
                        </div>
                        <p style={{ margin: '0 0 6px 0', color: 'var(--color-anthracite)' }}>{f.message}</p>
                        {f.fix_hint && (
                          <div style={{ fontSize: '0.85em', color: 'gray', fontStyle: 'italic' }}>
                            💡 Fix Hint: {f.fix_hint}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Old Schema: Improvements */}
              {report.top3ActionableImprovements && (
                <div className="card">
                  <h3 style={{ marginBottom: '24px' }}>Top 3 Actionable Improvements</h3>
                  <ul className="improvements-list">
                    {report.top3ActionableImprovements.map((imp: any, idx: number) => (
                      <li key={idx}>{imp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* New Schema: ATS keywords & parse risks */}
              {report.ats && (
                <div className="card" style={{ backgroundColor: 'rgba(142, 45, 226, 0.05)', borderColor: 'rgba(142, 45, 226, 0.2)' }}>
                  <h3 style={{ marginBottom: '16px', color: 'var(--color-purple)' }}>ATS Quality Check (Score: {report.ats.score}/100)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '8px' }}>Missing Keywords:</strong>
                      {report.ats.missing_keywords && report.ats.missing_keywords.length > 0 ? (
                        <ul style={{ paddingLeft: '20px' }}>
                          {report.ats.missing_keywords.map((kw: string, idx: number) => <li key={idx}>{kw}</li>)}
                        </ul>
                      ) : (
                        <p className="metric-obs" style={{ color: 'green' }}>✓ All critical target keywords detected.</p>
                      )}
                    </div>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '8px' }}>Formatting Parse Risks:</strong>
                      {report.ats.parse_risks && report.ats.parse_risks.length > 0 ? (
                        <ul style={{ paddingLeft: '20px', color: 'red' }}>
                          {report.ats.parse_risks.map((risk: string, idx: number) => <li key={idx}>{risk}</li>)}
                        </ul>
                      ) : (
                        <p className="metric-obs" style={{ color: 'green' }}>✓ No ATS layout parser risks detected.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Old Schema: Regional Gap Analysis */}
              {report.regionalMarketGapAnalysis && (
                <div className="card" style={{ backgroundColor: 'rgba(255, 107, 53, 0.05)', borderColor: 'rgba(255, 107, 53, 0.2)' }}>
                  <h3 style={{ marginBottom: '16px', color: 'var(--color-orange)' }}>Regional Gap Analysis</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '8px' }}>Missing Tools:</strong>
                      {report.regionalMarketGapAnalysis.missingCriticalTools.length > 0 ? (
                        <ul style={{ paddingLeft: '20px' }}>
                          {report.regionalMarketGapAnalysis.missingCriticalTools.map((tool: any, idx: number) => <li key={idx}>{tool}</li>)}
                        </ul>
                      ) : (
                        <p className="metric-obs">None detected.</p>
                      )}
                    </div>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '8px' }}>Missing Certifications:</strong>
                      {report.regionalMarketGapAnalysis.missingCertifications.length > 0 ? (
                        <ul style={{ paddingLeft: '20px' }}>
                          {report.regionalMarketGapAnalysis.missingCertifications.map((cert: any, idx: number) => <li key={idx}>{cert}</li>)}
                        </ul>
                      ) : (
                        <p className="metric-obs">None detected.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Rebuilt CV Showcase */}
              {rebuildReport && (
                <div className="card rebuild-showcase-card" style={{ border: '2px solid var(--color-purple)', backgroundColor: '#fcfaff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ color: 'var(--color-purple)', margin: 0 }}>✨ AI CV Rebuild Output</h3>
                    <span style={{ fontSize: '0.85em', backgroundColor: 'var(--color-purple)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                      Format: {rebuildReport.format_used.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.9em', color: 'gray', marginTop: '-12px', marginBottom: '24px' }}>
                    Output Language: <strong>{rebuildReport.output_language.toUpperCase()}</strong> | Persona: <strong>{rebuildReport.persona}</strong>
                  </p>

                  <div className="rebuilt-cv-document" style={{ backgroundColor: 'white', padding: '24px', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #ddd' }}>
                    {rebuildReport.sections.map((sec: any, sIdx: number) => (
                      <div key={sIdx} style={{ marginBottom: '24px' }}>
                        <h4 style={{ color: 'var(--color-anthracite)', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #eee', paddingBottom: '6px', marginBottom: '12px' }}>
                          {sec.title}
                        </h4>
                        {sec.blocks.map((block: any, bIdx: number) => (
                          <div key={bIdx} style={{ margin: '8px 0', position: 'relative' }} className="rebuild-cv-block">
                            {block.type === 'paragraph' && (
                              <p style={{ margin: 0, lineHeight: '1.6', fontSize: '0.95em' }}>{block.content}</p>
                            )}
                            {block.type === 'bullet_list' && (
                              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                {(Array.isArray(block.content) ? block.content : [block.content]).map((bullet: string, buIdx: number) => (
                                  <li key={buIdx} style={{ fontSize: '0.95em', lineHeight: '1.5', marginBottom: '4px' }}>{bullet}</li>
                                ))}
                              </ul>
                            )}
                            {block.type === 'entry' && (
                              <div style={{ fontSize: '0.95em', fontWeight: 'bold', margin: '12px 0 4px 0' }}>{block.content}</div>
                            )}
                            {block.source_ref && (
                              <span style={{ fontSize: '0.7em', color: '#b3b3b3', display: 'block', marginTop: '2px' }}>
                                Source ref: <em>"{block.source_ref}"</em>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {rebuildReport.applied_fixes && rebuildReport.applied_fixes.length > 0 && (
                    <div style={{ marginTop: '24px', backgroundColor: '#edf7ed', padding: '16px', borderRadius: '6px', border: '1px solid #c8e6c9' }}>
                      <strong style={{ color: 'green', display: 'block', marginBottom: '8px' }}>✓ Applied Rubric Optimizations</strong>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9em' }}>
                        {rebuildReport.applied_fixes.map((fix: any, fIdx: number) => (
                          <li key={fIdx} style={{ marginBottom: '4px' }}>
                            <strong>{fix.finding_ref}:</strong> {fix.what_changed}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rebuildReport.still_missing && rebuildReport.still_missing.length > 0 && (
                    <div style={{ marginTop: '16px', backgroundColor: '#fffde7', padding: '16px', borderRadius: '6px', border: '1px solid #fff59d' }}>
                      <strong style={{ color: '#b08000', display: 'block', marginBottom: '8px' }}>⚠️ Remaining Unresolved Data Gaps (Honoring Anti-Fabrication Rule)</strong>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9em' }}>
                        {rebuildReport.still_missing.map((gap: any, gIdx: number) => (
                          <li key={gIdx} style={{ marginBottom: '4px' }}>
                            <strong>{gap.field}:</strong> {gap.why_it_matters}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="actions-footer" style={{ display: 'flex', gap: '16px' }}>
                <button onClick={() => window.print()} className="btn-secondary" style={{ flex: 1 }}>
                  Download / Print Report
                </button>
                {report.rebuild_ready && !rebuildReport && (
                  <button onClick={handleRebuild} className="btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-purple)' }}>
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
