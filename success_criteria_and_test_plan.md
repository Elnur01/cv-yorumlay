# Neural E-Commerce — Success Criteria & Comprehensive Test Plan

**Companion to:** `realistic_simulation_roadmap_v4.md`
**Date:** 2026-05-09
**Audience:** Researcher (Feyruz) + incoming engineering team
**Purpose:** Define when the project is "done" and how we prove it.

---

## Part A — Success Criteria

Success is multi-dimensional. We measure on four tiers; the project ships only when all four pass.

### Tier 1 — Technical success (does it work?)

| # | Criterion | Target | How measured |
|---|---|---|---|
| T1 | Full user flow works end-to-end | 100% pass | E2E Playwright test green on Chrome, Firefox, Safari |
| T2 | All 7 work packages deployed | 100% checklist items closed | §18 of v4 roadmap |
| T3 | Backend uptime during study | ≥ 99.5% | Render/Railway dashboard |
| T4 | API response time (p95) | < 500 ms | Sentry performance |
| T5 | Page load time (p95) | < 2.5 s on 4G profile | Lighthouse CI |
| T6 | Sentry error rate | < 1% of requests | Sentry dashboard |
| T7 | Zero data loss in event ingestion | 100% of fired events persisted | Compare client-side counter to DB row count |
| T8 | Bilingual rendering correct | 100% of pages in both EN and TR | Manual UAT |
| T9 | Mobile responsive | Usable on 375px+ viewports | Manual device test |

### Tier 2 — Data quality success (is the dataset usable?)

| # | Criterion | Target | How measured |
|---|---|---|---|
| D1 | Demographic table completeness | 100% of `users` rows have all 30 spec fields non-null | `02_validation.ipynb` |
| D2 | Sequential table completeness | ≥ 99% of `events` rows have all 19 spec fields populated where applicable | `02_validation.ipynb` |
| D3 | Joinability | 100% of events join to a user via `customer_id` | SQL outer-join check |
| D4 | Schema drift | 0 schema mismatches between code and DB | Pydantic ↔ SQL CI check |
| D5 | Reproducible segmentation | Same `customer_id` → same segments on re-run | Unit test |
| D6 | Event volume per session | Median ≥ 15 events, mean ≥ 25 | SQL aggregate |
| D7 | All 4 scenarios represented | Each arm ≥ 20 completed sessions | SQL count |
| D8 | All 5 abandonment stages observed | Each stage has ≥ 1 session | SQL count |
| D9 | All 16 budget cells populated | Each (age × loyalty) cell has ≥ 1 user | SQL count |
| D10 | All product images present | 100% of products have `image_count ≥ 1` | SQL check |

### Tier 3 — Research validity success (will the dataset answer the question?)

These are checked after the pilot and re-checked at study close.

| # | Criterion | Target | How measured |
|---|---|---|---|
| R1 | Scenario manipulation effective | Abandonment rate differs by intent level (chi-square p < 0.05 with full sample) | Validation query 1, §19 v4 |
| R2 | Budget utilization spread | At least 5 of 10 deciles populated; not bimodal at 0/100 | Validation query 2 |
| R3 | Behavioral inference matches self-report | Correlation between `mission_alignment_score` and `mission_completed_self_report` ≥ 0.5 | Validation query 3 |
| R4 | Realism perception | Median `overall_realism_score` ≥ 5 / 7 | Validation query 5 |
| R5 | Coupon search penetration | ≥ 30% of sessions have ≥ 1 `coupon_search` event | Validation query 6 |
| R6 | Image engagement signal | Sessions with > 1 image viewed have measurably different purchase rate vs. those with 1 | Validation query 4 |
| R7 | Mission alignment dispersion | At least 20% of sessions score > 0.7 AND at least 20% score < 0.4 | Custom SQL |
| R8 | Recall accuracy | ≥ 60% of `scenario_recall_check` events answered correctly (proves participants paid attention) | SQL aggregate |
| R9 | Scenario balance | No arm < 15% or > 35% of total sample | SQL aggregate |
| R10 | Abandonment funnel non-trivial | ≥ 30% of sessions are non-`completed`, ≥ 30% are `completed` | SQL aggregate |

