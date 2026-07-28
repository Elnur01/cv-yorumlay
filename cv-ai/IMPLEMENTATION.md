# CV AI — Implementation Guide

This is the AI layer only: how the model is prompted, how blocks are selected and
assembled, how the two phases stay consistent, and how to test and operate it. It does
not cover frontend, auth, or storage beyond what the AI layer requires.

---

## 1. The model in one sentence

The model never sees one giant instruction file. For each request, the app **selects one
block per layer** based on the candidate, **concatenates** them into a single system
prompt, and makes **one** model call. The same selection (the *persona profile*) is reused
for both scoring and rebuilding so the candidate is judged and rebuilt by the same rubric.

---

## 2. Why this replaces the current monolith

Today: one instruction file + 3 example CVs go to the model on every call. The model must
self-select which rules apply, and every call pays for rules and examples it doesn't need.

Problems that fixes:
- **Accuracy** — when academic and junior rules are both in context, they bleed into each
  other (a grad student gets dinged for "no quantified business impact"; a CFO gets dinged
  for not being one page). Sending only the matching persona block removes the bleed.
- **Cost** — measured: assembled prompts are ~2.8k–3.1k tokens vs. ~9k–11k for the
  everything-prompt. ~65–70% fewer input tokens per call, before counting the example win.
- **Maintainability** — adding persona #5 (career-changer) or #6 (blue-collar narrative)
  is "add one block + one selector branch," not "untangle the mega-prompt."

---

## 3. The three layers (+ core + example)

```
core            (always)   role, scoring scale, hard rules, JSON contract
  + persona     (1 of 4)    the weighted rubric — THE accuracy lever
  + sector      (1 of 5)    thin weight modifiers + extra signals
  + localization(1 of 2)    TR-domestic vs multinational: language, photo, KVKK
  + example     (1 of 4)    one calibration CV matched to the persona — THE cost lever
```

File tree (all under `prompt-blocks/`):

```
core/core.md                 core/output-contract.md
personas/early_career.md     personas/experienced.md
personas/executive.md        personas/academic.md
sectors/tech.md  sectors/finance.md  sectors/creative.md
sectors/operational.md       sectors/general.md
localization/tr_domestic.md  localization/intl_multinational.md
examples/early_career.md     examples/experienced.md
examples/executive.md        examples/academic.md
```

Design rules for blocks:
- **Persona** owns the dimension list and the weights (must sum to 1.0).
- **Sector** only *modifies* weights and adds signals; it never restates the rubric.
- **Localization** never touches scoring weights; it governs language, photo, KVKK.
- **Core** owns the output schema. The schema is identical for everyone — only values
  change. This keeps the frontend single-path.

---

## 4. The selector (deterministic, in code — not in the model)

Input: the 4 router fields (`current_title`, `target_role`, `target_sector`,
`target_region`) **plus an explicit `seniority`** and an optional `company_type_hint`.

Mapping (see `assembler.ts`):
- `seniority` -> persona. `entry`->early_career, `mid`/`senior`->experienced,
  `executive`->executive, `academic`->academic.
- `target_sector` -> sector overlay via a regex table (TR + EN keywords). No match ->
  `general`.
- region + hint + sector -> localization. Explicit hint wins; else: abroad ->
  multinational; tech in TR -> multinational; otherwise -> tr_domestic.
- example = persona (always matched).
- output_language derives from localization (tr_domestic->tr, else en).

> **Critical:** seniority is the field that picks the rubric, so it must be **explicit**,
> not inferred by the model. Either add it as a 4th tap in the pre-analysis questions, or
> derive it in code from `current_title` with a deterministic lookup. Do not let the model
> classify the thing that selects its own rubric.

The selector's output is the **persona profile** — the single source of truth.

---

## 5. The two phases and how they stay consistent

```
Phase 1 (score):
  router answers --> selectPersonaProfile() --> persona_profile  [PERSIST THIS]
                     assemblePrompt(profile, "score") --> system prompt
                     model call --> score JSON

Phase 2 (rebuild):
  load persisted persona_profile             [DO NOT re-select]
  assemblePrompt(profile, "rebuild") --> system prompt
  model call --> rebuilt CV JSON
```

The contract: **Phase 2 never calls the selector.** It loads the profile saved in Phase 1.
This is what prevents "scored as an executive, rebuilt as a junior." Store `persona_profile`
on the session/analysis record the moment Phase 1 runs.

