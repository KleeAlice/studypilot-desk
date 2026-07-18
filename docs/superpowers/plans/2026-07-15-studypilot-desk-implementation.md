# StudyPilot Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Electron learning operations desktop with a React UI, FastAPI/SQLite backend, real document search, isolated Python execution, and an imported 24-week roadmap.

**Architecture:** Electron owns the trusted desktop boundary and starts a loopback-only FastAPI child process. React consumes typed HTTP APIs; FastAPI services own validation and SQLite transactions. Imported files, Python workspaces, experiment outputs, and backups live below `data/`.

**Tech Stack:** Electron, React 19, TypeScript, Vite, Vitest, FastAPI, Pydantic v2, SQLite/FTS5, python-docx, pypdf, pytest, Playwright.

---

## File map

- `electron/main.ts`: application lifecycle and secure frameless window.
- `electron/preload.ts`: narrow typed IPC bridge.
- `electron/backend-manager.ts`: free-port selection, backend spawn, health wait, shutdown.
- `frontend/src/app/*`: shell, routing and top-level state.
- `frontend/src/features/*`: dashboard, roadmap, learning, lab, projects and settings views.
- `frontend/src/services/api.ts`: typed API client and error normalization.
- `backend/app/main.py`: FastAPI composition, middleware and lifecycle.
- `backend/app/db.py`: SQLite connection, migrations and transactions.
- `backend/app/repository.py`: generic and domain-specific persistence.
- `backend/app/services/*`: roadmap, documents, mastery, backup and evidence rules.
- `backend/app/python_runner/*`: child-process execution registry and limits.
- `data/seeds/roadmap.json`: DOCX-derived source-of-truth roadmap.
- `backend/tests/*`, `frontend/tests/*`, `tests/e2e/*`: layered verification.

### Task 1: Extract the source roadmap

**Files:**
- Create: `scripts/extract_roadmap.py`
- Create: `data/seeds/roadmap.json`
- Create: `docs/ROADMAP_IMPORT_REPORT.md`
- Test: `backend/tests/test_roadmap_seed.py`

- [ ] Write a failing pytest asserting 24 unique weeks, six phases, G1-G6, non-empty tasks and deliverables.
- [ ] Run `pytest backend/tests/test_roadmap_seed.py -q`; expect failure because the seed does not exist.
- [ ] Implement a python-docx block iterator that preserves paragraph/table order, maps the section 7 table into weeks, and records source filename plus extraction timestamp.
- [ ] Generate the seed from `C:\Users\Administrator\Downloads\半年内转向大模型应用算法岗_优化精校版.docx`.
- [ ] Run the seed test; expect all assertions to pass.

Seed contract:

```python
assert [w["week"] for w in seed["weeks"]] == list(range(1, 25))
assert [p["gate"] for p in seed["phases"]] == [f"G{i}" for i in range(1, 7)]
assert all(w["tasks"] and w["deliverables"] for w in seed["weeks"])
```

### Task 2: Backend foundation and database