### Tier 4 — Operational / ethical success (is the study defensible?)

| # | Criterion | Target | How measured |
|---|---|---|---|
| O1 | Sample size | ≥ 80 completed sessions (20 per arm) | SQL count |
| O2 | Pilot to production gap | ≥ 7 days between pilot end and recruitment open | Calendar |
| O3 | Consent compliance | 100% of participants saw KVKK paragraph and clicked accept | DB check on `consent_accepted_at` |
| O4 | Lottery executed within 7 days of close | 5 winners notified | Email log |
| O5 | Data export reproducible | `export_data.py` produces identical output on two consecutive runs | CI check |
| O6 | Deletion requests honored | < 48 h response time | Manual log |
| O7 | No PII in Sentry / logs | 0 emails or free-text survey content in error reports | Sentry sample audit |

---

### How to use these tiers

- **Tier 1 + 2 must pass before pilot opens.** No exceptions.
- **Tier 3 must pass on the pilot data before recruitment opens.** If R1–R10 don't meet thresholds with 10 pilot users, iterate before scaling.
- **Tier 4 is checked at study close** before any analysis is published.

---

## Part B — Comprehensive Test Plan

Six layers of testing, each with explicit ownership and acceptance criteria.

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 6: Pilot Study (10 real users)                            │
│ Layer 5: User Acceptance Testing (researcher-driven)            │
│ Layer 4: Data Quality Tests (post-pilot, post-launch)           │
│ Layer 3: End-to-End Tests (Playwright, full flows)              │
│ Layer 2: Integration Tests (API + DB)                           │
│ Layer 1: Unit Tests (segmentation, tracker, validators)         │
└─────────────────────────────────────────────────────────────────┘
```

---

### Layer 1 — Unit tests

**Owner:** Engineering team
**When:** During each WP implementation
**Tooling:** `pytest` (backend), `vitest` or `jest` (frontend)
**Coverage target:** ≥ 80% on `services/`, `routers/`, `lib/tracker.ts`

#### 1.1 Segmentation tests (`backend/tests/test_segmentation.py`)

```python
def test_age_group_boundaries():
    assert compute_age_group(17) == "18-24"  # below floor → still 18-24 by spec
    assert compute_age_group(18) == "18-24"
    assert compute_age_group(24) == "18-24"
    assert compute_age_group(25) == "25-34"
    assert compute_age_group(34) == "25-34"
    assert compute_age_group(35) == "35-44"
    assert compute_age_group(44) == "35-44"
    assert compute_age_group(45) == "45+"
    assert compute_age_group(99) == "45+"

def test_city_tier_all_cities():
    for c in ["Istanbul", "Ankara", "Izmir", "Baku"]: assert compute_city_tier(c) == "Tier-1"
    for c in ["Kocaeli", "Edirne", "Sivas"]:          assert compute_city_tier(c) == "Tier-2"
    for c in ["Bolu", "Igdir", "Rize"]:               assert compute_city_tier(c) == "Tier-3"
    assert compute_city_tier("Unknown") == "Tier-3"   # safe default

def test_lifetime_order_count_freq_zero():
    assert compute_lifetime_order_count("uid", 0) == 0

def test_lifetime_order_count_reproducible():
    a = compute_lifetime_order_count("user-abc", 7)
    b = compute_lifetime_order_count("user-abc", 7)
    assert a == b

def test_loyalty_tier_thresholds():
    assert compute_loyalty_tier(0)      == "Bronze"
    assert compute_loyalty_tier(4999)   == "Bronze"
    assert compute_loyalty_tier(5000)   == "Silver"
    assert compute_loyalty_tier(14999)  == "Silver"
    assert compute_loyalty_tier(15000)  == "Gold"
    assert compute_loyalty_tier(29999)  == "Gold"
    assert compute_loyalty_tier(30000)  == "Platinum"

