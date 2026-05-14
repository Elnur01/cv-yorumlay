import os
from crewai import Agent, Task, Crew, Process
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# APPWRITE PROJECT DETAILS (Shared Context for All Agents)
# ============================================================
# Project ID:   69f676b90035c4b12c8a
# Project Name: CV Checker
# Endpoint:     https://fra.cloud.appwrite.io/v1
# Stack:        React + Vite + TypeScript (project already exists)
# Package Mgr:  npm
# ============================================================

# --- AGENTS ---

# 1. THE PROJECT MANAGER (Claude 3.1 Pro Plan)
project_manager = Agent(
    role='CV Evaluator Project Manager',
    goal=(
        'Orchestrate the Firebase-to-Appwrite migration for the CV evaluation app. '
        'Coordinate the Developer, Designer, Tester, and Product Owner to ensure '
        'all Firebase artifacts are removed, the Appwrite SDK is installed and configured, '
        'and the application functions identically post-migration. '
        'Ensure all phase-gates are respected before marking the migration complete.'
    ),
    backstory=(
        'You specialize in complex multi-agent workflows, technology migrations, '
        'and high-level product roadmaps. You have managed dozens of BaaS transitions '
        'and understand the risks of data-layer swaps in production systems.'
    ),
    llm='claude-3-1-pro-high-plan'
)

# 2. THE PRODUCT OWNER (Claude Opus 4.6)
product_owner = Agent(
    role='Product Strategy Lead',
    goal=(
        'Validate that the Appwrite migration does NOT alter the 5-domain scoring logic, '
        'the Step 0 market intelligence pipeline, or the user consent kill-switch behavior. '
        'The evaluation output schema (CVReport interface) must remain identical. '
        'Confirm that switching the persistence layer from Firestore to Appwrite Databases '
        'has zero impact on the product logic defined in main_instruction.md.'
    ),
    backstory=(
        'Expert in ATS optimization and regional job market analysis. '
        'You own the product requirements and must sign off that the data layer swap '
        'preserves all business rules and the consent-gated persistence model.'
    ),
    llm='claude-4-6-opus-thinking'
)

# 3. THE DESIGNER (Claude Sonnet 4.6)
designer = Agent(
    role='UI/UX Designer',
    goal=(
        'Verify that no frontend UI components are broken by the backend migration. '
        'The React interface, brand colors (#8338EC, #FF006E, #FB5607), typography (Inter), '
        'and all user-facing flows (intake form, consent checkbox, results display) '
        'must remain visually and functionally identical. '
        'If any loading states or error messages reference "Firebase", update them to be generic '
        '(e.g., "Saving your results..." instead of "Saving to Firebase...").'
    ),
    backstory=(
        'Specialist in modern, geometric typography and clean digital interfaces. '
        'You ensure that backend infrastructure changes never leak into the user experience.'
    ),
    llm='claude-4-6-sonnet-thinking'
)

# 4. THE FULLSTACK DEVELOPER (Gemini 3.1 Pro)
fullstack_dev = Agent(
    role='Lead FullStack Developer',
    goal=(
        'Execute the complete Firebase-to-Appwrite migration for the CV Evaluator app. '
        'The project is React + Vite + TypeScript and already exists. Follow these steps precisely:\n\n'
        'PHASE 1 — TEARDOWN (Remove Firebase):\n'
        '1. Run: npm uninstall firebase\n'
        '2. Delete these files: src/firebase.ts, .firebaserc, firebase.json, firestore.rules, firestore.indexes.json\n'
        '3. Remove all Firebase imports from src/lib/gemini.ts (lines importing from "firebase/storage", '
        '   "firebase/firestore", and "../firebase")\n\n'
        'PHASE 2 — SETUP (Install & Configure Appwrite):\n'
        '1. Run: npm install appwrite\n'
        '2. Create src/appwrite.ts with the following code:\n'
        '   ```typescript\n'
        '   import { Client, Account, Databases } from "appwrite";\n'
        '   \n'
        '   const client = new Client()\n'
        '       .setEndpoint("https://fra.cloud.appwrite.io/v1")\n'
        '       .setProject("69f676b90035c4b12c8a");\n'
        '   \n'
        '   const account = new Account(client);\n'
        '   const databases = new Databases(client);\n'
        '   \n'
        '   export { client, account, databases };\n'
        '   ```\n\n'
        'PHASE 3 — INTEGRATION (Refactor gemini.ts):\n'
        '1. In src/lib/gemini.ts, replace the Firebase persistence block (lines ~253-281) '
        '   with Appwrite logic using databases.createDocument().\n'
        '2. Remove the Firebase Storage upload (uploadString) — for now, store only the '
        '   structured evaluation JSON in Appwrite Databases. PDF storage will be addressed later.\n'
        '3. The user consent kill-switch logic MUST remain: if userConsent is false, '
        '   skip all database writes.\n'
        '4. Import { databases } from "../appwrite" instead of the old Firebase imports.\n'
        '5. Use the Appwrite ID.unique() method for generating document IDs.\n\n'
        'PHASE 4 — VERIFICATION:\n'
        '1. Add a client.ping() call that runs when the app initializes (e.g., in App.tsx or main.tsx) '
        '   to verify connectivity to the Appwrite backend.\n'
        '2. Log the ping result to the console.\n'
        '3. Ensure the app compiles with no TypeScript errors: npm run build'
    ),
    backstory=(
        'Expert in TypeScript, Appwrite SDK, and orchestrating complex AI prompt sequences. '
        'Previously experienced with Firebase but now specializing in open-source BaaS platforms. '
        'You write clean, production-ready code with proper error handling.'
    ),
    llm='google/gemini-3-1-pro-high'
)

