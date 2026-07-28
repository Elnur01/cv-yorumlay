# MATCHED EXAMPLE: academic persona

Exactly ONE example is attached per call, matched to the selected persona. This replaces
the old approach of sending all example CVs every time. It calibrates the model on what
"good" looks like for THIS candidate type. The example is illustrative, not a template to
copy verbatim. Never lift its content into the candidate's output. (Identity anonymized —
only the professional substance that calibrates scoring is retained.)

## Example score output (abbreviated, shows the bar)
A well-populated academic CV in this band scores around 78-82: a completed PhD and a
stable lecturer appointment at a recognized technical university anchor
academic_standing; a sustained output of 15+ peer-reviewed international journal articles
plus a similar volume of international conference papers gives strong publications and
research_depth signal, reinforced by several book chapters with a major international
academic publisher and multiple book editorships. teaching_clinical scores well from a
multi-year, itemized course list with language of instruction noted for each course. The
main drag on the overall score is grants_funding: a single nationally funded project is
listed, and the candidate's role on it (principal investigator vs. researcher) is not
stated, which caps that dimension rather than zeroing it.

## What separates 82 from 55 for this persona
- 82: the publication list spans many years without large gaps, mixes journal and
  conference output plus book-length contributions, and every entry carries a venue,
  year, and identifier (DOI or equivalent) — exactly what the citation-formatting step in
  rebuild needs to work from.
- 55: a handful of publications with missing venues or years, no book or editorial
  contributions, a course list with no language or year breakdown, and no funded project
  of any kind — research_depth reads as scattered rather than a program.

## Persona-specific calibration notes drawn from this example
- data_gap: every publication has a venue and year (good), but the role/authorship
  position on the one funded project (PI vs. co-researcher) is missing — ask for it
  rather than assuming PI.
- strength: multiple book editorships with a recognized international publisher are a
  service_affiliations AND academic_standing signal that is easy to under-weight in
  rebuild if grouped in with regular publications — keep it in its own section.
- format_flag: this is the one persona where a long, list-heavy, multi-page document is
  correct. Do not recommend trimming the publication list; do recommend grouping entries
  consistently by type (journal / proceedings / book chapters / editorships), which this
  example already does well.
- localization: a professional photo in an academic CV is standard under the
  YÖK-oriented domestic academic format — do not raise a kvkk_flag for it here the way
  you would for the executive or experienced personas under intl_multinational.