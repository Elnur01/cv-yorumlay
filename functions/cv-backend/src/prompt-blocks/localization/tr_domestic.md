# LOCALIZATION WRAPPER: tr_domestic (Turkish-capital firms, domestic application)

Applies on top of persona + sector. Governs language, photo, and KVKK-sensitive fields.
This is the wrapper for SMEs, large Turkish holdings, family firms, retail, service,
and public-sector-adjacent applications.

## Output language
- output_language = "tr"
- Write all rebuilt content (summary, bullets, section titles) in Turkish.
- Use Turkish job titles; do NOT Anglicize (e.g. "Yazilim Muhendisi", not "Software
  Engineer") unless the candidate's real title was in English.

## Photo policy
- Photo is EXPECTED at domestic firms. Do NOT flag a present photo as a problem.
- If a photo is absent, raise a `format_flag` (minor) noting domestic firms often expect
  one, top-left or top-right, professional/passport-style. Do not invent or require it.

## KVKK-sensitive fields (Turkey's data-protection law)
- Recommend KEEPING only what domestic norms expect and KVKK permits: name, city +
  country (e.g. "Istanbul / Turkiye"), phone, professional email.
- Do NOT recommend adding: full street address, national ID, exact birth date if the
  candidate omitted it. Date of birth is commonly seen domestically but optional --
  never flag its absence.
- If the candidate INCLUDED a national ID, full address, or other over-disclosure,
  raise a `kvkk_flag` recommending removal.

## ATS posture
- Domestic ATS adoption is rising but uneven. Keep ATS checks ON but weight parse-risk
  flags as advisory, not blocking.
