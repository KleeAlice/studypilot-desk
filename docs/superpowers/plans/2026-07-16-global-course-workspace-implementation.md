# Global Course Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the course bookshelf the application-level entry, add a course home and explicit course routes, and support multiple knowledge notebooks plus recoverable deletion.

**Architecture:** Introduce an explicit two-level app shell (`courses` and `course workspace`) while retaining the current Electron/FastAPI boundary. Upgrade SQLite to schema v5 with course metadata, soft deletion, and `knowledge_notebooks`; migrate every existing course graph into a default notebook. Add explicit course/notebook APIs, then move React from implicit view state to a small local route model and adapt the existing knowledge canvas to a selected notebook.

**Tech Stack:** Electron 37, React 19, TypeScript 5.8, Vite, FastAPI, Pydantic, SQLite, Vitest/Testing Library, pytest, Playwright.

**Repository note:** This workspace has no `.git` metadata, so the commit steps from the standard workflow cannot be executed. Each task ends with a test checkpoint instead.

---

## File map

- `backend/app/db.py`: schema v5, additive migrations, default-notebook data migration.
- `backend/app/schemas.py`: course profile and notebook request validation.
- `backend/app/repository.py`: active/trashed course queries, course profile updates, course home summary.
- `backend/app/services/notebooks.py`: notebook ownership, CRUD, soft delete and restore.
- `backend/app/services/knowledge.py`: explicit course/notebook graph access with legacy wrappers.
- `backend/app/main.py`: course home, trash, notebook and notebook-graph routes.
- `frontend/src/app/router.ts`: parse/build local application routes.
- `frontend/src/app/App.tsx`: global shelf shell versus course workspace shell.
- `frontend/src/features/CourseLibrary.tsx`: application-level bookshelf, filters and continue card.
- `frontend/src/features/CourseWizard.tsx`: two-step skippable course creation.
- `frontend/src/features/CourseHome.tsx`: course overview and module launch points.
- `frontend/src/features/NotebookLibrary.tsx`: course-local notebook collection.
- `frontend/src/features/Knowledge.tsx`: selected-notebook canvas.
- `frontend/src/features/Trash.tsx`: restore/permanent-delete UI.
- `frontend/src/components/NavRail.tsx`: course-local navigation and shelf return.
- `frontend/src/styles/workspace.css`: responsive shelf, course-home and transition styles.
- `tests/e2e/core-flows.spec.ts`: startup-to-shelf and course/notebook flows.

### Task 1: Schema v5 course metadata and recoverable deletion

**Files:**
- Modify: `backend/app/db.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/repository.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_database.py`
- Test: `backend/tests/test_api_core.py`

- [ ] **Step 1: Write failing schema and API tests**

