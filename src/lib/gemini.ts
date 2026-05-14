import { ID } from 'appwrite';
import { databases } from '../appwrite';

export interface CVReport {
  executiveSummary: {
    candidateName: string;
    targetRegion: string;
    finalScore: number;
    verdict: string;
  };
  sections: Array<{
    category: string;
    score: number;
    primaryObservation: string;
    deductionLog: string[];
  }>;
  regionalMarketGapAnalysis: {
    missingCriticalTools: string[];
    missingCertifications: string[];
  };
  top3ActionableImprovements: string[];
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const evaluateCV = async (
  pdfFile: File,
  intakeData: { currentJob: string; targetJob: string; country: string; sector: string },
  userConsent: boolean,
  onProgress?: (step: string) => void,
  onError?: (err: string) => void
): Promise<CVReport> => {
  onProgress?.('scanning');

  const body = new FormData();
  body.append('pdf', pdfFile);
  body.append('currentJob', intakeData.currentJob);
  body.append('targetJob', intakeData.targetJob);
  body.append('country', intakeData.country);
  body.append('sector', intakeData.sector);

  onProgress?.('market_search');

  // Switch progress step after a short delay so the UI animates meaningfully
  const progressTimer = setTimeout(() => onProgress?.('ai_analysis'), 2500);

  let cvReport: CVReport;
  try {
    const response = await fetch(`${API_URL}/evaluate`, {
      method: 'POST',
      body,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail ?? 'Evaluation request failed.');
    }

    cvReport = await response.json();
  } finally {
    clearTimeout(progressTimer);
  }

  if (!cvReport.executiveSummary) {
    throw new Error('Server returned an invalid report structure.');
  }

  // ── Consent-gated Appwrite persistence ────────────────────────────────────
  if (userConsent) {
    Promise.resolve().then(async () => {
      try {
        const DATABASE_ID = '69f6812900136900da98';
        const COLLECTION_ID = 'first-collection';

        await databases.createDocument(
          DATABASE_ID,
          COLLECTION_ID,
          ID.unique(),
          {
            intakeData: JSON.stringify(intakeData),
            report: JSON.stringify(cvReport),
            timestamp: new Date().toISOString(),
          }
        );
      } catch (err: any) {
        console.error('Appwrite persistence failed:', err);
        onError?.(err.message ?? 'Could not save report to database.');
      }
    });
  }

  onProgress?.('complete');
  return cvReport;
};
