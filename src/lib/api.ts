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

export type Provider = 'nvidia' | 'deepseek';

export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
  providerLabel: string;
  logo: string;
  hint: string;
}

/**
 * Must stay in sync with MODEL_REGISTRY in functions/cv-backend/src/main.py.
 * The same DeepSeek model is offered through both providers on purpose, so
 * provider latency can be compared independently of model quality.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    providerLabel: 'DeepSeek API',
    logo: '/assets/deepseek.png',
    hint: 'Fastest',
  },
  {
    id: 'deepseek-v4-flash-nim',
    name: 'DeepSeek V4 Flash',
    provider: 'nvidia',
    providerLabel: 'NVIDIA NIM',
    logo: '/assets/deepseek.png',
    hint: '',
  },
  {
    id: 'deepseek-v4-pro-nim',
    name: 'DeepSeek V4 Pro',
    provider: 'nvidia',
    providerLabel: 'NVIDIA NIM',
    logo: '/assets/deepseek.png',
    hint: 'Deep reasoning',
  },
  {
    id: 'llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    provider: 'nvidia',
    providerLabel: 'NVIDIA NIM',
    logo: '/assets/meta-black-icon.png',
    hint: '',
  },
  {
    id: 'llama-3.2-90b-vision-instruct',
    name: 'Llama 3.2 90B Vision',
    provider: 'nvidia',
    providerLabel: 'NVIDIA NIM',
    logo: '/assets/meta-black-icon.png',
    hint: 'Multimodal',
  },
  {
    id: 'nemotron-nano-12b-v2-vl',
    name: 'Nemotron Nano 12B VL',
    provider: 'nvidia',
    providerLabel: 'NVIDIA NIM',
    logo: '/assets/nvidia-logo-black-and-white.png',
    hint: '',
  },
];

export const DEFAULT_MODEL_ID = 'deepseek-v4-flash';

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
  selectedModel: string;
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
const describeNetworkFailure = (modelId: string): string => {
  const model = MODEL_OPTIONS.find((m) => m.id === modelId);
  const label = model ? `${model.name} (${model.providerLabel})` : modelId;
  const fastest = MODEL_OPTIONS.find((m) => m.id === DEFAULT_MODEL_ID);
  // Deliberately does not suggest raising the function timeout: Appwrite's
  // synchronous HTTP ceiling (~35s) is independent of it, so that advice sends
  // people to a setting that cannot fix this. Nor does it suggest the model
  // the user already picked.
  const suggestion =
    fastest && modelId !== fastest.id
      ? `Pick a faster model — ${fastest.name} answers in about 8 seconds.`
      : `Check that the cv-backend function is deployed and its API keys are set in the Appwrite console.`;
  return (
    `Could not reach the analysis service while using ${label}. ` +
    `This usually means the request never completed. ${suggestion}`
  );
};

const postJSON = async <T>(payload: Record<string, unknown>, modelId: string): Promise<T> => {
  const url = API_URL.includes('appwrite') ? API_URL : `${API_URL}/evaluate`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(describeNetworkFailure(modelId));
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
    selected_model: intakeData.selectedModel ?? DEFAULT_MODEL_ID,
  };

  onProgress?.('market_search');
  const progressTimer = setTimeout(() => onProgress?.('ai_analysis'), 2500);

  let evaluateResp: EvaluateResponse;
  try {
    evaluateResp = await postJSON<EvaluateResponse>(payload, intakeData.selectedModel);
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
  selectedModel: string = DEFAULT_MODEL_ID,
  onProgress?: (step: string) => void
): Promise<CVRebuildReport> => {
  onProgress?.('ai_analysis');
  const pdf_base64 = await fileToBase64(pdfFile);

  const result = await postJSON<CVRebuildReport>(
    {
      action: 'rebuild',
      pdf_base64,
      persona_profile: personaProfile,
      selected_model: selectedModel,
    },
    selectedModel
  );

  onProgress?.('complete');
  return result;
};