---

## 6. The model call

- Put the assembled string in the **system** prompt.
- Put the candidate's CV (the `cv` object: `raw_text`, `has_photo`, `page_count`, optional
  pre-parsed `sections`) in the **user** message, clearly delimited.
- Request strict JSON. Validate the response against `output-contract.md` before trusting
  it (see §7). If your provider supports structured/JSON output mode, use it.
- Temperature: low (0–0.3). Scoring must be reproducible; §determinism in core depends on it.

Message skeleton:
```
system:  <assembled prompt>
user:    Here is the candidate CV to {score|rebuild}. Target role: <target_role>.
         <<<CV
         <cv.raw_text>
         CV>>>
         has_photo: <bool>   page_count: <int>
```

---

## 7. Validation gate (do not skip)

After every model call, before using the result:

1. **JSON parses.** If not, one retry with a "return valid JSON only" nudge, then fail.
2. **Weights sum to 1.0** (±0.001). If not, reject — the persona/sector math is wrong.
3. **overall_score == round(Σ weight·score)**. Recompute in code; if it disagrees, trust
   the code's number and log the drift.
4. **format_recommendation is in the persona's allowed set** (e.g. academic persona must
   return `academic`; experienced must never return `academic`).
5. **Rebuild only:** every `block.source_ref` traces to real CV input. Any block without a
   valid source_ref is fabricated -> strip it and log.
6. **KVKK:** if localization is `intl_multinational` and the rebuild still contains photo /
   DOB / marital status / national ID, reject and re-run — the wrapper was ignored.

These checks are cheap and catch the failure modes that erode trust fastest.

---

## 8. Cost & latency notes

- Per-call input ~2.8k–3.1k tokens (measured across the 6-case matrix). The biggest single
  saving vs. the monolith is sending **one** matched example instead of three.
- Cache the **core** + **output-contract** blocks if your provider supports prompt caching —
  they're identical on every call.
- One call per phase. Do **not** chain multiple calls per phase yet; you ranked cost above
  maintainability and single-call assembly captures most of the accuracy gain.

---

## 9. Testing strategy

- **Selector unit tests:** table-driven. Assert (seniority, sector text, region, hint) ->
  exact (persona, sector, localization, language). Cover TR and EN sector keywords, abroad
  regions, and the tech->multinational inference.
- **Assembly smoke test:** for all 4×5×2 = 40 combinations, assert the prompt builds with
  no missing file and weights in the persona block sum to 1.0. (The 6-case `verify.mjs`
  is the seed — expand it to the full matrix.)
- **Golden CVs:** keep 2–3 labeled CVs per persona with expected score bands. Run on every
  prompt-block edit; alert if a score moves more than ~5 points (catches prompt drift).
- **Phase parity test:** score then rebuild a CV; assert both used the same persona_profile
  and that rebuild's `still_missing` ⊇ score's unresolved `data_gap` findings.
- **KVKK red-team:** feed a CV with photo + national ID under the multinational wrapper;
  assert a kvkk_flag in score and removal in rebuild.

---

## 10. How to extend later (no pipeline changes)

- **Add persona #5 (career_changer):** add `personas/career_changer.md` (functional-leaning
  rubric that rewards transferable skills and reframes history), `examples/career_changer.md`,
  one selector branch, and add the enum value in the schema + contract. Nothing else changes.
- **Add persona #6 (operational/blue-collar narrative):** same pattern; this one pairs
  naturally with the existing `operational` sector overlay.
- **Add a sector:** add `sectors/<name>.md` + one regex row. Overlays are additive, so no
  persona edits.
- **Tune a rubric:** edit one persona file's weights. Re-run golden CVs. Ship.

---

## 11. File manifest

```
runtime-context.schema.json   the input object the app builds + persists
assembler.ts                  selector + prompt assembly (entry points at bottom)
prompt-blocks/                the 16 blocks (core ×2, personas ×4, sectors ×5,
                              localization ×2, examples ×4 — note examples/early_career,
                              executive, academic are structured stubs to fill with one
                              annotated exemplar each, same shape as experienced.md)
verify.mjs                    runnable 6-case assembly + token-size check
```

Build order for the team: (1) finish the three example stubs, (2) wire the selector behind
the existing router with explicit seniority, (3) add the validation gate, (4) persist the
persona profile and make Phase 2 load it, (5) add golden-CV tests.
