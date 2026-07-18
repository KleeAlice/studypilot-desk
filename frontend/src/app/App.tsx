import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavRail, type ViewKey } from "../components/NavRail";
import { Onboarding } from "../components/Onboarding";
import { TitleBar } from "../components/TitleBar";
import { CourseSwitcher } from "../components/CourseSwitcher";
import { Dashboard } from "../features/Dashboard";
import { Knowledge } from "../features/Knowledge";
import { NotebookShelf } from "../features/NotebookShelf";
import { CourseLibrary } from "../features/CourseLibrary";
import { CourseWizard } from "../features/CourseWizard";
import { CourseHome, type CourseHomeSummary } from "../features/CourseHome";
import { NotebookLibrary } from "../features/NotebookLibrary";
import { Trash } from "../features/Trash";
import { GlobalSettings } from "../features/GlobalSettings";
import { Lab } from "../features/Lab";
import { Library } from "../features/Library";
import { ReviewHub } from "../features/ReviewHub";
import { Roadmap } from "../features/Roadmap";
import { Settings } from "../features/Settings";
import { Studio } from "../features/Studio";
import { LearningStats } from "../features/LearningStats";
import { ApiClient } from "../services/api";
import type { Course, CourseCreateInput, DesktopRuntime, KnowledgeNotebook, TodayData } from "../types";
import { waitForMotionFeedback } from "../ui/motion";
import { applyTypography } from "../ui/typography";
import { buildRoute, currentRoute, hasExplicitRoute, navigate, parseRoute, type AppRoute } from "./router";

const EMPTY_TODAY: TodayData = {
  week: { week: 1, phase: 0, gate: "NEW", foundation: "", tasks: [], deliverables: [] },
  phase: { phase: 0, title: "尚未选择课程", gate: "NEW", acceptance: "", start_week: 1, end_week: 1 },
  tasks: [],
};

