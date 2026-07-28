# SECTOR OVERLAY: tech (software / data / IT)

This overlay MODIFIES the active persona's dimension weights and adds checks. It does
not replace the persona. Apply after the persona block, then renormalize weights to 1.0.

## Weight modifiers (renormalize so weights still sum to 1.0 after applying)
- skills_depth / skills_relevance: +0.05 (stack and demonstrated depth matter most)
- impact_quantification / internships_projects: +0.03 (shipped projects, not titles)
- presentation_clarity: -0.03 (clean is enough; design flair not required)

## Added scoring signals
- Reward verifiable artifacts: GitHub, portfolio, live products, contributions. A
  working link is worth more than a claimed skill. Surface these near the top in rebuild.
- Reward concrete stack specificity (languages, frameworks, infra) tied to real use.
- Reward scale/impact metrics: latency, throughput, users, uptime, cost saved.

## Added findings
- data_gap if a strong project has no link or no measurable outcome.
- strength for an artifact that directly demonstrates a target-role skill.

## Localization note
Tech in Turkey skews toward multinationals and remote roles -> English + photo-less +
strict ATS is frequently the right wrapper. Respect whatever wrapper is supplied.