**Files:**
- Create: `pyproject.toml`
- Create: `backend/app/main.py`, `backend/app/config.py`, `backend/app/db.py`, `backend/app/errors.py`
- Create: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/repository.py`
- Create: `backend/tests/test_database.py`, `backend/tests/test_api_core.py`

- [ ] Write failing tests for migration idempotency, health, pagination, validation, course switching, task create/update and evidence persistence.
- [ ] Run `pytest backend/tests/test_database.py backend/tests/test_api_core.py -q`; expect import failures.
- [ ] Add SQLite migrations for courses, phases, gates, weeks, tasks, evidence, knowledge nodes/edges, captures, notes, mind maps, documents/FTS, runs, quizzes, mastery, reviews, projects, papers, experiments, errors, interviews, weekly reviews and settings.
- [ ] Implement uniform envelopes: `{"data": ..., "meta": ...}` and `{"error": {"code": str, "message": str, "details": object|null}}`.
- [ ] Mount the specified `/api/*` route families with real CRUD for P0 entities and explicit 501 responses for deferred P1/P2 operations.
- [ ] Run tests; expect pass and no traceback in production responses.

### Task 3: Documents, notes, maps and search

**Files:**
- Create: `backend/app/services/documents.py`, `backend/app/services/search.py`
- Create: `backend/app/api/library.py`, `backend/app/api/knowledge.py`
- Create: `backend/tests/test_documents.py`, `backend/tests/test_knowledge.py`

- [ ] Write failing tests that import PDF/DOCX/MD/TXT fixtures, verify extracted body text, query FTS, save highlights, notes, editable map nodes/edges, and reject a DAG cycle.
- [ ] Run the focused tests; expect failures.
- [ ] Implement managed-file copying with SHA-256 deduplication, extension/size validation, parsers, FTS5 indexing and BM25 snippets.
- [ ] Implement note/highlight/capture conversion and knowledge graph cycle/prerequisite validation.
- [ ] Run focused tests; expect pass.

### Task 4: Python runner and learning science loop

**Files:**
- Create: `backend/app/python_runner/manager.py`, `backend/app/python_runner/worker.py`
- Create: `backend/app/services/mastery.py`, `backend/app/services/reviews.py`
- Create: `backend/tests/test_python_runner.py`, `backend/tests/test_learning_loop.py`

- [ ] Write failing tests for normal output, syntax error, timeout, manual stop, output truncation, public-test judgement, evidence save, Beta-Binomial update and due-date generation.
- [ ] Run focused tests; expect failures.
- [ ] Implement a per-run workspace and subprocess registry with a random run token, process-group termination, bounded output and terminal state persistence.
- [ ] Implement `mean = alpha / (alpha + beta)`, evidence-weighted updates, quality-based review intervals and gate remediation task creation.
- [ ] Run focused tests; expect pass and no orphan worker process.

### Task 5: Electron lifecycle and one-click startup

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`
- Create: `electron/main.ts`, `electron/preload.ts`, `electron/backend-manager.ts`, `electron/window-manager.ts`
- Create: `start.bat`, `start.ps1`, `start.sh`, `dev.bat`, `reset_demo.bat`
- Test: `tests/e2e/electron-lifecycle.test.ts`

- [ ] Write a failing lifecycle test that launches twice, validates the preload bridge and closes without a backend process.
- [ ] Implement free-port selection and pass port/session token by environment; wait for `/api/health` before loading renderer.
- [ ] Create a frameless 1280×820 window with 1100×700 minimum, persisted bounds, secure webPreferences, and min/max/restore/close IPC.
- [ ] Make start scripts create `.venv`, install Python/Node dependencies when missing, build renderer, and launch Electron with one user action.
- [ ] Run lifecycle test; expect pass.

### Task 6: React command-center UI

**Files:**
- Create: `frontend/src/main.tsx`, `frontend/src/app/App.tsx`, `frontend/src/app/router.tsx`
- Create: `frontend/src/services/api.ts`, `frontend/src/styles/tokens.css`, `frontend/src/styles/global.css`
- Create: focused feature components under `frontend/src/features/`
- Test: `frontend/tests/app.test.tsx`, `frontend/tests/flows.test.tsx`

- [ ] Write failing tests for all main navigation targets, first-run profile, task create/update, note save, search, Python run, theme persistence and friendly API errors.
- [ ] Implement a CSS-token dark/light/system theme, custom title bar, collapsible navigation, dashboard, roadmap, knowledge, library, lab, projects/research, interview/review and settings views.
- [ ] Use real API data; empty states must offer an action and must not fabricate metrics.
- [ ] Implement transitions with transform/opacity and reduced-motion fallback.
- [ ] Run `npm test`; expect pass.

### Task 7: Backup, restore and documentation

**Files:**
- Create: `backend/app/services/backups.py`, `backend/tests/test_backups.py`
- Create: `README.md`, `docs/PRODUCT_SCOPE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DESIGN_SYSTEM.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/DEMO_SCRIPT.md`, `docs/KNOWN_LIMITATIONS.md`

- [ ] Write failing tests for zip manifest content, zip-slip rejection and restore round trip.
- [ ] Implement backup to a temporary file followed by atomic rename; restore validates every member before replacing data.
- [ ] Write user-facing startup, import, Python, optional AI, backup, restore, development and testing instructions.
- [ ] Run backup tests; expect pass.

### Task 8: End-to-end and visual verification

**Files:**
- Create: `scripts/smoke_test.py`, `tests/e2e/core-flows.spec.ts`
- Create: `docs/TEST_REPORT.md`
- Create: `screenshots/*.png`

- [ ] Run backend and frontend unit suites; record exact counts and duration.
- [ ] Run smoke test against a temporary database and verify roadmap, task, note, search, Python and backup flows.
- [ ] Run Playwright at 1366×768, 1440×900 and 1920×1080; assert `document.documentElement.scrollWidth <= innerWidth` and zero page errors.
- [ ] Launch through the same command path as `start.bat`, exercise the Electron window, close it, and verify no backend child remains.
- [ ] Record only observed results in `docs/TEST_REPORT.md`; list every unimplemented P1/P2 capability in `docs/KNOWN_LIMITATIONS.md`.

## Self-review result

The plan covers every design section: architecture (Tasks 2/5), document/search flow (Task 3), Python/learning loop (Task 4), UI (Task 6), safety/backup (Tasks 3/4/5/7), and layered verification (Task 8). Paths and core contracts remain consistent across tasks. No deferred capability is represented as completed P0 behavior.

