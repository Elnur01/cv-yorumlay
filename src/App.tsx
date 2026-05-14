import React, { useState } from 'react';

import { evaluateCV } from './lib/gemini';
import type { CVReport } from './lib/gemini';
import confetti from 'canvas-confetti';
import './index.css';


function App() {
  const [formData, setFormData] = useState({
    currentJob: '',
    targetJob: '',
    country: '',
    sector: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [report, setReport] = useState<CVReport | null>(null);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);

  const addToast = (message: string, type: 'success' | 'error' = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

      const cvReport = await evaluateCV(
        file,
        formData,
        consent,
        (step) => setProgressStep(step),
        () => addToast('Report generated, but we could not save it to the database.', 'error')
      );
      setReport(cvReport);
      
      if (cvReport.executiveSummary.finalScore >= 85) {
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
              <div className={`score-card ${getScoreClass(report.executiveSummary.finalScore)}`}>
                <div className="score-circle">
                  <span className="score-value">{report.executiveSummary.finalScore}</span>
                  <span className="score-max">/ 100</span>
                </div>
                <h2 className="verdict">{report.executiveSummary.verdict}</h2>
                <p>Target Region: {report.executiveSummary.targetRegion}</p>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: '24px' }}>Modular Analysis</h3>
                <div className="section-grid">
                  {report.sections.map((sec, idx) => (
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
                            {sec.deductionLog.map((log, lIdx) => <li key={lIdx}>{log}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: '24px' }}>Top 3 Actionable Improvements</h3>
                <ul className="improvements-list">
                  {report.top3ActionableImprovements.map((imp, idx) => (
                    <li key={idx}>{imp}</li>
                  ))}
                </ul>
              </div>
              
              <div className="card" style={{ backgroundColor: 'rgba(255, 107, 53, 0.05)', borderColor: 'rgba(255, 107, 53, 0.2)' }}>
                <h3 style={{ marginBottom: '16px', color: 'var(--color-orange)' }}>Regional Gap Analysis</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '8px' }}>Missing Tools:</strong>
                    {report.regionalMarketGapAnalysis.missingCriticalTools.length > 0 ? (
                      <ul style={{ paddingLeft: '20px' }}>
                        {report.regionalMarketGapAnalysis.missingCriticalTools.map((tool, idx) => <li key={idx}>{tool}</li>)}
                      </ul>
                    ) : (
                      <p className="metric-obs">None detected.</p>
                    )}
                  </div>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '8px' }}>Missing Certifications:</strong>
                    {report.regionalMarketGapAnalysis.missingCertifications.length > 0 ? (
                      <ul style={{ paddingLeft: '20px' }}>
                        {report.regionalMarketGapAnalysis.missingCertifications.map((cert, idx) => <li key={idx}>{cert}</li>)}
                      </ul>
                    ) : (
                      <p className="metric-obs">None detected.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="actions-footer">
                <button onClick={() => window.print()} className="btn-secondary">
                  Download / Print Report
                </button>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
