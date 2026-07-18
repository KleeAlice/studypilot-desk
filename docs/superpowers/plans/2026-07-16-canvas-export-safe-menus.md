# Canvas Export, Focus Mode, and Safe Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four trustworthy canvas exports, an app-level focus mode, and replace destructive three-dot actions with confirmed menus.

**Architecture:** A focused Python export service reads the notebook-scoped graph and produces bytes for visual or structured formats. The renderer requests an artifact and delegates the final path to a narrow Electron save bridge. Course and notebook overflow controls share the same non-destructive interaction contract without changing backend soft-delete semantics.

**Tech Stack:** React 19, TypeScript, Electron IPC, FastAPI, Pillow, ReportLab, python-docx, pytest, Vitest.

---

### Task 1: Reproduce and lock down the destructive menu bug

**Files:**
- Modify: `frontend/tests/global-course-shell.test.tsx`
- Modify: `frontend/tests/notebook-library.test.tsx`
- Modify: `frontend/src/features/CourseLibrary.tsx`
- Modify: `frontend/src/features/NotebookLibrary.tsx`

- [ ] **Step 1: Write failing tests** asserting that clicking each three-dot button only opens a named menu, does not invoke deletion, cancellation remains safe, and confirming “移入回收站” invokes the callback once.
- [ ] **Step 2: Run tests to verify RED** with `npm test -- frontend/tests/global-course-shell.test.tsx frontend/tests/notebook-library.test.tsx`; expect deletion to be called immediately in the current implementation.
- [ ] **Step 3: Implement minimal menus** with local `menuId` and `confirmTarget` state; call `stopPropagation`, close on Escape, and invoke deletion only from the confirmation dialog.
- [ ] **Step 4: Run the same tests to verify GREEN** and confirm all new assertions pass.

### Task 2: Generate complete local export artifacts

**Files:**
- Create: `backend/app/services/exports.py`
- Create: `backend/tests/test_exports.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Modify: `pyproject.toml`

- [ ] **Step 1: Write failing API tests** that create a notebook graph and assert PNG signature/dimensions, `%PDF` with one page, readable DOCX content ordering, portable Markdown image data, and cross-course 404.
- [ ] **Step 2: Run tests to verify RED** with `.venv\\Scripts\\python.exe -m pytest backend/tests/test_exports.py -q`; expect the export endpoint to return 404.
- [ ] **Step 3: Implement `NotebookExportService.export(format)`** using scoped notebook/graph reads; render PNG with Pillow, PDF with ReportLab/Pillow, DOCX with A4 sections and Markdown as UTF-8.
- [ ] **Step 4: Add POST endpoint** `/api/courses/{course_id}/notebooks/{notebook_id}/export` accepting `{"format":"png|pdf|docx|md"}` and returning bytes with RFC 5987 filename.
- [ ] **Step 5: Run export tests to verify GREEN** and open produced formats in parsers inside the tests.

### Task 3: Save export files through the desktop shell

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `tests/unit/startup-scripts.test.ts`

- [ ] **Step 1: Write failing bridge/API tests** for binary download filename parsing and the presence of `files.saveExport`.
- [ ] **Step 2: Run tests to verify RED** with `npm test -- tests/unit/startup-scripts.test.ts frontend/tests/api.test.ts` (or the existing closest API test file).
- [ ] **Step 3: Implement `ApiClient.download`** returning `{bytes, filename, mediaType}` and surfacing JSON API errors.
- [ ] **Step 4: Implement constrained IPC** that accepts a suggested filename and byte array, validates extension/size, opens `showSaveDialog`, and writes with `node:fs/promises`.
- [ ] **Step 5: Run the targeted tests to verify GREEN**.

### Task 4: Add export menu and software focus mode

**Files:**
- Modify: `frontend/tests/knowledge-canvas.test.tsx`
- Modify: `frontend/src/features/Knowledge.tsx`
- Modify: `frontend/src/styles/workspace.css`

- [ ] **Step 1: Write failing component tests** for all four export menu entries, native save invocation, visible success feedback, focus-mode class, and Escape exit.
- [ ] **Step 2: Run tests to verify RED** with `npm test -- frontend/tests/knowledge-canvas.test.tsx`; expect missing controls.
- [ ] **Step 3: Implement the export controller** with one in-flight export, menu dismissal, desktop bridge save and browser fallback.
- [ ] **Step 4: Implement focus mode** as a fixed application-content overlay with an exit bar, preserved canvas state, and keyboard/focus restoration.
- [ ] **Step 5: Run the component tests to verify GREEN**.

### Task 5: Regression and packaging verification

**Files:**
- Modify only if verification reveals a tested defect.

- [ ] **Step 1: Run backend suite**: `.venv\\Scripts\\python.exe -m pytest -q`.
- [ ] **Step 2: Run frontend/unit suite**: `npm test`.
- [ ] **Step 3: Run type and production builds**: `npm run typecheck` and `npm run build`.
- [ ] **Step 4: Run desktop smoke and core E2E**: `npm run smoke` and `npm run test:e2e -- tests/e2e/core-flows.spec.ts`.
- [ ] **Step 5: Inspect generated PNG, PDF, DOCX and Markdown** through Pillow, pypdf, python-docx and UTF-8 parsing; report exact results.

