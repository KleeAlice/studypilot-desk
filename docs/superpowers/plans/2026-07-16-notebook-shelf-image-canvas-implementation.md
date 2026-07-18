# Knowledge Notebook Shelf and Image Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bookshelf-first knowledge workspace with deletable course notebooks, configurable visual canvases, and image import from files or the clipboard.

**Architecture:** Keep `Course` as the notebook aggregate, add lightweight aggregate counts to the course API, and add a course-scoped local media asset service for image nodes. Route Knowledge through a new shelf component before rendering the existing canvas; keep per-course visual preferences in local storage while persisting knowledge and images in SQLite/the data directory.

**Tech Stack:** Python 3.10, FastAPI, SQLite, React 18, TypeScript, Vitest, Testing Library, Electron.

---

## File map

- Create `backend/app/services/media.py`: validate, persist and retrieve course-scoped image assets.
- Create `frontend/src/features/NotebookShelf.tsx`: bookshelf UI and notebook CRUD interactions.
- Modify `backend/app/db.py`: schema v4 tables/columns and migration.
- Modify `backend/app/repository.py`: course counts and transactional deletion/fallback activation.
- Modify `backend/app/services/knowledge.py`: image asset projection and course validation.
- Modify `backend/app/main.py`, `schemas.py`: media/course routes and image fields.
- Modify `frontend/src/app/App.tsx`: shelf/canvas navigation state.
- Modify `frontend/src/features/Knowledge.tsx`: settings, image upload/paste/rendering and back navigation.
- Modify `frontend/src/types.ts`: course aggregate, image node and clipboard bridge types.
- Modify `electron/main.ts`, `electron/preload.ts`: native clipboard image read.
- Modify `frontend/src/styles/workspace.css`: shelf, image and motion presentation.
- Modify backend/frontend tests for every public behavior.

### Task 1: Course shelf backend contract

**Files:**
- Modify: `backend/tests/test_api_core.py`
- Modify: `backend/app/repository.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

Add API tests that create two courses, assert `node_count`/`edge_count` in `GET /api/courses`, delete the active course, assert the remaining course becomes active, and assert deleting the last course returns HTTP 409 with `LAST_COURSE_REQUIRED`.

- [ ] **Step 2: Run the focused tests and observe RED**

Run: `python -m pytest backend/tests/test_api_core.py -q`

Expected: FAIL because counts and the delete route do not exist.

- [ ] **Step 3: Implement the smallest transactional repository change**

Use correlated count subqueries in `list_courses()` and implement `delete_course()` in one SQLite transaction. Delete the requested row, choose the most recently updated remaining course when needed, and update the `active_course_id` JSON setting.

- [ ] **Step 4: Expose the endpoint and verify GREEN**

Add `DELETE /api/courses/{course_id}` returning `{"deleted_id": ..., "active_course": ...}`. Run the focused test command and expect PASS.

### Task 2: Image asset persistence and schema v4

**Files:**
- Modify: `backend/tests/test_database.py`
- Modify: `backend/tests/test_knowledge.py`
- Create: `backend/app/services/media.py`
- Modify: `backend/app/db.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/knowledge.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/backups.py`

- [ ] **Step 1: Write failing database and API tests**

Assert migration v3→v4 creates `media_assets` plus `image_asset_id`/`image_alt`; upload a real one-pixel PNG; create an `image` node with the returned asset id; retrieve both the node and binary image; reject a text file and a cross-course asset reference.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `python -m pytest backend/tests/test_database.py backend/tests/test_knowledge.py -q`

Expected: FAIL because schema v4, image fields and media endpoints are absent.

- [ ] **Step 3: Implement schema and service**

Create `media_assets(id, course_id, filename, media_type, storage_path, size_bytes, created_at)` with cascade deletion. Add nullable image columns to nodes. Store files as UUID names below `<data>/media`; validate an 8 MB limit and image magic signatures before writing.

- [ ] **Step 4: Wire knowledge projection and routes**

Allow `kind="image"`, validate asset ownership, and return `image_url` with nodes. Add multipart upload and binary read routes. Update backup schema compatibility to v4.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 2 test command and expect PASS.

### Task 3: Bookshelf-first frontend navigation

**Files:**
- Modify: `frontend/tests/workspace.test.tsx`
- Create: `frontend/src/features/NotebookShelf.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Write failing UI tests**