@pytest.mark.parametrize("age,loyalty", [
    (ag, lt) for ag in ["18-24","25-34","35-44","45+"]
             for lt in ["Bronze","Silver","Gold","Platinum"]
])
def test_budget_matrix_all_16_cells(age, loyalty):
    budget = assign_budget("test-uid", age, loyalty)
    low, high = BUDGET_MATRIX[(age, loyalty)]
    assert low <= budget <= high

def test_scenario_assignment_deterministic():
    s1 = assign_scenario("user-xyz")
    s2 = assign_scenario("user-xyz")
    assert s1 == s2

def test_scenario_assignment_balanced_over_1000_uuids():
    counts = Counter(assign_scenario(str(uuid.uuid4())) for _ in range(1000))
    for arm in SCENARIOS:
        assert 200 <= counts[arm] <= 300, f"{arm} imbalanced: {counts[arm]}"

def test_segmentation_full_payload():
    form = sample_signup_form()
    out = compute_segmentation(form, "uid-1", USER_AGENT_DESKTOP, "tr")
    required = {"age_group","gender","city_tier","account_age_days",
                "lifetime_order_count","total_order_value","avg_order_value",
                "loyalty_tier","credit_balance_initial","scenario_id",
                "scenario_text_shown","scenario_text_lang"}
    assert required.issubset(out.keys())
    assert out["scenario_text_lang"] == "tr"
    assert "[BUDGET]" not in out["scenario_text_shown"]  # placeholder filled
```

#### 1.2 Coupon validation tests

```python
def test_coupon_valid()
def test_coupon_expired()
def test_coupon_already_used()
def test_coupon_minimum_cart_not_met()
def test_coupon_invalid_code()
```

#### 1.3 Wallet tests

```python
def test_checkout_deducts_correct_amount()
def test_checkout_fails_when_balance_insufficient()
def test_checkout_with_coupon_applies_discount()
def test_balance_never_goes_negative()
```

#### 1.4 Tracker SDK tests (`frontend/lib/tracker.test.ts`)

```ts
test('recordRemoveFromCart fires correct event shape')
test('recordRemoveFromCart increments cart_add_remove_count')
test('markCouponSearched(focus) does not flip coupon_applied flag')
test('markCouponSearched(apply, success) flips coupon_applied flag')
test('markCouponSearched(apply, failure) does not flip flag')
test('incrementImageView increases counter')
test('session flush sends batched events')
test('beforeunload triggers sendBeacon flush')
test('back button increments back_button_count')
test('exit_intent_triggered fires once per session max')
```

#### 1.5 Mission alignment scoring tests

```python
def test_mission_alignment_replacement_buys_phone():
    s = mock_session(scenario="A_replacement", purchased_category="phones",
                     visited=["phones","accessories"], event_count=20)
    assert compute_mission_alignment(s) == 1.0

def test_mission_alignment_replacement_buys_laptop():
    s = mock_session(scenario="A_replacement", purchased_category="laptops",
                     visited=["laptops"], event_count=15)
    assert compute_mission_alignment(s) == 0.3

def test_mission_alignment_browse_high_engagement():
    s = mock_session(scenario="D_browse", purchased=False,
                     visited=["phones","laptops","headphones"], event_count=30)
    assert compute_mission_alignment(s) == 1.0
```

**Acceptance gate:** ≥ 80% line coverage on touched files; all tests green in CI.

---

### Layer 2 — Integration tests

**Owner:** Engineering team
**When:** Per work package, before merging
**Tooling:** `pytest` + `httpx` for API, in-memory PG (testcontainers) or transactional rollback per test

#### 2.1 Auth + signup flow

```python
def test_full_signup_creates_user_with_segmentation():
    r = client.post("/auth/signup", json=valid_signup_payload())
    assert r.status_code == 200
    user_id = r.json()["customer_id"]
    user = db.get(User, user_id)
    assert user.scenario_id in SCENARIOS
    assert user.credit_balance_initial > 0
    assert user.scenario_text_shown != ""
    assert user.budget_matrix_version == "v1"