# 5. THE QA TESTER (Gemini 3 Flash)
qa_tester = Agent(
    role='Quality Assurance Specialist',
    goal=(
        'Audit the Appwrite migration for completeness and correctness:\n\n'
        '1. ARTIFACT CHECK: Verify that NO Firebase artifacts remain in the project. '
        '   Search the entire codebase for any remaining references to "firebase", "firestore", '
        '   "Firebase", ".firebaserc", or "firebase.json". Report any orphaned references.\n\n'
        '2. SDK VERIFICATION: Confirm that src/appwrite.ts exists and exports client, account, '
        '   and databases. Verify the endpoint is "https://fra.cloud.appwrite.io/v1" and '
        '   project ID is "69f676b90035c4b12c8a".\n\n'
        '3. CONSENT LOGIC TEST: Trace the code path in src/lib/gemini.ts to confirm:\n'
        '   - When userConsent=true → databases.createDocument() is called\n'
        '   - When userConsent=false → NO database write occurs (ephemeral mode)\n\n'
        '4. PING TEST: Verify that client.ping() is called on app initialization and logs '
        '   a success/failure message to the console.\n\n'
        '5. BUILD TEST: Run "npm run build" and confirm zero errors.\n\n'
        '6. CV SCORING INTEGRITY: Verify that the CVReport interface and the 5-domain '
        '   evaluation logic in gemini.ts are UNCHANGED by the migration. '
        '   The scoring engine must produce identical output regardless of the persistence layer.'
    ),
    backstory=(
        'A rigorous tester focused on edge cases, migration validation, and logic integrity. '
        'You treat every migration as a potential source of silent regressions.'
    ),
    llm='google/gemini-3-flash'
)

# 6. THE OPERATIONS ANALYST (GPT-OSS 120B)
ops_analyst = Agent(
    role='Phase-Gate Controller',
    goal=(
        'Synthesize all agent outputs into a Phase-Gate Status Report for the '
        'Firebase-to-Appwrite migration. Your report MUST follow this exact format:\n\n'
        '**Current State:** 2-3 sentences on what has been completed.\n'
        '**Blockers/Issues:** Any errors from the Tester or conflicts from the Product Owner.\n'
        '**Required Human Input:** Bulleted list of decisions/actions needed from the human.\n\n'
        'Specific items to flag for human input:\n'
        '- Has the human created a Database and Collection in the Appwrite Console?\n'
        '- What should the Database ID and Collection ID be for the evaluations data?\n'
        '- Should PDF storage be migrated to Appwrite Storage in this phase or deferred?\n'
        '- Approval to delete the old Firebase project from the Google Cloud Console.\n\n'
        'HALT the workflow after generating this report. Do NOT allow the Project Manager '
        'to proceed until the human has explicitly answered every item.'
    ),
    backstory=(
        'You ensure structural integrity and prevent "hallucinated" progress in automated crews. '
        'You are the final checkpoint before any phase advances.'
    ),
    llm='gpt-oss-120b-medium'
)

# --- TASKS ---

task_migration_plan = Task(
    description=(
        'Create the migration execution plan for Firebase → Appwrite. '
        'Confirm the following prerequisites are met:\n'
        '- Appwrite Project ID: 69f676b90035c4b12c8a\n'
        '- Appwrite Endpoint: https://fra.cloud.appwrite.io/v1\n'
        '- Project Name: CV Checker\n'
        '- The project uses React + Vite + TypeScript with npm.\n'
        '- The project ALREADY EXISTS (do NOT clone a starter kit).\n\n'
        'Coordinate the Developer to execute the 4-phase migration '
        '(Teardown → Setup → Integration → Verification). '
        'Ensure the Product Owner validates that no scoring logic is affected.'
    ),
    expected_output=(
        'A clear, ordered migration checklist confirming all prerequisites '
        'and assigning responsibilities to each agent.'
    ),
    agent=project_manager
)

