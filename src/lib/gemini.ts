import { ID } from 'appwrite';
import { databases } from '../appwrite';

export interface PersonaProfile {
  persona: 'early_career' | 'experienced' | 'executive' | 'academic';
  sector_overlay: 'tech' | 'finance' | 'creative' | 'operational' | 'general';
  localization: 'tr_domestic' | 'intl_multinational';
  example: string;
  output_language: 'tr' | 'en';
}

export interface CVScoreReport {
  mode: 'score';
  persona: string;
  target: {
    role: string;
    sector: string;
    region: string;
    company_type: 'domestic' | 'multinational';
  };
  overall_score: number;
  verdict: 'strong' | 'competitive' | 'needs_work' | 'not_ready';
  dimensions: Array<{
    key: string;
    label: string;
    weight: number;
    score: number;
    rationale: string;
    severity: 'ok' | 'minor' | 'major' | 'blocker';
  }>;
  findings: Array<{
    type: 'strength' | 'weakness' | 'data_gap' | 'kvkk_flag' | 'format_flag';
    dimension_key: string;
    message: string;
    fix_hint: string;
  }>;
  ats: {
    score: number;
    missing_keywords: string[];
    parse_risks: string[];
  };
  format_recommendation: 'chronological' | 'functional' | 'combination' | 'academic';
  rebuild_ready: boolean;
}

export interface CVRebuildBlock {
  type: 'paragraph' | 'bullet_list' | 'entry';
  content: string | string[];
  source_ref: string;
}

export interface CVRebuildSection {
  key: string;
  title: string;
  blocks: CVRebuildBlock[];
}

export interface CVRebuildReport {
  mode: 'rebuild';
  persona: string;
  format_used: 'chronological' | 'functional' | 'combination' | 'academic';
  output_language: 'tr' | 'en';
  sections: CVRebuildSection[];
  applied_fixes: Array<{
    finding_ref: string;
    what_changed: string;
  }>;
  still_missing: Array<{
    field: string;
    why_it_matters: string;
  }>;
}

export interface EvaluateResponse {
  profile: PersonaProfile;
  report: CVScoreReport;
  monolith_report?: any;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'https://6a66572c0032a728577a.fra.appwrite.run';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const evaluateCV = async (
  pdfFile: File,
  intakeData: { 
    currentJob: string; 
    targetJob: string; 
    country: string; 
    sector: string;
    seniority: string;
    companyTypeHint: string;
    selectedModel?: string;
    useMonolith?: boolean;
    compareMonolith?: boolean;
  },
  userConsent: boolean,
  onProgress?: (step: string) => void,
  onError?: (err: string) => void
): Promise<EvaluateResponse> => {
  onProgress?.('scanning');

  const pdf_base64 = await fileToBase64(pdfFile);

  const payload = {
    action: 'evaluate',
    pdf_base64,
    currentJob: intakeData.currentJob,
    targetJob: intakeData.targetJob,
    country: intakeData.country,
    sector: intakeData.sector,
    seniority: intakeData.seniority,
    companyTypeHint: intakeData.companyTypeHint,
    selected_model: intakeData.selectedModel ?? 'deepseek-chat',
    useMonolith: intakeData.useMonolith,
    compareMonolith: intakeData.compareMonolith,
  };

  onProgress?.('market_search');

  const progressTimer = setTimeout(() => onProgress?.('ai_analysis'), 2500);

  let evaluateResp: EvaluateResponse;
  try {
    const url = API_URL.includes('appwrite') ? API_URL : `${API_URL}/evaluate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText, error: response.statusText }));
      throw new Error(err.detail ?? err.error ?? 'Evaluation request failed.');
    }

    evaluateResp = await response.json();
  } finally {
    clearTimeout(progressTimer);
  }

  if (!evaluateResp.report) {
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
            report: JSON.stringify(evaluateResp.report),
            profile: JSON.stringify(evaluateResp.profile),
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
  return evaluateResp;
};

export const rebuildCV = async (
  pdfFile: File,
  personaProfile: PersonaProfile,
  selectedModel?: string,
  onProgress?: (step: string) => void
): Promise<CVRebuildReport> => {
  onProgress?.('ai_analysis');

  const pdf_base64 = await fileToBase64(pdfFile);

  const payload = {
    action: 'rebuild',
    pdf_base64,
    persona_profile: personaProfile,
    selected_model: selectedModel ?? 'deepseek-chat',
  };

  const url = API_URL.includes('appwrite') ? API_URL : `${API_URL}/rebuild`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText, error: response.statusText }));
    throw new Error(err.detail ?? err.error ?? 'Rebuild request failed.');
  }

  const result: CVRebuildReport = await response.json();
  onProgress?.('complete');
  return result;
};

