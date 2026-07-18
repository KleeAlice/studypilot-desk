# StudyPilot Desk ToC Workspace Upgrade Design

## 1. Product decision

StudyPilot Desk will become a consumer learning creation desktop, not a route dashboard with isolated forms. The memorable interaction is a course-scoped knowledge canvas where concepts, sticky notes, memory cards, mind-map branches, and citations can be created and rearranged directly. The Python lab becomes a lightweight local IDE with real interpreter selection and a themeable console.

The user explicitly authorized implementation without an approval pause. This document therefore records the selected design and implementation contract.

## 2. Approaches considered

### A. Custom offline canvas and editor shell — selected

Use React pointer events, CSS transforms, and SVG paths for node drag, pan, zoom, connections, and keyboard movement. Build a VS Code-inspired editor shell around the existing textarea and local runner. This adds no online runtime dependency, keeps Electron `file://` loading reliable, and lets the product use course-specific learning interactions rather than generic library defaults.

### B. React Flow plus Monaco

This provides richer graph and editor primitives immediately, but adds a large dependency footprint, worker configuration, `file://` packaging risk, and an editor whose complexity exceeds the learning use case. It remains a future option after packaging and updater infrastructure exist.

### C. Separate note, mind-map, graph, and code applications

This reduces individual component complexity but fragments the learning trail and creates four competing storage models. It conflicts with the goal that a quote, note, concept, task, test, and review all remain connected inside one course.

## 3. Information architecture

The application has three persistent layers:

1. Global shell: window controls, course switcher, quick-create course, navigation, local status, theme.
2. Course workspace: dashboard, roadmap, knowledge canvas, library, Python workbench, project/research, review.
3. Creation surfaces: draggable canvas nodes, document quote drawer, code editor and console.

Creating a course immediately activates it and opens its knowledge canvas. Empty courses receive a safe starter context instead of requiring a 24-week roadmap. Switching courses reloads every course-scoped view without restarting Electron.

## 4. Knowledge canvas

### Canvas behavior

- Pan by dragging empty canvas; zoom with toolbar or wheel; reset and fit controls remain visible.
- Drag nodes using their header. Position updates optimistically and persists on pointer release.
- Select a node to open an inspector; arrow keys nudge the selected node.
- Connect mode starts from a node connector and completes on another node. Edge types are prerequisite, mind-map branch, and association.
- Prerequisite edges remain a DAG and reject cycles. Mind-map and association edges may form cycles.
- SVG edges render underneath cards and update continuously while a card moves.

### Node types

| Type | Purpose | Default presentation |
|---|---|---|
| Concept | A testable knowledge unit | Compact structured card with mastery |
| Sticky note | Free thought, reminder, synthesis | Warm paper card with editable body |
| Memory card | Prompt/answer or definition | Front/back sections and review affordance |
| Citation | Verbatim imported source excerpt | Quotation card with source document chip |

Every node stores title, content, module, kind, color, x/y position, optional source document, source title, and source quote. Users can edit and delete nodes; deleting a node removes attached edges.

### Citation flow

The canvas opens a source drawer listing documents in the active course. Selecting a document loads its parsed body. The user selects text and chooses “引用选中文字”; a citation node appears near the current viewport and retains the document ID, title, and quote. No fake search or clipboard placeholder is used.

## 5. Python workbench

### Environment model

The backend discovers interpreters from the running virtual environment, project `.venv`, `PATH`, Windows `py -0p`, and active Conda metadata. Each candidate is probed with a short `--version` timeout and exposed as an opaque environment ID. A run may only use an ID from this discovered allowlist; arbitrary executable paths are rejected.

### Workbench experience

- Activity rail for Explorer, Run, and History.
- File-like tabs for `main.py` and public tests, plus starter templates.
- Line-number gutter, editor font-size control, timeout selector, environment selector, Run and Stop.
- Bottom panel tabs for Output, Problems, and Run History.
- Console themes: Dark, Light, and System. Console theme persists independently from the app theme.
- Status bar shows interpreter, Python version, line/column, encoding, run state, and duration.
- Output may be cleared or copied. Safety behavior remains: isolated process, timeout, output cap, stop, and persisted run history.

This is deliberately a learning IDE, not a full VS Code clone: no extension host, debugger protocol, shell terminal, arbitrary workspace access, or package installer in this release.

## 6. Visual system and motion

The new direction is “editorial learning atelier”: warm paper surfaces in light mode, deep graphite in dark mode, cobalt as the primary action color, citron for memory, coral for warnings, and teal for successful evidence. Typography uses locally available Bahnschrift for display, Microsoft YaHei UI for Chinese reading, and Cascadia Code/Consolas for code.

The shell gains a compact icon navigation rail, floating course control, stronger hierarchy, layered surfaces, and consistent 10/14/18 px radii. Motion has purpose:

- 180–240 ms hover, press, popover, inspector, and tab transitions.
- 320 ms page entrance with opacity and small translation.
- Node creation uses a short scale/fade; dragging removes shadow latency and raises the card.
- Progress and status transitions animate without layout shifts.
- `prefers-reduced-motion` collapses all nonessential motion.

Icons use one inline SVG system. Emoji are not used as controls. Focus rings, 44 px primary targets, ARIA names, keyboard reachability, contrast, and error `aria-live` remain mandatory.

## 7. Backend and migration

Database schema version 2 adds knowledge node content, kind, color, position, and citation fields; Python run environment metadata is also added. Initialization inspects existing columns before `ALTER TABLE`, so current user databases migrate in place. API additions:

- `PATCH/DELETE /api/knowledge/nodes/{id}`
- `DELETE /api/knowledge/edges/{id}`
- `GET /api/python/environments`
- `PythonRunCreate.environment_id` and run metadata

The existing course create/list/activate endpoints remain compatible. `/api/today` returns a valid custom-course context when the active course has no roadmap.

## 8. Error handling

- Autosave failures restore the prior node position and show a nonblocking toast.
- A graph cycle highlights the attempted relation and preserves both nodes.
- Missing source documents leave the saved quote readable and label the source unavailable.
- Missing interpreters are excluded from discovery; if none remain, the bundled/current interpreter is returned as the fallback.
- If a selected environment disappears before running, the API returns a stable `PYTHON_ENV_NOT_FOUND` error and the UI prompts the user to choose another environment.

## 9. Test contract

- Backend: blank course today response; course isolation; node create/update/move/delete; citation persistence; relation-specific cycle rules; migration; interpreter discovery and allowlist; selected interpreter run metadata.
- Frontend: create course then land on knowledge canvas; create every node type; drag persistence; connect flow; document quote creation; environment selection; console theme; output tabs; accessible controls.
- Desktop E2E: create and switch a course, drag a node, reload and verify position, create a source citation, run Python with a discovered environment, test dark/light console, resize at required resolutions, and assert no console errors.

## 10. Scope guard

This upgrade does not add collaborative cursors, cloud sync, rich-text block collaboration, full Monaco/VS Code extensions, a shell terminal, package installation, or OCR. The architecture leaves room for those capabilities without pretending they exist now.