Test that clicking Knowledge shows “知识笔记本”, clicking a notebook activates it and reveals the canvas, creating a notebook opens it, deleting calls the DELETE route, and the final notebook cannot be deleted.

- [ ] **Step 2: Run focused test and observe RED**

Run: `npm test -- --run frontend/tests/workspace.test.tsx`

Expected: FAIL because `NotebookShelf` and two-level navigation do not exist.

- [ ] **Step 3: Implement the shelf and App state**

Add `knowledgeMode: "shelf" | "canvas"`. Navigating to Knowledge resets to shelf; opening/creating activates the course before switching to canvas; deletion refreshes courses and active id. Render semantic buttons for book covers and an accessible create form.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 3 command and expect PASS.

### Task 4: Configurable canvas and image workflows

**Files:**
- Modify: `frontend/tests/knowledge-canvas.test.tsx`
- Modify: `frontend/src/features/Knowledge.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Write failing image/settings tests**

Test file import sends `FormData` then creates an image node, paste attaches an image to the selected sticky, empty clipboard reports a status, and font/size changes update CSS variables and persist under a course-specific key.

- [ ] **Step 2: Run focused test and observe RED**

Run: `npm test -- --run frontend/tests/knowledge-canvas.test.tsx`

Expected: FAIL because image and canvas setting controls do not exist.

- [ ] **Step 3: Implement upload, paste and image rendering**

Use a hidden file input for downloaded files and a window paste listener for browser clipboard data. Use native `readImage()` as the toolbar fallback. Upload first, then either patch the selected sticky or create an `image` node at the viewport center. Render safe local API URLs in cards and the inspector.

- [ ] **Step 4: Implement per-course canvas preferences**

Persist `{width,height,fontFamily,fontScale}` in local storage, provide presets plus bounded numeric inputs, apply dimensions to the world/SVG and font variables to node cards, and include a restore-default action.

- [ ] **Step 5: Run focused test and verify GREEN**

Run the Task 4 command and expect PASS.

### Task 5: Desktop clipboard bridge and motion system

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `frontend/src/styles/workspace.css`
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Add native clipboard image IPC**

Handle `clipboard:read-image` in the main process and expose `clipboard.readImage()` in preload, returning `null` for empty clipboard or a PNG data URL otherwise.

- [ ] **Step 2: Add purposeful motion and bookshelf visuals**

Implement staggered shelf entry, book pull/tilt hover, a restrained shelf-light sweep, page opening, settings popover, and image-card landing using opacity/transform only. Add `prefers-reduced-motion: reduce` overrides.

- [ ] **Step 3: Build and typecheck**

Run: `npm run build`

Expected: production frontend and Electron TypeScript compile with no errors.

### Task 6: Full verification

**Files:**
- Modify: `docs/TEST_REPORT.md`

- [ ] **Step 1: Run all backend tests**

Run: `python -m pytest backend/tests -q`

Expected: all tests pass.

- [ ] **Step 2: Run all frontend tests**

Run: `npm test -- --run`

Expected: all tests pass.

- [ ] **Step 3: Run production and desktop checks**

Run: `npm run build` and the repository desktop verification command.

Expected: build succeeds; backend health, packaged frontend loading and desktop launcher checks pass.

- [ ] **Step 4: Record evidence**

Update `docs/TEST_REPORT.md` with exact command results, coverage of the new shelf/image/settings flows, and any intentionally retained limitations.