```python
def test_schema_v5_adds_course_workspace_fields(database):
    with database.connect() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 5
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(courses)")}
    assert {"cover_style", "icon", "goal", "target_weeks", "weekly_hours", "last_opened_at", "deleted_at", "purge_after"} <= columns

def test_course_delete_moves_to_trash_and_restore(client):
    course = client.post("/api/courses", json={"title": "Linear Algebra"}).json()["data"]
    assert client.delete(f"/api/courses/{course['id']}").status_code == 200
    assert all(item["id"] != course["id"] for item in client.get("/api/courses").json()["data"])
    trashed = client.get("/api/courses/trash").json()["data"]
    assert [item["id"] for item in trashed] == [course["id"]]
    assert client.post(f"/api/courses/{course['id']}/restore").status_code == 200
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `.venv\Scripts\python.exe -m pytest backend/tests/test_database.py backend/tests/test_api_core.py -q`

Expected: schema version and trash endpoints fail.

- [ ] **Step 3: Add schema v5 columns and validated course payloads**

```python
class CourseCreate(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    cover_style: str = Field(default="indigo", max_length=80)
    icon: str = Field(default="book", max_length=40)
    goal: str = Field(default="", max_length=2000)
    start_date: str | None = None
    target_weeks: int | None = Field(default=None, ge=1, le=260)
    weekly_hours: float | None = Field(default=None, ge=0.5, le=168)

class CourseUpdate(CourseCreate):
    title: str = Field(min_length=1, max_length=160)
```

Use nullable `deleted_at`/`purge_after`, update active-course fallback after soft deletion, and filter normal `list_courses()` with `WHERE deleted_at IS NULL`.

- [ ] **Step 4: Add trash, restore, and permanent-delete routes**

```python
@app.get("/api/courses/trash")
def course_trash(request: Request) -> dict:
    return envelope(repo(request).list_trashed_courses())

@app.post("/api/courses/{course_id}/restore")
def restore_course(course_id: int, request: Request) -> dict:
    return envelope(repo(request).restore_course(course_id))

@app.delete("/api/courses/{course_id}/permanent")
def purge_course(course_id: int, request: Request) -> dict:
    paths = media(request).paths_for_course(course_id)
    result = repo(request).purge_course(course_id)
    media(request).remove_files(paths)
    return envelope(result)
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `.venv\Scripts\python.exe -m pytest backend/tests/test_database.py backend/tests/test_api_core.py -q`

Expected: all focused tests pass.

### Task 2: Knowledge notebooks and legacy graph migration

**Files:**
- Modify: `backend/app/db.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/services/notebooks.py`
- Modify: `backend/app/services/knowledge.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_knowledge.py`

- [ ] **Step 1: Write failing notebook ownership tests**

```python
def test_course_has_multiple_isolated_notebooks(client):
    course = client.get("/api/courses").json()["data"][0]
    first = client.post(f"/api/courses/{course['id']}/notebooks", json={"title": "Foundations", "kind": "mindmap"}).json()["data"]
    second = client.post(f"/api/courses/{course['id']}/notebooks", json={"title": "Exercises", "kind": "canvas"}).json()["data"]
    client.post(f"/api/courses/{course['id']}/notebooks/{first['id']}/nodes", json={"title": "Vector", "kind": "concept"})
    graph = client.get(f"/api/courses/{course['id']}/notebooks/{second['id']}/graph").json()["data"]
    assert graph == {"nodes": [], "edges": []}

def test_notebook_from_another_course_is_rejected(client):
    courses = [client.post("/api/courses", json={"title": title}).json()["data"] for title in ("A", "B")]
    notebook = client.post(f"/api/courses/{courses[0]['id']}/notebooks", json={"title": "A notes"}).json()["data"]
    assert client.get(f"/api/courses/{courses[1]['id']}/notebooks/{notebook['id']}/graph").status_code == 404
```

- [ ] **Step 2: Run notebook tests and verify RED**

Run: `.venv\Scripts\python.exe -m pytest backend/tests/test_knowledge.py -q`

Expected: notebook endpoints do not exist.

- [ ] **Step 3: Add notebook schema and migration**

```sql
CREATE TABLE IF NOT EXISTS knowledge_notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'canvas' CHECK(kind IN ('canvas','mindmap','mixed')),
    cover_style TEXT NOT NULL DEFAULT 'indigo',
    canvas_settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_opened_at TEXT,
    deleted_at TEXT
);
```

Add nullable `notebook_id` to `knowledge_nodes` and `knowledge_edges`, create one default notebook per course, and assign all legacy rows before treating the field as required at service level.

- [ ] **Step 4: Implement `NotebookService` and explicit graph context**

```python
class NotebookService:
    def require(self, course_id: int, notebook_id: int, include_deleted: bool = False) -> dict:
        clause = "" if include_deleted else " AND deleted_at IS NULL"
        with self.database.connect() as connection:
            row = connection.execute(
                f"SELECT * FROM knowledge_notebooks WHERE id = ? AND course_id = ?{clause}",
                (notebook_id, course_id),
            ).fetchone()
        if not row:
            raise AppError("NOTEBOOK_NOT_FOUND", "知识笔记不存在", 404)
        return as_dict(row)
```

Change `KnowledgeService` public methods to accept `course_id` and `notebook_id`, and include both fields in every node/edge query. Keep current `/api/knowledge/*` wrappers pointing at the active course's default notebook until the frontend migration is complete.

- [ ] **Step 5: Add notebook CRUD and graph endpoints**

```text
GET    /api/courses/{course_id}/notebooks
POST   /api/courses/{course_id}/notebooks
PATCH  /api/courses/{course_id}/notebooks/{notebook_id}
DELETE /api/courses/{course_id}/notebooks/{notebook_id}
GET    /api/courses/{course_id}/notebooks/{notebook_id}/graph
POST   /api/courses/{course_id}/notebooks/{notebook_id}/nodes
PATCH  /api/courses/{course_id}/notebooks/{notebook_id}/nodes/{node_id}
DELETE /api/courses/{course_id}/notebooks/{notebook_id}/nodes/{node_id}
POST   /api/courses/{course_id}/notebooks/{notebook_id}/edges
DELETE /api/courses/{course_id}/notebooks/{notebook_id}/edges/{edge_id}
```

- [ ] **Step 6: Run knowledge tests and verify GREEN**

Run: `.venv\Scripts\python.exe -m pytest backend/tests/test_knowledge.py backend/tests/test_database.py -q`

Expected: migration, isolation, CRUD and legacy knowledge tests pass.

### Task 3: Explicit app routes and application-level shelf

**Files:**
- Create: `frontend/src/app/router.ts`
- Create: `frontend/src/app/router.test.ts`
- Modify: `frontend/src/app/App.tsx`
- Rename/evolve: `frontend/src/features/NotebookShelf.tsx` to `frontend/src/features/CourseLibrary.tsx`
- Test: `frontend/src/features/CourseLibrary.test.tsx`

- [ ] **Step 1: Write failing route and shelf tests**

```ts
expect(parseRoute("/courses")).toEqual({ level: "library" });
expect(parseRoute("/courses/7/home")).toEqual({ level: "course", courseId: 7, view: "home" });
expect(parseRoute("/courses/7/knowledge/12")).toEqual({ level: "course", courseId: 7, view: "knowledge", notebookId: 12 });
```

```tsx
render(<CourseLibrary courses={[course]} onOpen={open} onCreate={create} onTrash={trash} />);
expect(screen.getByRole("heading", { name: "课程书架" })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /进入课程/ }));
expect(open).toHaveBeenCalledWith(course);
```

- [ ] **Step 2: Run frontend focused tests and verify RED**

Run: `npm.cmd test -- --run frontend/src/app/router.test.ts frontend/src/features/CourseLibrary.test.tsx`

Expected: new modules are missing.

- [ ] **Step 3: Implement the local route model**

```ts
export type AppRoute =
  | { level: "library" }
  | { level: "trash" }
  | { level: "settings" }
  | { level: "course"; courseId: number; view: CourseView; notebookId?: number };

export function navigate(route: AppRoute, replace = false) {
  const path = buildRoute(route);
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
```

Use the pathname as the source of truth, subscribe to `popstate`, and redirect an invalid/missing course to `/courses`.

- [ ] **Step 4: Lift the bookshelf above the desktop workspace shell**

`App.tsx` renders `TitleBar + CourseLibrary` for `library`, and only renders `NavRail + course content` for a `course` route. Remove `knowledgeMode`; the knowledge collection and notebook editor are represented by routes.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run frontend/src/app/router.test.ts frontend/src/features/CourseLibrary.test.tsx`

Expected: route and shelf tests pass.

### Task 4: Two-step course wizard and course home

**Files:**
- Create: `frontend/src/features/CourseWizard.tsx`
- Create: `frontend/src/features/CourseHome.tsx`
- Create: `frontend/src/features/CourseHome.test.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_core.py`

- [ ] **Step 1: Write failing wizard/home tests**

```tsx
await user.type(screen.getByLabelText("课程名称"), "机器学习");
await user.click(screen.getByRole("button", { name: "下一步" }));
await user.type(screen.getByLabelText("学习目标"), "完成可复现实验");
await user.click(screen.getByRole("button", { name: "创建并进入课程" }));
expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "机器学习", goal: "完成可复现实验" }));
```

```tsx
render(<CourseHome course={course} summary={summary} onOpenModule={openModule} />);
expect(screen.getByRole("button", { name: /继续学习/ })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /知识网络/ })).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --run frontend/src/features/CourseHome.test.tsx`

Expected: course home and wizard are missing.

- [ ] **Step 3: Add `GET /api/courses/{course_id}/home`**

Return a bounded summary:

```python
{
    "course": course,
    "task_counts": {"todo": 0, "doing": 0, "done": 0},
    "notebook_count": notebook_count,
    "document_count": document_count,
    "run_count": run_count,
    "recent_items": recent_items[:6],
    "continue_route": continue_route,
}
```

- [ ] **Step 4: Implement wizard and home cards**

The wizard preserves values between steps, allows skipping step two, disables duplicate submission, and returns focus on close. The course home uses a primary continue card plus module cards and recent items; it does not duplicate detailed dashboard analytics.

- [ ] **Step 5: Run API and frontend tests and verify GREEN**

Run: `.venv\Scripts\python.exe -m pytest backend/tests/test_api_core.py -q`

Run: `npm.cmd test -- --run frontend/src/features/CourseHome.test.tsx`

Expected: focused suites pass.

### Task 5: Course-local notebook library and selected-notebook canvas

**Files:**
- Create: `frontend/src/features/NotebookLibrary.tsx`
- Create: `frontend/src/features/NotebookLibrary.test.tsx`
- Modify: `frontend/src/features/Knowledge.tsx`
- Modify: `frontend/src/features/Knowledge.test.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Write failing notebook collection tests**