task_logic_validation = Task(
    description=(
        'Review the current src/lib/gemini.ts and main_instruction.md. '
        'Confirm that the 5-domain scoring logic (Visual Architecture, Performance Metrics, '
        'Strategic Alignment, Career Continuity, Behavioral Evidence), the Step 0 Market '
        'Intelligence prerequisite, and the CVReport output schema are INDEPENDENT of the '
        'persistence layer. Sign off that switching from Firestore to Appwrite Databases '
        'will not alter any evaluation scores, deduction logs, or actionable improvements. '
        'Flag any concerns about the consent-gated persistence model.'
    ),
    expected_output=(
        'A written sign-off confirming the scoring logic is persistence-layer-agnostic, '
        'OR a list of specific concerns that must be addressed before migration proceeds.'
    ),
    agent=product_owner
)

task_execute_migration = Task(
    description=(
        'Execute the full 4-phase Firebase-to-Appwrite migration as described in your goal. '
        'This is a React + Vite + TypeScript project that ALREADY EXISTS.\n\n'
        'Key files to modify:\n'
        '- DELETE: src/firebase.ts, .firebaserc, firebase.json, firestore.rules, firestore.indexes.json\n'
        '- CREATE: src/appwrite.ts (with Client, Account, Databases exports)\n'
        '- MODIFY: src/lib/gemini.ts (replace Firebase persistence with Appwrite databases.createDocument)\n'
        '- MODIFY: src/App.tsx or src/main.tsx (add client.ping() on initialization)\n\n'
        'Appwrite credentials:\n'
        '- Endpoint: https://fra.cloud.appwrite.io/v1\n'
        '- Project ID: 69f676b90035c4b12c8a\n\n'
        'IMPORTANT: The user consent kill-switch MUST remain functional. '
        'When userConsent=false, NO data is written to Appwrite. '
        'Use ID.unique() from the appwrite SDK for document IDs instead of uuid.\n'
        'Run npm run build at the end to verify zero TypeScript errors.'
    ),
    expected_output=(
        'Production-ready TypeScript code for src/appwrite.ts and the refactored '
        'src/lib/gemini.ts, plus confirmation that npm run build passes with zero errors.'
    ),
    agent=fullstack_dev
)

task_ui_check = Task(
    description=(
        'Inspect all React components (src/App.tsx and any child components) for '
        'hardcoded references to "Firebase", "Firestore", or "Google Cloud" in '
        'user-facing strings, error messages, loading states, or comments. '
        'Replace any such references with generic equivalents. '
        'Verify that the brand colors (#8338EC, #FF006E, #FB5607), Inter font, '
        'and all UI flows remain intact after the backend swap.'
    ),
    expected_output=(
        'A list of all UI strings that were updated (or confirmation that none '
        'referenced Firebase), plus visual verification that the interface is unchanged.'
    ),
    agent=designer
)

task_qa_audit = Task(
    description=(
        'Run the full 6-point QA audit as described in your goal:\n'
        '1. Search entire codebase for orphaned Firebase references.\n'
        '2. Validate src/appwrite.ts exports and credentials.\n'
        '3. Trace consent logic in gemini.ts (consent=true → write, consent=false → skip).\n'
        '4. Verify client.ping() is called on app init.\n'
        '5. Run npm run build and confirm zero errors.\n'
        '6. Confirm CVReport interface and scoring logic are unchanged.\n\n'
        'Use the test CVs in test_cvs/cv_a_generic.md and test_cvs/cv_b_creative.md '
        'as reference points for scoring integrity checks.'
    ),
    expected_output=(
        'A detailed QA report with PASS/FAIL for each of the 6 audit points, '
        'plus a list of any remaining issues or regressions.'
    ),
    agent=qa_tester
)

task_gate_reporting = Task(
    description=(
        'Synthesize all previous task outputs into a Phase-Gate Status Report. '
        'Specifically address:\n'
        '- Did the Developer complete all 4 phases?\n'
        '- Did the Product Owner sign off on logic integrity?\n'
        '- Did the Tester find any orphaned Firebase references or regressions?\n'
        '- Did the Designer find any user-facing Firebase strings?\n\n'
        'Generate the report in the required format (Current State, Blockers, '
        'Required Human Input) and HALT the workflow. '
        'The human MUST provide Database ID and Collection ID from the Appwrite Console '
        'before any data can actually be written.'
    ),
    expected_output=(
        'A Phase-Gate Status Report with Current State, Blockers/Issues, '
        'and Required Human Input sections. Workflow is HALTED pending human approval.'
    ),
    agent=ops_analyst
)

# --- THE CREW ---

cv_evaluator_team = Crew(
    agents=[project_manager, product_owner, designer, fullstack_dev, qa_tester, ops_analyst],
    tasks=[
        task_migration_plan,
        task_logic_validation,
        task_execute_migration,
        task_ui_check,
        task_qa_audit,
        task_gate_reporting
    ],
    process=Process.sequential,
    verbose=True
)

print("Initiating Firebase → Appwrite Migration Orchestration...")
result = cv_evaluator_team.kickoff()
print(result)