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
  model_used?: string;
  provider?: string;
  upstream_model?: string;
  elapsed_seconds?: number;
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
  applied_fixes: Array<{ finding_ref: string; what_changed: string }>;
  still_missing: Array<{ field: string; why_it_matters: string }>;
  model_used?: string;
  provider?: string;
  elapsed_seconds?: number;
}

export interface EvaluateResponse {
  profile: PersonaProfile;
  report: CVScoreReport;
}

/** Must stay in sync with MODEL_REGISTRY in functions/cv-backend/src/main.py. */
export const MODEL_ID = 'deepseek-v4-flash';
export const MODEL_LABEL = 'DeepSeek V4 Flash';

export const errorMessage = (err: unknown, fallback = 'Unexpected error.'): string => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
};

export interface IntakeData {
  targetJob: string;
  country: string;
  sector: string;
  seniority: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'https://6a66572c0032a728577a.fra.appwrite.run';

const DATABASE_ID = '69f6812900136900da98';
const COLLECTION_ID = 'first-collection';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = reject;
  });

/**
 * A network-level failure here is almost never a real CORS misconfiguration.
 * When an Appwrite function execution is killed by the gateway, the platform
 * returns its own error response which carries no Access-Control-* headers, so
 * the browser surfaces it as "Failed to fetch" / a CORS violation. Translate
 * that into something a user can act on.
 */
// Deliberately does not suggest raising the function timeout: Appwrite's
// synchronous HTTP ceiling is independent of it, so that advice sends people
// to a setting that cannot fix this.
const NETWORK_FAILURE_MESSAGE =
  `Could not reach the analysis service. The request never completed — ` +
  `check that the cv-backend function is deployed and that DEEPSEEK_API_KEY ` +
  `is set in the Appwrite console, then try again.`;

const postJSON = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const url = API_URL.includes('appwrite') ? API_URL : `${API_URL}/evaluate`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(NETWORK_FAILURE_MESSAGE);
  }

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(err.error ?? err.detail ?? `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
};

export const evaluateCV = async (
  pdfFile: File,
  intakeData: IntakeData,
  userConsent: boolean,
  onProgress?: (step: string) => void,
  onError?: (err: string) => void
): Promise<EvaluateResponse> => {
  onProgress?.('scanning');
  const pdf_base64 = await fileToBase64(pdfFile);

  const payload = {
    action: 'evaluate',
    pdf_base64,
    targetJob: intakeData.targetJob,
    country: intakeData.country,
    sector: intakeData.sector,
    seniority: intakeData.seniority,
    selected_model: MODEL_ID,
  };

  onProgress?.('market_search');
  const progressTimer = setTimeout(() => onProgress?.('ai_analysis'), 2500);

  let evaluateResp: EvaluateResponse;
  try {
    evaluateResp = await postJSON<EvaluateResponse>(payload);
  } finally {
    clearTimeout(progressTimer);
  }

  if (!evaluateResp.report) {
    throw new Error('Server returned an invalid report structure.');
  }

  // ── Consent-gated Appwrite persistence ────────────────────────────────────
  if (userConsent) {
    void (async () => {
      try {
        await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
          intakeData: JSON.stringify(intakeData),
          report: JSON.stringify(evaluateResp.report),
          profile: JSON.stringify(evaluateResp.profile),
          timestamp: new Date().toISOString(),
        });
      } catch (err: unknown) {
        console.error('Appwrite persistence failed:', err);
        onError?.(errorMessage(err, 'Could not save report to database.'));
      }
    })();
  }

  onProgress?.('complete');
  return evaluateResp;
};

export const rebuildCV = async (
  pdfFile: File,
  personaProfile: PersonaProfile,
  onProgress?: (step: string) => void
): Promise<CVRebuildReport> => {
  onProgress?.('ai_analysis');
  const pdf_base64 = await fileToBase64(pdfFile);

  const result = await postJSON<CVRebuildReport>({
    action: 'rebuild',
    pdf_base64,
    persona_profile: personaProfile,
    selected_model: MODEL_ID,
  });

  onProgress?.('complete');
  return result;
};