```

#### 2.2 Cart & checkout integration

```python
def test_add_item_then_checkout_updates_balance()
def test_checkout_with_invalid_coupon_returns_400()
def test_checkout_persists_order_and_clears_cart()
def test_concurrent_checkouts_for_same_user_dont_double_charge()  # transactional safety
```

#### 2.3 Event ingestion

```python
def test_post_events_batch_persists_all_rows()
def test_event_with_missing_required_field_returns_422()
def test_event_with_invalid_session_id_returns_404()
def test_event_scenario_id_denormalized_from_user()
```

#### 2.4 Scenario acknowledgment

```python
def test_scenario_acknowledge_records_text_verbatim()
def test_scenario_acknowledge_records_read_time()
def test_scenario_acknowledge_idempotent()  # second call doesn't overwrite
```

#### 2.5 Survey submission

```python
def test_survey_submit_validates_likert_range_1_to_7()
def test_survey_submit_one_per_session()
def test_survey_submit_makes_user_lottery_eligible()
```

**Acceptance gate:** all integration tests green; manual smoke of /health and /auth/me.

---

### Layer 3 — End-to-End tests (Playwright)

**Owner:** Engineering team
**When:** Daily in CI; before each deployment
**Tooling:** Playwright on Chrome / Firefox / WebKit
**Existing baseline:** `frontend/tests/e2e/flow.spec.ts`

#### 3.1 Happy path — complete purchase

```ts
test('full happy path: consent → onboarding → scenario → shop → product → cart → checkout → debrief', async ({ page }) => {
  await page.goto('/');
  // consent
  await page.check('input#consent-checkbox');
  await page.click('button:has-text("Continue")');
  // onboarding (fill all fields)
  // scenario (wait 8s, click continue)
  await page.waitForTimeout(8500);
  await page.click('button:has-text("I understand")');
  // shop: filter, add to cart
  // product detail: click 2 image thumbnails, add to cart
  // cart: apply coupon, modify quantity, checkout
  // verify order confirmation
  // complete debrief survey
  // verify lottery_eligible flipped
});
```

#### 3.2 Abandonment paths — one test per stage

```ts
test('abandoned_browse: leaves before adding to cart')
test('abandoned_cart: adds item, navigates away from /cart')
test('abandoned_checkout: reaches /cart/checkout, navigates away')
test('abandoned_payment: starts submission, simulates network failure')
```

Each test verifies the correct `abandonment_stage` is written at session_end.

#### 3.3 Tracker correctness

```ts
test('all 13+ event types fire in expected sequence', async ({ page }) => {
  // intercept /events POST
  const captured: Event[] = [];
  await page.route('**/events', (route) => { captured.push(...route.request().postDataJSON()); route.fulfill({ status: 200 }); });
  // run full flow
  // assert presence of every event_type in captured array
  expect(new Set(captured.map(e => e.event_type))).toEqual(new Set([
    'view','add_to_cart','remove_from_cart','checkout_start','coupon_search',
    'review_section_visit','order_completed','cart_view','checkout_abandoned',
    'exit_intent_shown','session_end','scenario_recall_modal_opened',
    'scenario_recall_check','product_image_viewed'
  ]));
});