```tsx
render(<NotebookLibrary course={course} notebooks={notebooks} onOpen={open} onCreate={create} onTrash={trash} />);
expect(screen.getByRole("heading", { name: "知识笔记" })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /新建知识笔记/ }));
await user.click(screen.getByRole("button", { name: /思维导图/ }));
expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: "mindmap" }));
```

- [ ] **Step 2: Run notebook UI tests and verify RED**

Run: `npm.cmd test -- --run frontend/src/features/NotebookLibrary.test.tsx frontend/src/features/Knowledge.test.tsx`

Expected: notebook library is missing and Knowledge still calls legacy endpoints.

- [ ] **Step 3: Add notebook types and API base**

```ts
export interface KnowledgeNotebook {
  id: number;
  course_id: number;
  title: string;
  description: string;
  kind: "canvas" | "mindmap" | "mixed";
  cover_style: string;
  canvas_settings: CanvasSettings;
  node_count: number;
  edge_count: number;
  updated_at: string;
}
```

Build graph paths from `courseId` and `notebookId`; scope canvas preferences by notebook rather than course.

- [ ] **Step 4: Implement notebook collection and adapt Knowledge**

The collection supports search, create type, open, rename, duplicate and trash. `Knowledge` receives `courseId`, `notebookId`, and `notebookTitle`; all node, edge, image and graph operations stay in that notebook. The existing file and clipboard image flows remain intact.

