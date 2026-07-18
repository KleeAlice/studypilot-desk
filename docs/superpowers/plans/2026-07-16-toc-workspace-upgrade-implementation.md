# StudyPilot Desk ToC Workspace Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver course-scoped creation, an interactive knowledge canvas, a real interpreter-aware Python workbench, and a polished animated consumer desktop interface.

**Architecture:** Extend SQLite through idempotent schema-v2 migrations and keep the FastAPI API course-scoped. Implement the canvas with focused React components using Pointer Events, CSS transforms, and SVG edges; implement the Python workbench around the existing safe runner and a new interpreter discovery service. Apply one token-driven visual and motion system across the shell.

**Tech Stack:** Electron, React 19, TypeScript, CSS, FastAPI, Pydantic, SQLite/FTS5, Python subprocess, Vitest, pytest, Playwright.

---

### Task 1: Schema-v2 migration and blank course safety

**Files:**
- Modify: `backend/app/db.py`
- Modify: `backend/app/repository.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_database.py`
- Test: `backend/tests/test_api_core.py`

- [ ] Write failing tests that initialize a v1 database, require the new columns, activate a blank course, and expect `/api/today` to return a valid synthetic context.
- [ ] Run `pytest backend/tests/test_database.py backend/tests/test_api_core.py -q` and verify failures name missing columns and blank-roadmap handling.
- [ ] Add idempotent `_ensure_column` migration helpers, set schema version 2, and return a custom-course week/phase when roadmap rows are empty.
- [ ] Re-run the targeted tests and require zero failures.

### Task 2: Knowledge canvas API

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/knowledge.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_knowledge.py`

- [ ] Write failing tests for node kind/content/color/position/citation creation, patch/move, delete, edge delete, prerequisite cycle rejection, and association cycles.
- [ ] Run `pytest backend/tests/test_knowledge.py -q` and verify the new endpoints fail for the expected missing behavior.
- [ ] Add `KnowledgeNodeUpdate`, validation literals, course ownership checks, update/delete methods, relation-aware cycle logic, and routes.
- [ ] Re-run the targeted tests and require all cases to pass.

### Task 3: Python environment discovery and selection

**Files:**
- Create: `backend/app/python_runner/environments.py`
- Modify: `backend/app/python_runner/manager.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_python_runner.py`

- [ ] Write failing tests that require at least one discovered interpreter, reject an unknown environment ID, and record the chosen environment/interpreter on a successful run.
- [ ] Run `pytest backend/tests/test_python_runner.py -q` and verify failures are caused by missing discovery/selection.
- [ ] Implement bounded interpreter discovery, opaque IDs, allowlist resolution, `GET /api/python/environments`, and environment metadata persistence.
- [ ] Re-run runner tests and require success, syntax error, timeout, stop, truncation, discovery, and selection to pass.

### Task 4: Course switcher and workspace reload

**Files:**
- Create: `frontend/src/components/CourseSwitcher.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/features/Roadmap.tsx`
- Test: `frontend/tests/workspace.test.tsx`

- [ ] Write a failing interaction test that opens the switcher, creates a course, activates it, lands on Knowledge, and can switch back.
- [ ] Run `npm test -- frontend/tests/workspace.test.tsx` and verify the course control is absent.
- [ ] Implement typed course loading, popover creation, activation, global workspace revision keys, synthetic roadmap empty state, and post-create navigation to Knowledge.
- [ ] Re-run the workspace test and require it to pass.

### Task 5: Interactive knowledge canvas

**Files:**
- Create: `frontend/src/features/knowledge/KnowledgeCanvas.tsx`
- Create: `frontend/src/features/knowledge/KnowledgeNodeCard.tsx`
- Create: `frontend/src/features/knowledge/KnowledgeToolbar.tsx`
- Create: `frontend/src/features/knowledge/NodeInspector.tsx`
- Create: `frontend/src/features/knowledge/SourceDrawer.tsx`
- Create: `frontend/src/features/knowledge/types.ts`
- Replace: `frontend/src/features/Knowledge.tsx`
- Test: `frontend/tests/knowledge-canvas.test.tsx`

- [ ] Write failing tests for four node types, pointer drag persistence, keyboard nudge, connection creation, inspector edits, and selected document quote creation.
- [ ] Run the knowledge canvas test and verify failures identify missing controls/requests.
- [ ] Implement pan/zoom, draggable cards, SVG edges, connection mode, inspector, optimistic position save with rollback, source drawer, and accessible keyboard actions.
- [ ] Re-run the canvas tests and require every interaction to pass.

### Task 6: Python workbench UI

**Files:**
- Create: `frontend/src/features/lab/CodeEditor.tsx`
- Create: `frontend/src/features/lab/EnvironmentPicker.tsx`
- Create: `frontend/src/features/lab/OutputPanel.tsx`
- Create: `frontend/src/features/lab/templates.ts`
- Replace: `frontend/src/features/Lab.tsx`
- Test: `frontend/tests/python-workbench.test.tsx`

- [ ] Write failing tests for environment loading/selection, run payload, line numbers, templates, output/problem/history tabs, stop, copy/clear, and console theme.
- [ ] Run the workbench test and verify the new controls are missing.
- [ ] Implement the editor shell, environment selector, run settings, output tabs, status bar, template menu, persisted terminal theme, and existing polling lifecycle.
- [ ] Re-run the workbench tests and require all interactions to pass.

### Task 7: Global visual system and motion

**Files:**
- Create: `frontend/src/components/Icon.tsx`
- Modify: `frontend/src/components/NavRail.tsx`
- Modify: `frontend/src/components/TitleBar.tsx`
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/styles/global.css`
- Test: `frontend/tests/app.test.tsx`

- [ ] Extend tests for accessible icon names, course control, focusable actions, and stable existing navigation labels.
- [ ] Run the app tests and verify only the new shell expectations fail.
- [ ] Apply the atelier tokens, icon rail, layered shell, hover/press/popover/page/node/terminal motion, toast styling, light/dark contrast, and reduced-motion override.
- [ ] Run app and all frontend tests; require no regressions.

### Task 8: Integration verification

**Files:**
- Modify: `tests/e2e/core-flows.spec.ts`
- Update: `docs/DESIGN_SYSTEM.md`
- Update: `docs/TEST_REPORT.md`
- Update: `docs/KNOWN_LIMITATIONS.md`

- [ ] Extend Electron E2E for course creation/switching, node drag persistence, document citation, environment run, terminal themes, and required resolutions.
- [ ] Run backend tests, frontend tests, typecheck, production build, Electron smoke, and Playwright E2E.
- [ ] Inspect fresh screenshots in dark and light mode at 1366×768 and 1920×1080.
- [ ] Update documentation with exact evidence and remaining scope; do not claim untested features.