test('19 fields populated correctly on add_to_cart event')
test('back_button_count increments on browser back navigation')
test('exit_intent fires on mouseleave to top of viewport')
test('time_on_page_sec is non-zero and reasonable')
test('scroll_depth_pct reaches 100 when scrolled to bottom')
```

#### 3.4 Bilingual flow

```ts
test('full flow works in Turkish', async ({ page }) => {
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'language', { value: 'tr-TR' });
  });
  // run full flow, assert all visible text matches Turkish copy
});
test('language toggle on /scenario page persists across navigation')
```

#### 3.5 Edge cases

```ts
test('signup with city not in any tier defaults to Tier-3')
test('signup with last_purchase_date in future returns 422')
test('checkout when balance < cart_total disables button and shows error')
test('promo code with whitespace and case variations is normalized')
test('refresh during checkout does not double-charge')
test('mid-task recall modal appears at 5 min if no add_to_cart')
test('mid-task recall modal appears at first add_to_cart if before 5 min')
test('mid-task recall modal does not appear twice in same session')
```

#### 3.6 Cross-browser matrix

| Test | Chrome | Firefox | Safari (WebKit) | Mobile Chrome |
|---|---|---|---|---|
| Happy path | ✓ | ✓ | ✓ | ✓ |
| Tracker events | ✓ | ✓ | ✓ | — |
| Exit intent | ✓ | ✓ | ✓ | — (touch) |
| Bilingual toggle | ✓ | ✓ | ✓ | ✓ |

**Acceptance gate:** all E2E green on all 4 environments; happy path runs in < 90 seconds.

---

### Layer 4 — Data quality tests

**Owner:** Researcher (with engineering support)
**When:** After pilot; weekly during recruitment; at study close
**Tooling:** Jupyter notebooks (`research/notebooks/02_validation.ipynb`)

#### 4.1 Schema validation

```python
EXPECTED_DEMO_COLS = {30 named columns from spec}
EXPECTED_EVENT_COLS = {19 base + 6 new = 25 columns}

def test_demographic_schema():
    df = pd.read_sql("SELECT * FROM users", conn)
    assert set(df.columns).issuperset(EXPECTED_DEMO_COLS)
    for c in EXPECTED_DEMO_COLS:
        assert df[c].notna().all() or c in NULLABLE_COLS, f"{c} has nulls"

def test_event_schema():
    df = pd.read_sql("SELECT * FROM events", conn)
    assert set(df.columns).issuperset(EXPECTED_EVENT_COLS)
```

#### 4.2 Joinability

```python
def test_every_event_joins_to_user():
    orphans = pd.read_sql("""
        SELECT COUNT(*) FROM events e
        LEFT JOIN users u USING (customer_id)
        WHERE u.customer_id IS NULL
    """, conn).iloc[0, 0]
    assert orphans == 0

def test_every_session_joins_to_user()
def test_every_survey_joins_to_session()
```

#### 4.3 Distribution sanity

```python
def test_age_groups_all_present()
def test_all_4_scenarios_have_at_least_20_completed()
def test_all_5_abandonment_stages_observed()
def test_budget_distribution_matches_matrix_within_5pct()
def test_no_session_has_more_than_500_events()  # bot detection
def test_no_session_has_fewer_than_3_events()   # immediate-bounce filter
```

#### 4.4 Logic consistency

```python
def test_purchase_implies_completed_stage():
    # If order exists, abandonment_stage must be 'completed'
    bad = pd.read_sql("""
        SELECT s.session_id FROM sessions s
        JOIN orders o USING (customer_id)
        WHERE o.session_id = s.session_id
          AND s.abandonment_stage != 'completed'
    """, conn)
    assert len(bad) == 0

def test_completed_implies_balance_deduction()
def test_coupon_applied_implies_coupon_search_event()
def test_remove_from_cart_count_matches_event_count()
def test_cart_total_at_event_is_non_negative()
def test_budget_utilization_capped_at_100pct()
def test_scenario_id_consistent_across_user_and_events()
```

#### 4.5 Reproducibility

```python
def test_export_is_deterministic():
    out1 = run_export()
    out2 = run_export()
    assert_frame_equal(out1.demographic, out2.demographic)
    assert_frame_equal(out1.sequential, out2.sequential)