- [ ] **Step 5: Run focused frontend tests and verify GREEN**

Run: `npm.cmd test -- --run frontend/src/features/NotebookLibrary.test.tsx frontend/src/features/Knowledge.test.tsx`

Expected: collection, graph isolation, canvas settings and image tests pass.

### Task 6: Global trash, startup preference and motion

**Files:**
- Create: `frontend/src/features/Trash.tsx`
- Create: `frontend/src/features/Trash.test.tsx`
- Modify: `frontend/src/features/Settings.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/styles/workspace.css`
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Write failing trash and startup tests**

```tsx
render(<Trash courses={[trashedCourse]} onRestore={restore} onPurge={purge} />);
await user.click(screen.getByRole("button", { name: /恢复课程/ }));
expect(restore).toHaveBeenCalledWith(trashedCourse);
```

Test that `startup_destination = "last_course"` restores the persisted course route and that the default value navigates to `/courses`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --run frontend/src/features/Trash.test.tsx`

Expected: trash UI and startup behavior are missing.

- [ ] **Step 3: Implement settings and trash operations**

Store `startup_destination` as `"library" | "last_course"`, and `last_course_route` as a validated local path. Restoring refreshes the shelf; permanent deletion requires a confirmation dialog showing the course title and affected data categories.

- [ ] **Step 4: Add meaningful motion and reduced-motion fallback**

Use named classes for `book-enter`, `book-open`, `workspace-enter`, `card-stagger`, and `layout-filter`. Keep navigation transitions under 320ms except the 520ms book-open transition. Disable transforms and layout interpolation under `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 5: Run focused and full frontend tests**

Run: `npm.cmd test -- --run`

Expected: all frontend unit tests pass.

### Task 7: Full verification and desktop flow

**Files:**
- Modify: `tests/e2e/core-flows.spec.ts`
- Modify: `scripts/smoke.mjs` only if startup selectors change
- Modify: `docs/TEST_REPORT.md`

- [ ] **Step 1: Update E2E to assert the new hierarchy**

```ts
await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();
await page.getByRole("button", { name: /新建课程/ }).click();
// finish wizard
await expect(page.getByRole("heading", { name: /课程主页/ })).toBeVisible();
await page.getByRole("button", { name: /知识网络/ }).click();
await page.getByRole("button", { name: /新建知识笔记/ }).click();
await expect(page.getByTestId("knowledge-canvas")).toBeVisible();
await page.getByRole("button", { name: /返回课程书架/ }).click();
await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();
```

- [ ] **Step 2: Run backend full regression**

Run: `.venv\Scripts\python.exe -m pytest backend/tests -q`

Expected: all backend tests pass.

- [ ] **Step 3: Run frontend regression, typecheck and build**

Run: `npm.cmd test -- --run`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run build`

Expected: all commands exit 0.

- [ ] **Step 4: Run native smoke and Electron E2E**

Run: `.venv\Scripts\python.exe scripts\smoke_test.py`

Run: `npm.cmd run smoke`

Run: `npm.cmd run test:e2e`

Expected: backend smoke reports `status=ok`, Electron reports `STUDYPILOT_SMOKE_OK`, and Playwright passes at both tested viewport bounds.

- [ ] **Step 5: Update the test report with exact fresh counts**

Record command, count, date, platform, known non-blocking warnings, and the new global-shelf/course-home/notebook/trash coverage in `docs/TEST_REPORT.md`.
