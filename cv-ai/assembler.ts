/**
 * assembler.ts
 * --------------------------------------------------------------------------
 * Deterministic block selection + prompt assembly for the CV AI architecture.
 *
 * Pipeline:
 *   router answers + CV  ->  selectPersonaProfile()  ->  persona_profile
 *   persona_profile      ->  assemblePrompt()        ->  one system prompt
 *
 * The persona_profile is computed ONCE (in score mode), persisted on the
 * session, and reused unchanged in rebuild mode. This guarantees Phase 1 and
 * Phase 2 see the same rubric. Never call selectPersonaProfile() again in
 * rebuild mode — load the stored profile instead.
 * --------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCKS = join(__dirname, "prompt-blocks");

type Seniority = "entry" | "mid" | "senior" | "executive" | "academic";
type Persona = "early_career" | "experienced" | "executive" | "academic";
type Sector = "tech" | "finance" | "creative" | "operational" | "general";
type Localization = "tr_domestic" | "intl_multinational";
type Mode = "score" | "rebuild";

interface RouterAnswers {
  current_title: string;
  target_role: string;
  target_sector: string;
  target_region: string;
  seniority: Seniority;                  // explicit — never model-inferred
  company_type_hint?: "domestic" | "multinational" | "unknown";
}

interface PersonaProfile {
  persona: Persona;
  sector_overlay: Sector;
  localization: Localization;
  example: Persona;                      // example always matches persona
  output_language: "tr" | "en";
}

/* ------------------------------------------------------------------ */
/* 1. SELECTOR — pure, deterministic. Maps answers -> persona_profile. */
/* ------------------------------------------------------------------ */

function pickPersona(seniority: Seniority): Persona {
  switch (seniority) {
    case "academic":   return "academic";
    case "executive":  return "executive";
    case "senior":     return "experienced";   // senior IC/manager -> experienced rubric
    case "mid":        return "experienced";
    case "entry":      return "early_career";
  }
}

// Map free-text sector to one of the five overlays. Keep this table in code,
// not in the prompt — it must be deterministic and testable.
const SECTOR_MAP: Array<[RegExp, Sector]> = [
  [/(soft|develop|engineer|data|devops|it|yazılım|bilişim|teknoloji)/i, "tech"],
  [/(financ|bank|invest|account|audit|finans|muhasebe|denetim)/i,       "finance"],
  [/(design|market|brand|content|advert|creative|tasarım|pazarlama|reklam)/i, "creative"],
  [/(logist|warehouse|manufact|construct|retail|driver|production|lojistik|üretim|inşaat|perakende)/i, "operational"],
];

function pickSector(targetSector: string): Sector {
  for (const [re, sector] of SECTOR_MAP) if (re.test(targetSector)) return sector;
  return "general";
}

// Domestic vs multinational. Explicit hint wins; otherwise infer.
function pickLocalization(a: RouterAnswers, sector: Sector): Localization {
  if (a.company_type_hint === "multinational") return "intl_multinational";
  if (a.company_type_hint === "domestic")      return "tr_domestic";

  // Inference fallback: region outside Turkey OR tech sector (multinational/remote-heavy)
  const abroad = !/türkiye|turkey|tr\b|istanbul|ankara|izmir/i.test(a.target_region);
  if (abroad) return "intl_multinational";
  if (sector === "tech") return "intl_multinational"; // tech skews multinational in TR
  return "tr_domestic";
}

export function selectPersonaProfile(a: RouterAnswers): PersonaProfile {
  const persona = pickPersona(a.seniority);
  const sector_overlay = pickSector(a.target_sector);
  const localization = pickLocalization(a, sector_overlay);
  return {
    persona,
    sector_overlay,
    localization,
    example: persona,                                   // example always matches persona
    output_language: localization === "tr_domestic" ? "tr" : "en",
  };
}

/* ------------------------------------------------------------------ */
/* 2. ASSEMBLER — concatenates the selected blocks into one prompt.    */
/* ------------------------------------------------------------------ */

function load(...parts: string[]): string {
  return readFileSync(join(BLOCKS, ...parts), "utf8").trim();
}

export function assemblePrompt(profile: PersonaProfile, mode: Mode): string {
  // Order matters: core rules first, then the rubric, then modifiers, then the
  // wrapper, then the calibration example. Later blocks refine earlier ones.
  const segments = [
    load("core", "core.md"),
    load("core", "output-contract.md"),
    load("personas", `${profile.persona}.md`),
    load("sectors", `${profile.sector_overlay}.md`),
    load("localization", `${profile.localization}.md`),
    load("examples", `${profile.example}.md`),
    `# RUNTIME MODE\nmode: "${mode}"\noutput_language: "${profile.output_language}"`,
  ];
  return segments.join("\n\n---\n\n");
}

/* ------------------------------------------------------------------ */
/* 3. ENTRY POINTS                                                     */
/* ------------------------------------------------------------------ */

// Phase 1: compute profile, assemble, return BOTH so the profile can be persisted.
export function buildScoreCall(a: RouterAnswers) {
  const profile = selectPersonaProfile(a);
  const systemPrompt = assemblePrompt(profile, "score");
  return { profile, systemPrompt };   // persist `profile` on the session
}

// Phase 2: DO NOT re-select. Load the stored profile and reuse it.
export function buildRebuildCall(storedProfile: PersonaProfile) {
  const systemPrompt = assemblePrompt(storedProfile, "rebuild");
  return { systemPrompt };
}