```

**Acceptance gate:** every test in `02_validation.ipynb` green before recruitment opens.

---

### Layer 5 — User acceptance testing (UAT)

**Owner:** Researcher
**When:** After Day 11 deployment, before pilot
**Method:** Researcher walks through the full flow as if a participant

#### 5.1 UAT checklist (researcher to execute personally, twice — once EN, once TR)

```
[ ] Land on /  → consent page renders correctly with KVKK paragraph
[ ] Cannot proceed without checking consent box
[ ] Lottery copy visible
[ ] Onboarding form: every field validates correctly (age range, city dropdown, date picker)
[ ] After signup, redirected to /scenario
[ ] Scenario text shows assigned scenario with budget filled in
[ ] Cannot click Continue before 8s
[ ] Language toggle works and switches text instantly
[ ] After scenario, lands on /shop
[ ] Scenario banner persists at top
[ ] Product grid shows 5 columns
[ ] Each product card shows name, price, stars, image
[ ] Limited-stock badge appears on relevant products
[ ] Discount countdown appears on relevant products
[ ] Filter by category works
[ ] Sort dropdown works (price asc/desc, rating, newest)
[ ] Click product → detail page loads
[ ] Image gallery shows up to 3 thumbnails
[ ] Clicking thumbnail changes main image
[ ] Reviews section visible
[ ] Add to cart button works
[ ] Cart icon updates count badge
[ ] Navigate to /cart
[ ] Modify quantity works
[ ] Remove item works
[ ] Promo code input accepts and validates code
[ ] Mid-task recall modal appears (first add_to_cart OR 5min)
[ ] Wrong answer flags as incorrect
[ ] Banner click opens scenario modal
[ ] Exit-intent modal triggers on mouseleave to top
[ ] Checkout button disabled when balance insufficient
[ ] Successful checkout deducts balance correctly
[ ] Order confirmation page shows
[ ] Redirected to /debrief
[ ] All 8 survey questions render
[ ] Likert scales accept 1-7 only
[ ] Submit makes user lottery_eligible
[ ] /profile shows all 10 segments + scenario section + budget explanation
[ ] /profile shows "your task was X" with full text reveal
[ ] Mobile (375px viewport): all pages usable
[ ] Browser back button works without breaking state
[ ] Refresh during cart preserves cart contents
[ ] Network throttle (Slow 3G): site still usable
```

#### 5.2 Data inspection after UAT

After completing UAT twice:

```sql
-- Verify researcher's two test sessions look correct
SELECT * FROM users WHERE email = 'feyruzsultanli+test1@gmail.com';
SELECT * FROM events WHERE customer_id = '<test1>' ORDER BY event_timestamp;
SELECT * FROM post_session_survey WHERE customer_id = '<test1>';
```

Confirm:
- Both expected scenarios assigned (different on each test if `customer_id` differs)
- All event types present
- 19 fields populated on every event row
- `mission_alignment_score` computed
- Survey rows complete

**Acceptance gate:** researcher signs off on UAT in writing (email or commit message).

---

### Layer 6 — Pilot study

**Owner:** Researcher
**When:** Day 12+ (after Layers 1–5 pass)
**Sample:** 10 real users from immediate network (friends, lab mates)
**Duration:** 3–5 days

#### 6.1 Pilot recruitment

- Send personal invite to 10 trusted people across age ranges if possible.
- Stagger: 3 users on Day 1, 3 on Day 2, 4 on Day 3.
- Each pilot participant gets a quick post-session debrief call (5 min) to gather qualitative feedback the survey misses.

#### 6.2 Pilot success criteria

| Pilot metric | Target | Action if fail |
|---|---|---|
| All 10 complete the flow without crash | 10/10 | Fix bugs, re-pilot |
| Median realism score ≥ 5/7 | ≥ 5 | Iterate on simulation realism (pricing, copy, framing) |
| All 4 scenarios appear in pilot | ≥ 1 each | Force-assign in re-pilot for missing arms |
| Mid-task recall correct ≥ 60% | ≥ 60% | Reword scenarios; make banner more prominent |
| At least 1 abandonment + 1 completion observed | ≥ 1 each | Adjust pricing or budgets if everyone buys/abandons |
| No P0 bugs reported | 0 | Fix before opening recruitment |
| Avg session length 5–20 min | within range | If <5min, sessions are too thin; if >20min, friction is too high |

#### 6.3 Pilot data review checklist

```
[ ] Run all Layer 4 data quality tests against pilot data
[ ] Validation queries 1-6 from v4 §19 produce sensible numbers
[ ] No participant produced nonsensical event sequences (e.g. order_completed without checkout_start)
[ ] mission_alignment_score has variance (not all 1.0 or all 0.2)
[ ] Free-text survey responses are intelligible (catches non-serious participants)
[ ] Pilot debrief calls captured at least 3 actionable feedback items
```

#### 6.4 Pilot iteration loop

If any criterion fails:

1. Categorize: technical bug / UX issue / simulation realism issue.
2. Fix in dev branch.
3. Re-pilot with 3 fresh users.
4. Loop until all criteria pass.

**Acceptance gate:** pilot success table fully green; researcher writes a one-page pilot report before opening recruitment.

---

## Part C — Acceptance gates

The project moves through five gates. **Cannot pass a gate while any blocker is open.**

### Gate 1 — Code complete (end of Day 10)

Blockers:
- All 7 work packages merged to main
- Layer 1 unit tests ≥ 80% coverage
- Layer 2 integration tests green

### Gate 2 — Deployed (end of Day 11)

Blockers:
- Domain live with HTTPS
- Sentry receiving events from prod backend and frontend
- Smoke test on prod URL passes
- Layer 3 E2E green on all 4 browser environments

### Gate 3 — UAT passed

Blockers:
- Layer 5 UAT checklist 100% complete (both EN and TR runs)
- Researcher inspected own test data and confirmed all fields populate
- Researcher signed off in writing

### Gate 4 — Pilot passed

Blockers:
- Layer 6 pilot success table fully green
- One-page pilot report written
- Layer 4 data quality tests pass on pilot data
- All P0/P1 bugs from pilot fixed

### Gate 5 — Study complete

Blockers:
- ≥ 80 completed sessions (20 per arm)
- All Tier 3 research validity criteria met (R1–R10)
- Lottery winners drawn and notified
- Final data export reproducible
- Sentry shows < 1% error rate over study window

Only after Gate 5 may findings be published or shared externally.

---

## Part D — Test ownership matrix

| Test layer | Engineering | Researcher | Tooling |
|---|---|---|---|
| Layer 1 (Unit) | ✅ Owns | Reviews | pytest, vitest |
| Layer 2 (Integration) | ✅ Owns | Reviews | pytest + httpx |
| Layer 3 (E2E) | ✅ Owns | Reviews | Playwright |
| Layer 4 (Data quality) | Supports | ✅ Owns | Jupyter |
| Layer 5 (UAT) | Supports | ✅ Owns | Manual |
| Layer 6 (Pilot) | Supports (bug fixes) | ✅ Owns | Real users |

Every PR should specify which layer(s) it adds or updates tests in.

---

## Part E — Continuous monitoring during recruitment

After Gate 4 passes and recruitment opens, monitor these daily:

```sql
-- Daily monitoring dashboard query
SELECT
  DATE(created_at) AS day,
  COUNT(DISTINCT customer_id)                                                       AS new_signups,
  COUNT(DISTINCT session_id)                                                        AS sessions,
  COUNT(*) FILTER (WHERE abandonment_stage = 'completed')                           AS completions,
  AVG(CASE WHEN abandonment_stage = 'completed' THEN 0 ELSE 1 END)                  AS abandon_rate,
  COUNT(DISTINCT scenario_id)                                                       AS scenarios_active
FROM sessions
WHERE created_at >= NOW() - INTERVAL '14 days'
GROUP BY day ORDER BY day DESC;
```

Alert thresholds (manual, no automation needed):
- 0 signups for 48h → check recruitment funnel
- Sentry error rate > 2% → investigate immediately
- Abandonment rate > 95% or < 5% → simulation may be broken
- Any scenario arm < 10% of weekly signups → check assignment logic

---

## Part F — Definition of "shipped"

The Neural E-Commerce study is **shipped** when:

1. All 5 acceptance gates closed
2. All Tier 1, Tier 2, Tier 3 success criteria met
3. All Tier 4 operational criteria met
4. Final dataset exported to `research/exports/final_demographic.csv` and `research/exports/final_sequential.parquet`
5. Researcher confirms dataset answers the original research question

If any of these is false, the study is not done — regardless of how much time has passed or how many users have participated.

---

End of test plan.