export function App() {
  const [runtime, setRuntime] = useState<DesktopRuntime | null>(null);
  const [settings, setSettings] = useState<Record<string, any> | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [system, setSystem] = useState<Record<string, any> | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [view, setView] = useState<ViewKey>("today");
  const [route, setRoute] = useState<AppRoute>(() => currentRoute());
  const [courseWizardOpen, setCourseWizardOpen] = useState(false);
  const [homeSummary, setHomeSummary] = useState<CourseHomeSummary | null>(null);
  const [notebooks, setNotebooks] = useState<KnowledgeNotebook[]>([]);
  const [trashCourses, setTrashCourses] = useState<Course[]>([]);
  const [knowledgeMode, setKnowledgeMode] = useState<"shelf" | "canvas">("shelf");
  const [collapsed, setCollapsed] = useState(false);
  const [fatal, setFatal] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const api = useMemo(() => runtime ? new ApiClient(runtime.apiBase) : null, [runtime]);
  const startupResolvedRef = useRef(false);

  const refreshToday = useCallback(async () => {
    if (!api) return;
    setToday(await api.get<TodayData>("/api/today"));
  }, [api]);

  useEffect(() => {
    if (!api || route.level !== "course" || route.view !== "home") {
      setHomeSummary(null);
      return;
    }
    let active = true;
    api.get<CourseHomeSummary>(`/api/courses/${route.courseId}/home`)
      .then((value) => { if (active) setHomeSummary(value); })
      .catch((error) => { if (active) setWorkspaceNotice(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [api, route]);

  useEffect(() => {
    if (!api || route.level !== "trash") return;
    let active = true;
    api.get<Course[]>("/api/courses/trash")
      .then((value) => { if (active) setTrashCourses(value); })
      .catch((error) => { if (active) setWorkspaceNotice(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [api, route]);

  useEffect(() => {
    if (!settings || startupResolvedRef.current) return;
    startupResolvedRef.current = true;
    if (hasExplicitRoute()) return;
    const saved = typeof settings.last_course_route === "string" ? parseRoute(settings.last_course_route) : null;
    if (settings.startup_destination === "last_course" && saved?.level === "course") navigate(saved, true);
    else navigate({ level: "library" }, true);
  }, [settings]);

  useEffect(() => {
    if (!api || route.level !== "course") return;
    void api.put("/api/settings/last_course_route", { value: buildRoute(route) }).catch(() => undefined);
  }, [api, route]);

  useEffect(() => {
    if (!api || route.level !== "course" || route.view !== "knowledge") {
      setNotebooks([]);
      return;
    }
    let active = true;
    api.get<KnowledgeNotebook[]>(`/api/courses/${route.courseId}/notebooks`)
      .then((value) => { if (active) setNotebooks(value); })
      .catch((error) => { if (active) setWorkspaceNotice(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [api, route]);

  useEffect(() => {
    let active = true;
    window.studypilot.runtime().then((value) => { if (active) setRuntime(value); }).catch((error) => setFatal(String(error)));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onRouteChange = () => setRoute(currentRoute());
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);

  useEffect(() => {
    if (!api) return;
    Promise.all([
      api.get<Record<string, any>>("/api/settings"),
      api.get<TodayData>("/api/today").catch(() => EMPTY_TODAY),
      api.get<Record<string, any>>("/api/system/status"),
      api.get<Course[]>("/api/courses"),
    ]).then(([nextSettings, nextToday, nextSystem, nextCourses]) => {
      setSettings(nextSettings); setToday(nextToday); setSystem(nextSystem); setCourses(nextCourses);
      applyTheme(nextSettings.theme || "system");
      applyTypography(nextSettings.ui_font || "system", nextSettings.code_font || "system");
    }).catch((error) => setFatal(error instanceof Error ? error.message : String(error)));
  }, [api]);

  function applyTheme(theme: string) {
    const systemDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
    document.documentElement.dataset.theme = resolved;
  }

  function changeTheme(theme: string) {
    applyTheme(theme);
    setSettings((current) => current ? { ...current, theme } : current);
  }

  async function activateCourse(course: Course) {
    setWorkspaceNotice("");
    await api!.post(`/api/courses/${course.id}/activate`);
    setCourses((current) => current.some((item) => item.id === course.id) ? current : [...current, course]);
    setSettings((value) => value ? { ...value, active_course: course.id } : value);
    setSystem((value) => value ? { ...value, active_course: course.id } : value);
    setWorkspaceEpoch((value) => value + 1);

    const [todayResult, coursesResult] = await Promise.allSettled([
      api!.get<TodayData>("/api/today"),
      api!.get<Course[]>("/api/courses"),
    ]);
    if (todayResult.status === "fulfilled") setToday(todayResult.value);
    if (coursesResult.status === "fulfilled") {
      setCourses(coursesResult.value.some((item) => item.id === course.id)
        ? coursesResult.value
        : [...coursesResult.value, course]);
    }
    if (todayResult.status === "rejected" || coursesResult.status === "rejected") {
      setWorkspaceNotice(`已切换到“${course.title}”，部分摘要暂未刷新，可继续使用。`);
    }
  }

  async function createCourse(title: string, description: string): Promise<void>;
  async function createCourse(input: CourseCreateInput): Promise<void>;
  async function createCourse(inputOrTitle: CourseCreateInput | string, description = "") {
    const payload: CourseCreateInput = typeof inputOrTitle === "string"
      ? { title: inputOrTitle, description, cover_style: "indigo", icon: "book", goal: "", start_date: null, target_weeks: null, weekly_hours: null }
      : inputOrTitle;
    const created = await api!.post<Course>("/api/courses", payload);
    setCourses((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
    try {
      await Promise.all([activateCourse(created), waitForMotionFeedback()]);
      setCourseWizardOpen(false);
      navigate({ level: "course", courseId: created.id, view: "home" });
    } catch {
      setWorkspaceNotice(`课程“${created.title}”已经创建，但暂时无法进入；可从课程列表重试。`);
    }
  }

  async function openNotebook(course: Course) {
    await Promise.all([activateCourse(course), waitForMotionFeedback()]);
    navigate({ level: "course", courseId: course.id, view: "home" });
  }

  async function updateCourse(course: Course, changes: Partial<Pick<Course, "title" | "cover_style">>) {
    const updated = await api!.patch<Course>(`/api/courses/${course.id}`, changes);
    setCourses((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
  }

  async function deleteNotebook(course: Course) {
    const result = await api!.delete<{ deleted_id: number; active_course: Course | null }>(`/api/courses/${course.id}`);
    setCourses((current) => current.filter((item) => item.id !== result.deleted_id));
    setSettings((value) => value ? { ...value, active_course: result.active_course?.id || 0 } : value);
    setSystem((value) => value ? { ...value, active_course: result.active_course?.id || 0 } : value);
    if (course.id === Number(system?.active_course || settings?.active_course || 1)) {
      await refreshToday().catch(() => undefined);
      setWorkspaceEpoch((value) => value + 1);
    }
  }

  async function restoreCourse(course: Course) {
    const restored = await api!.post<Course>(`/api/courses/${course.id}/restore`);
    setTrashCourses((current) => current.filter((item) => item.id !== course.id));
    setCourses((current) => current.some((item) => item.id === restored.id) ? current : [restored, ...current]);
  }

  async function purgeCourse(course: Course) {
    if (!window.confirm(`永久删除「${course.title}」？\n\n任务、资料、知识笔记、实验记录和图片都将无法恢复。`)) return;
    await api!.delete(`/api/courses/${course.id}/permanent`);
    setTrashCourses((current) => current.filter((item) => item.id !== course.id));
  }

  async function changeStartupDestination(value: "library" | "last_course") {
    await api!.put("/api/settings/startup_destination", { value });
    setSettings((current) => current ? { ...current, startup_destination: value } : current);
  }

  async function changeTypography(key: "ui_font" | "code_font", value: string) {
    await api!.put(`/api/settings/${key}`, { value });
    setSettings((current) => {
      const next = current ? { ...current, [key]: value } : current;
      if (next) applyTypography(next.ui_font || "system", next.code_font || "system");
      return next;
    });
  }

  async function createKnowledgeNotebook(input: Pick<KnowledgeNotebook, "title" | "description" | "kind" | "cover_style">) {
    if (route.level !== "course") return;
    const created = await api!.post<KnowledgeNotebook>(
      `/api/courses/${route.courseId}/notebooks`,
      { ...input, canvas_settings: {} },
    );
    setNotebooks((current) => [created, ...current]);
    navigate({ level: "course", courseId: route.courseId, view: "knowledge", notebookId: created.id });
  }

  async function trashKnowledgeNotebook(notebook: KnowledgeNotebook) {
    if (route.level !== "course") return;
    await api!.delete(`/api/courses/${route.courseId}/notebooks/${notebook.id}`);
    setNotebooks((current) => current.filter((item) => item.id !== notebook.id));
  }

  function changeView(next: ViewKey) {
    if (route.level === "course") {
      const nextView = next === "today" ? "dashboard" : next;
      navigate({ level: "course", courseId: route.courseId, view: nextView });
      return;
    }
    if (next === "knowledge") setKnowledgeMode("shelf");
    setView(next);
  }

  if (fatal) return <div className="fatal-screen"><div className="brand-mark">SP</div><h1>本地服务未就绪</h1><p>{fatal}</p><button onClick={() => location.reload()}>重新连接</button></div>;
  if (!runtime || !api || !settings || !today) return <div className="boot-screen"><div className="boot-wordmark">STUDYPILOT</div><div className="boot-line"><span /></div><p>正在装载路线、数据库与本地服务</p></div>;

  const activeCourseId = Number(system?.active_course || settings.active_course || 1);
  const activeCourse = courses.find((course) => course.id === activeCourseId);
  if (route.level === "trash") return (
    <div className="desktop-shell desktop-shell--library">
      <TitleBar />
      <Trash courses={trashCourses} onRestore={restoreCourse} onPurge={purgeCourse} onBack={() => navigate({ level: "library" })} />
      {workspaceNotice && <div className="workspace-notice" role="status"><span>{workspaceNotice}</span></div>}
    </div>
  );
  if (route.level === "settings") return (
    <div className="desktop-shell desktop-shell--library">
      <TitleBar />
      <GlobalSettings
        startupDestination={settings.startup_destination === "last_course" ? "last_course" : "library"}
        uiFont={settings.ui_font || "system"}
        codeFont={settings.code_font || "system"}
        onChangeStartup={changeStartupDestination}
        onChangeTypography={changeTypography}
        onBack={() => navigate({ level: "library" })}
      />
    </div>
  );
  if (route.level === "library") return (
    <div className="desktop-shell desktop-shell--library">
      <TitleBar />
      <CourseLibrary
        courses={courses}
        activeCourseId={activeCourseId}
        onOpen={openNotebook}
        onCreate={() => setCourseWizardOpen(true)}
        onUpdate={updateCourse}
        onTrash={deleteNotebook}
        onOpenTrash={() => navigate({ level: "trash" })}
        onOpenSettings={() => navigate({ level: "settings" })}
      />
      <CourseWizard open={courseWizardOpen} onClose={() => setCourseWizardOpen(false)} onCreate={createCourse} />
      {!settings.onboarding_complete && <Onboarding api={api} onComplete={() => setSettings({ ...settings, onboarding_complete: true })} />}
    </div>
  );
  const routeCourse = route.level === "course"
    ? courses.find((course) => course.id === route.courseId) || activeCourse
    : activeCourse;
  const workspaceView: ViewKey = route.level === "course"
    ? ({ dashboard: "today", home: "home" } as Record<string, ViewKey>)[route.view] || route.view as ViewKey
    : view;
  const modulePage = {
    home: null,
    today: <Dashboard key={`today-${workspaceEpoch}`} api={api} today={today} onRefresh={refreshToday} />,
    roadmap: <Roadmap key={`roadmap-${workspaceEpoch}`} api={api} />,
    knowledge: route.level === "course"
      ? route.notebookId
        ? <Knowledge
            key={`knowledge-${route.courseId}-${route.notebookId}-${workspaceEpoch}`}
            api={api}
            courseId={route.courseId}
            notebookId={route.notebookId}
            courseTitle={routeCourse?.title}
            notebookTitle={notebooks.find((item) => item.id === route.notebookId)?.title}
            onBack={() => navigate({ level: "course", courseId: route.courseId, view: "knowledge" })}
          />
        : <NotebookLibrary
            courseTitle={routeCourse?.title || "当前课程"}
            notebooks={notebooks}
            onOpen={(notebook) => navigate({ level: "course", courseId: route.courseId, view: "knowledge", notebookId: notebook.id })}
            onCreate={createKnowledgeNotebook}
            onTrash={trashKnowledgeNotebook}
            onBackHome={() => navigate({ level: "course", courseId: route.courseId, view: "home" })}
          />
      : knowledgeMode === "shelf"
        ? <NotebookShelf courses={courses} activeCourseId={activeCourseId} onOpen={openNotebook} onCreate={createCourse} onDelete={deleteNotebook} />
        : <Knowledge key={`knowledge-${workspaceEpoch}`} api={api} courseId={activeCourseId} courseTitle={activeCourse?.title} onBack={() => setKnowledgeMode("shelf")} />,
    library: <Library key={`library-${workspaceEpoch}`} api={api} />,
    lab: <Lab key={`lab-${workspaceEpoch}`} api={api} courseId={Number(system?.active_course || settings.active_course || 1)} />,
    studio: <Studio key={`studio-${workspaceEpoch}`} api={api} />,
    review: <ReviewHub key={`review-${workspaceEpoch}`} api={api} />,
    stats: route.level === "course"
      ? <LearningStats key={`stats-${route.courseId}-${workspaceEpoch}`} api={api} courseId={route.courseId} courseTitle={routeCourse?.title} />
      : null,
    settings: <Settings
      key={`settings-${workspaceEpoch}`}
      api={api}
      runtime={runtime}
      initialTheme={settings.theme}
      initialUiFont={settings.ui_font || "system"}
      initialCodeFont={settings.code_font || "system"}
      onTheme={changeTheme}
      onTypography={changeTypography}
    />,
  }[workspaceView];
  const page = route.level === "course" && route.view === "home"
    ? homeSummary && routeCourse
      ? <CourseHome
          course={routeCourse}
          summary={homeSummary}
          onOpenModule={(next) => navigate({ level: "course", courseId: route.courseId, view: next })}
          onContinue={() => navigate({ level: "course", courseId: route.courseId, view: "dashboard" })}
        />
      : <div className="course-home-loading" role="status">正在整理课程主页…</div>
    : modulePage;

  return (
    <div className="desktop-shell">
      <TitleBar />
      <div className="desktop-body">
        <NavRail
          active={workspaceView}
          onChange={changeView}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          courseTitle={routeCourse?.title}
          onBackToLibrary={() => navigate({ level: "library" })}
        />
        <main className="main-stage">
          <div className="context-strip"><CourseSwitcher courses={courses} activeCourseId={Number(system?.active_course || settings.active_course || 1)} fallbackTitle={today.phase.title} onActivate={openNotebook} onCreate={createCourse} /><i /><span>W{String(today.week.week).padStart(2, "0")}</span><strong>{today.phase.gate}</strong><small>{system?.status === "ready" ? "LOCAL / READY" : "LOCAL / CHECK"}</small></div>
          <div className="page-scroll" key={route.level === "course" ? `${route.courseId}-${route.view}-${route.notebookId || ""}` : workspaceView}>{page}</div>
        </main>
      </div>
      {workspaceNotice && <div className="workspace-notice" role="status"><span>{workspaceNotice}</span><button aria-label="关闭工作区提示" onClick={() => setWorkspaceNotice("")}>×</button></div>}
      {!settings.onboarding_complete && <Onboarding api={api} onComplete={() => setSettings({ ...settings, onboarding_complete: true })} />}
    </div>
  );
}
