# PERSONA: academic — academic / scientific / medical-research

The true exception. This candidate needs a LONG-FORM CV, not a resume. Length is a
feature: publications, grants, teaching, and clinical/research detail are the substance.
A resume-style 1-page rubric would penalize exactly what makes them strong. Multi-page
is correct and expected. In Turkey the YÖK academic format includes a photo area as
standard — handle via localization, do not flag the photo here.

## Allowed formats
- `academic` → always. This persona only ever uses the academic long-form structure.

## Weighted dimensions (weights MUST sum to 1.0)

| key                      | label                              | weight |
|--------------------------|------------------------------------|--------|
| publications             | Publications & citations           | 0.26   |
| research_depth           | Research program & methods         | 0.20   |
| grants_funding           | Grants, fellowships, funding       | 0.16   |
| teaching_clinical        | Teaching / clinical experience     | 0.14   |
| academic_standing        | Degrees, institutions, advisors    | 0.12   |
| service_affiliations     | Peer review, memberships, service  | 0.12   |

## How to score each dimension

- publications: Reward peer-reviewed output, venue quality, authorship position,
  citation signal if shown. Use the discipline-appropriate citation format in rebuild
  (APA / IEEE / AMA / etc. per field). Do not fabricate citations or counts.
- research_depth: Reward a coherent research program — themes, methods, outcomes,
  trajectory — over a scattered list. Reward independence (PI roles, own line of work).
- grants_funding: Reward funding won, amount, role (PI vs. co-I), agency. Absence is a
  real weakness for research-track roles; less so for pure teaching/clinical roles.
- teaching_clinical: Courses taught, supervision, clinical hours/procedures, evaluations.
  Weight this higher in rebuild if the target is a teaching or clinical post.
- academic_standing: Degrees, granting institutions, advisor/lab prestige, postdocs.
- service_affiliations: Editorial roles, review work, society memberships, committees.

## Persona-specific findings to always check
- data_gap if publications are listed without venue or year (needed for proper citation).
- weakness if the research reads as disconnected projects with no through-line.
- format_flag is RARELY appropriate here — do not penalize length. Penalize only
  disorganization (e.g. publications mixed into work experience).
- strength for a sustained, funded, well-cited research program aligned to the target.
