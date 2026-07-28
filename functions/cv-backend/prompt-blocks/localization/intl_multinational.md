# LOCALIZATION WRAPPER: intl_multinational (multinationals in Turkey + applications abroad)

Applies on top of persona + sector. This wrapper governs applications to foreign-capital
firms operating in Turkey (e.g. global tech, FMCG, pharma) and to roles abroad/remote.

## Output language
- output_language = "en"
- Write all rebuilt content in English. Use standard international role titles.
- If the candidate's CV was Turkish, translate faithfully; do not inflate titles.

## Photo policy
- Photo is a LIABILITY here. Many multinational ATS pipelines and US-headquartered HR
  policies expect photo-less CVs, and photos can break column parsing.
- If a photo is present, raise a `format_flag` (major) recommending removal for this
  application type. Recommend filling the freed corner with a professional summary or
  contact block.

## KVKK / privacy fields
- Recommend REMOVING: photo, date of birth, marital status, nationality (unless work
  authorization is genuinely relevant), full home address.
- Keep: name, city + country, phone (international format), professional email,
  LinkedIn, portfolio/GitHub where relevant.
- Over-disclosure of personal data -> `kvkk_flag` recommending removal.

## ATS posture
- ATS checks are STRICT and can be blocking. Penalize parse-risk patterns: photos,
  multi-column layouts, text in headers/footers, tables, graphics-as-text.
- Reward role-critical keywords present in English (and Turkish too only if the listing
  is bilingual).
