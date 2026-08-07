import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavRail, type ViewKey } from "../components/NavRail";
import { TitleBar } from "../components/TitleBar";
import { CourseSwitcher } from "../components/CourseSwitcher";
import { StudySplitWorkspace } from "../components/StudySplitWorkspace";
import { Dashboard } from "../features/Dashboard";
import { Knowledge } from "../features/Knowledge";
import { NotebookShelf } from "../features/NotebookShelf";
import { CourseLibrary } from "../features/CourseLibrary";
import { CourseWizard } from "../features/CourseCreationWizard";
import { CourseHome, type CourseHomeSummary } from "../features/CourseHome";
import { NotebookLibrary } from "../features/NotebookLibrary";
import { Trash } from "../features/Trash";
import { GlobalSettings } from "../features/GlobalSettings";
import { Lab } from "../features/Lab";
import { Library } from "../features/Library";
import { DocumentWorkspace } from "../document/DocumentWorkspace";
import { CourseRoadmap } from "../features/CourseRoadmap";
import { Settings } from "../features/Settings";
import { Studio } from "../features/Studio";
import { LearningStats } from "../features/LearningStats";
import { LearningCenter } from "../features/LearningCenter";
import { LanguageCourseShell } from "../language/LanguageCourseShell";
import type { LanguageCourseView } from "../language/LanguageNavRail";
import { LanguageHome } from "../language/LanguageHome";
import { LanguagePractice } from "../language/LanguagePractice";
import { LanguageStats } from "../language/LanguageStats";
import { GuidedLanguageLesson } from "../language/GuidedLanguageLesson";
import { LanguageJourney } from "../language/LanguageJourney";
import { LanguageMaterials } from "../language/LanguageMaterials";
import { LanguageSettings } from "../language/LanguageSettings";
import type { LanguagePracticeType } from "../language/types";
import { VocabularyLibrary } from "../language/VocabularyLibrary";
import { AgentHost } from "../agent/AgentHost";
import type { AgentMode, AgentSource } from "../agent/types";
import { announceDocumentSource, storeDocumentSourceFocus, type DocumentSourceFocus } from "../document/sourceFocus";
import type { DocumentAgentContext } from "../document/DocumentWorkspace";
import { ApiClient } from "../services/api";
import type { Course, CourseCreateInput, DesktopRuntime, KnowledgeNotebook, TodayData } from "../types";
import { waitForMotionFeedback } from "../ui/motion";
import { applyTypography, normalizeUiFontScale } from "../ui/typography";
import { applyGlassOpacity, applyWallpaper, normalizeGlassOpacity, normalizeWallpaperMode, wallpaperUrl, type WallpaperMode } from "../ui/appearance";
import { applyWallpaperPalette, extractWallpaperPalette } from "../ui/wallpaperPalette";
import { applyUiLanguage, normalizeUiLanguage, type UiLanguage } from "../ui/language";
import { BootScreen } from "./BootScreen";
import { buildRoute, currentRoute, hasExplicitRoute, navigate, parseRoute, type AppRoute } from "./router";

const EMPTY_TODAY: TodayData = {
  week: { week: 1, phase: 0, gate: "NEW", foundation: "", tasks: [], deliverables: [] },
  phase: { phase: 0, title: "尚未选择课程", gate: "NEW", acceptance: "", start_week: 1, end_week: 1 },
  tasks: [],
};

function lastCourseDocumentKey(courseId: number) {
  return `studypilot.course-library.last-document.v1.${courseId}`;
}

function rememberCourseDocument(courseId: number, documentId: number | null) {
  try {
    const key = lastCourseDocumentKey(courseId);
    if (documentId) window.localStorage.setItem(key, String(documentId));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in restricted desktop sessions.
  }
}

function lastCourseDocument(courseId: number) {
  try {
    const id = Number(window.localStorage.getItem(lastCourseDocumentKey(courseId)));
    return Number.isInteger(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export function App() {
  const [runtime, setRuntime] = useState<DesktopRuntime | null>(null);
  const [settings, setSettings] = useState<Record<string, any> | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [system, setSystem] = useState<Record<string, any> | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [view, setView] = useState<ViewKey>("home");
  const [route, setRoute] = useState<AppRoute>(() => currentRoute());
  const [courseWizardOpen, setCourseWizardOpen] = useState(false);
  const [homeSummary, setHomeSummary] = useState<CourseHomeSummary | null>(null);
  const [notebooks, setNotebooks] = useState<KnowledgeNotebook[]>([]);
  const [trashCourses, setTrashCourses] = useState<Course[]>([]);
  const [knowledgeMode, setKnowledgeMode] = useState<"shelf" | "canvas">("shelf");
  const [languagePracticeType, setLanguagePracticeType] = useState<LanguagePracticeType>("reading");
  const [collapsed, setCollapsed] = useState(false);
  const [fatal, setFatal] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [documentNavigationOpen, setDocumentNavigationOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [exportDirectory, setExportDirectory] = useState("");
  const [documentAgentContext, setDocumentAgentContext] = useState<DocumentAgentContext>({ documentIds: [], blockKey: "", selectedText: "", locator: {} });
  const [linkedDocumentContext, setLinkedDocumentContext] = useState<DocumentAgentContext>({ documentIds: [], blockKey: "", selectedText: "", locator: {} });
  const [linkedWorkspace, setLinkedWorkspace] = useState<"library" | "knowledge" | null>(null);
  const [linkedDocumentId, setLinkedDocumentId] = useState<number | null>(null);
  const [linkedNotebookId, setLinkedNotebookId] = useState<number | null>(null);
  const [knowledgeSourceFocus, setKnowledgeSourceFocus] = useState<{
    notebookId: number;
    nodeId?: number;
    edgeId?: number;
    title: string;
    requestId: number;
  } | null>(null);
  const api = useMemo(() => runtime ? new ApiClient(runtime.apiBase) : null, [runtime]);
  const startupResolvedRef = useRef(false);
  const documentNavigationCloseTimerRef = useRef<number | null>(null);
  const knowledgeSourceRequestRef = useRef(0);
  useEffect(() => () => cancelDocumentNavigationClose(), []);

  const refreshToday = useCallback(async () => {
    if (!api) return;
    setToday(await api.get<TodayData>("/api/today"));
  }, [api]);

  useEffect(() => {
    if (!api || route.level !== "course" || route.view !== "home") {
      setHomeSummary(null);
      return;
    }
    if (!courses.length) return;
    if (courses.find((course) => course.id === route.courseId)?.course_type === "language") return;
    let active = true;
    api.get<CourseHomeSummary>(`/api/courses/${route.courseId}/home`)
      .then((value) => { if (active) setHomeSummary(value); })
      .catch((error) => { if (active) setWorkspaceNotice(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [api, courses, route]);

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
    if (route.view === "library" && route.documentId) {
      rememberCourseDocument(route.courseId, route.documentId);
    }
  }, [api, route]);

  useEffect(() => {
    if (!api || route.level !== "course") {
      setNotebooks([]);
      return;
    }
    if (!courses.length) return;
    if (courses.find((course) => course.id === route.courseId)?.course_type === "language") return;
    let active = true;
    api.get<KnowledgeNotebook[]>(`/api/courses/${route.courseId}/notebooks`)
      .then((value) => { if (active) setNotebooks(value); })
      .catch((error) => { if (active) setWorkspaceNotice(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [api, courses, route]);

  useEffect(() => {
    let active = true;
    window.studypilot.runtime().then((value) => {
      if (!active) return;
      setRuntime(value);
      setExportDirectory(`${value.dataDir.replace(/[\\/]$/, "")}\\exports`);
      window.studypilot.files.getExportDirectory?.()
        .then((directory) => { if (active) setExportDirectory(directory); })
        .catch(() => undefined);
    }).catch((error) => setFatal(String(error)));
    window.studypilot.fonts?.list()
      .then((fonts) => {
        if (!active) return;
        setSystemFonts([...new Set(fonts
          .map((font) => String(font || "").replace(/\s+/g, " ").trim())
          .filter((font) => font.length > 0 && font.length <= 160 && !/[\uFFFD\u0000-\u001F]/.test(font)),
        )]);
      })
      .catch(() => { if (active) setSystemFonts([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onRouteChange = () => setRoute(currentRoute());
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);

  useEffect(() => {
    const refreshMutatedWorkspace = () => setWorkspaceEpoch((value) => value + 1);
    window.addEventListener("studypilot:workspace-mutated", refreshMutatedWorkspace);
    return () => window.removeEventListener("studypilot:workspace-mutated", refreshMutatedWorkspace);
  }, []);

  useEffect(() => {
    const routeDocumentId = route.level === "course" ? route.documentId : undefined;
    setDocumentAgentContext({ documentIds: routeDocumentId ? [routeDocumentId] : [], blockKey: "", selectedText: "", locator: {} });
    setLinkedDocumentContext({ documentIds: [], blockKey: "", selectedText: "", locator: {} });
    setLinkedWorkspace(null);
    setLinkedDocumentId(null);
    setLinkedNotebookId(null);
  }, [route.level, route.level === "course" ? route.courseId : undefined, route.level === "course" ? route.view : undefined, route.level === "course" ? route.documentId : undefined, route.level === "course" ? route.notebookId : undefined]);

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
      applyTypography(nextSettings.ui_font || "system", nextSettings.code_font || "system", nextSettings.ui_font_scale || 1, nextSettings.force_uniform_font_size === true);
      applyWallpaper(api.baseUrl, nextSettings.wallpaper_mode || "none", nextSettings.wallpaper_revision || "", nextSettings.wallpaper_opacity, nextSettings.wallpaper_blur);
      applyGlassOpacity(nextSettings.glass_opacity);
      applyWallpaperPalette(nextSettings.wallpaper_palette, nextSettings.wallpaper_adaptive_theme === true);
      applyUiLanguage(nextSettings.ui_language);
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

  async function changeGlobalTheme(theme: string) {
    changeTheme(theme);
    await api!.put("/api/settings/theme", { value: theme });
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
      ? {
          title: inputOrTitle,
          description,
          cover_style: "indigo",
          icon: "book",
          goal: "",
          start_date: null,
          target_weeks: null,
          weekly_hours: null,
          course_type: "knowledge",
          target_language_tag: "",
          native_language_tag: "zh-CN",
          proficiency_level: "beginner",
          daily_word_goal: 10,
          pronunciation_scheme: "",
          romanization_enabled: false,
          training_focus: ["reading", "listening", "speaking", "writing"],
        }
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
    const previous = String(settings?.[key] || "system");
    setSettings((current) => {
      const next = current ? { ...current, [key]: value } : current;
      if (next) applyTypography(next.ui_font || "system", next.code_font || "system", next.ui_font_scale || 1, next.force_uniform_font_size === true);
      return next;
    });
    try {
      await api!.put(`/api/settings/${key}`, { value });
    } catch (error) {
      setSettings((current) => {
        const next = current ? { ...current, [key]: previous } : current;
        if (next) applyTypography(next.ui_font || "system", next.code_font || "system", next.ui_font_scale || 1, next.force_uniform_font_size === true);
        return next;
      });
      throw error;
    }
  }

  async function changeFontScale(value: number) {
    const resolved = normalizeUiFontScale(value);
    const previous = normalizeUiFontScale(settings?.ui_font_scale);
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, ui_font_scale: resolved } : current;
      if (next) applyTypography(next.ui_font || "system", next.code_font || "system", resolved, next.force_uniform_font_size === true);
      return next;
    });
    try {
      await api!.put("/api/settings/ui_font_scale", { value: resolved });
    } catch (error) {
      setSettings((current) => {
        const next: Record<string, any> | null = current ? { ...current, ui_font_scale: previous } : current;
        if (next) applyTypography(next.ui_font || "system", next.code_font || "system", previous, next.force_uniform_font_size === true);
        return next;
      });
      throw error;
    }
  }

  async function changeForceUniformFontSize(value: boolean) {
    const previous = settings?.force_uniform_font_size === true;
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, force_uniform_font_size: value } : current;
      if (next) applyTypography(next.ui_font || "system", next.code_font || "system", next.ui_font_scale || 1, value);
      return next;
    });
    try {
      await api!.put("/api/settings/force_uniform_font_size", { value });
    } catch (error) {
      setSettings((current) => {
        const next: Record<string, any> | null = current ? { ...current, force_uniform_font_size: previous } : current;
        if (next) applyTypography(next.ui_font || "system", next.code_font || "system", next.ui_font_scale || 1, previous);
        return next;
      });
      throw error;
    }
  }

  async function changeLanguage(value: UiLanguage) {
    applyUiLanguage(value);
    setSettings((current) => current ? { ...current, ui_language: value } : current);
    await api!.put("/api/settings/ui_language", { value });
  }

  async function changeWorkspaceToolbarAutoHide(value: boolean) {
    const previous = settings?.workspace_toolbar_auto_hide !== false;
    setSettings((current) => current ? { ...current, workspace_toolbar_auto_hide: value } : current);
    try {
      await api!.put("/api/settings/workspace_toolbar_auto_hide", { value });
    } catch (error) {
      setSettings((current) => current ? { ...current, workspace_toolbar_auto_hide: previous } : current);
      throw error;
    }
  }

  async function changeWallpaperMode(value: WallpaperMode) {
    const previous = normalizeWallpaperMode(settings?.wallpaper_mode);
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, wallpaper_mode: value } : current;
      if (next) applyWallpaper(api!.baseUrl, value, next.wallpaper_revision || "", next.wallpaper_opacity, next.wallpaper_blur);
      return next;
    });
    try {
      await api!.put("/api/settings/wallpaper_mode", { value });
    } catch (error) {
      setSettings((current) => current ? { ...current, wallpaper_mode: previous } : current);
      applyWallpaper(api!.baseUrl, previous, settings?.wallpaper_revision || "", settings?.wallpaper_opacity, settings?.wallpaper_blur);
      throw error;
    }
  }

  async function uploadWallpaper(file: File) {
    const palettePromise = extractWallpaperPalette(file).catch(() => null);
    const form = new FormData();
    form.append("file", file);
    const result = await api!.post<{ mode: WallpaperMode; revision: string }>("/api/settings/wallpaper", form, { timeoutMs: 30_000 });
    const palette = await palettePromise;
    if (palette) await api!.put("/api/settings/wallpaper_palette", { value: palette });
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, wallpaper_mode: result.mode, wallpaper_revision: result.revision, wallpaper_palette: palette } : current;
      if (next) {
        applyWallpaper(api!.baseUrl, result.mode, result.revision, next.wallpaper_opacity, next.wallpaper_blur);
        applyWallpaperPalette(palette, next.wallpaper_adaptive_theme === true);
      }
      return next;
    });
  }

  async function clearWallpaper() {
    const result = await api!.delete<{ mode: WallpaperMode; revision: string }>("/api/settings/wallpaper");
    await api!.put("/api/settings/wallpaper_palette", { value: null });
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, wallpaper_mode: result.mode, wallpaper_revision: result.revision, wallpaper_palette: null } : current;
      if (next) {
        applyWallpaper(api!.baseUrl, result.mode, result.revision, next.wallpaper_opacity, next.wallpaper_blur);
        applyWallpaperPalette(null, false);
      }
      return next;
    });
  }

  async function changeWallpaperAdaptiveTheme(value: boolean) {
    const previous = settings?.wallpaper_adaptive_theme === true;
    setSettings((current) => current ? { ...current, wallpaper_adaptive_theme: value } : current);
    applyWallpaperPalette(settings?.wallpaper_palette, value);
    try {
      await api!.put("/api/settings/wallpaper_adaptive_theme", { value });
    } catch (error) {
      setSettings((current) => current ? { ...current, wallpaper_adaptive_theme: previous } : current);
      applyWallpaperPalette(settings?.wallpaper_palette, previous);
      throw error;
    }
  }

  async function changeWallpaperOpacity(value: number) {
    const previous = settings?.wallpaper_opacity == null ? .82 : Number(settings.wallpaper_opacity);
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, wallpaper_opacity: value } : current;
      if (next) applyWallpaper(api!.baseUrl, next.wallpaper_mode, next.wallpaper_revision, value, next.wallpaper_blur);
      return next;
    });
    try {
      await api!.put("/api/settings/wallpaper_opacity", { value });
    } catch (error) {
      setSettings((current) => current ? { ...current, wallpaper_opacity: previous } : current);
      applyWallpaper(api!.baseUrl, settings?.wallpaper_mode, settings?.wallpaper_revision, previous, settings?.wallpaper_blur);
      throw error;
    }
  }

  async function changeWallpaperBlur(value: number) {
    const previous = Number(settings?.wallpaper_blur) || 0;
    setSettings((current) => {
      const next: Record<string, any> | null = current ? { ...current, wallpaper_blur: value } : current;
      if (next) applyWallpaper(api!.baseUrl, next.wallpaper_mode, next.wallpaper_revision, next.wallpaper_opacity, value);
      return next;
    });
    try {
      await api!.put("/api/settings/wallpaper_blur", { value });
    } catch (error) {
      setSettings((current) => current ? { ...current, wallpaper_blur: previous } : current);
      applyWallpaper(api!.baseUrl, settings?.wallpaper_mode, settings?.wallpaper_revision, settings?.wallpaper_opacity, previous);
      throw error;
    }
  }

  async function changeGlassOpacity(value: number) {
    const resolved = normalizeGlassOpacity(value);
    const previous = normalizeGlassOpacity(settings?.glass_opacity);
    setSettings((current) => current ? { ...current, glass_opacity: resolved } : current);
    applyGlassOpacity(resolved);
    try {
      await api!.put("/api/settings/glass_opacity", { value: resolved });
    } catch (error) {
      setSettings((current) => current ? { ...current, glass_opacity: previous } : current);
      applyGlassOpacity(previous);
      throw error;
    }
  }

  async function chooseExportDirectory() {
    const value = await window.studypilot.files.chooseExportDirectory?.() || null;
    if (value) setExportDirectory(value);
    return value;
  }

  async function resetExportDirectory() {
    const value = await window.studypilot.files.resetExportDirectory?.()
      || `${runtime!.dataDir.replace(/[\\/]$/, "")}\\exports`;
    setExportDirectory(value);
    return value;
  }

  async function openExportDirectory() {
    await window.studypilot.files.openExportDirectory?.();
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

  function openKnowledgeSource(
    courseId: number,
    documentId: number,
    locator: Record<string, string | number | boolean | null>,
    blockKey: string,
    details: Pick<DocumentSourceFocus, "locationLabel" | "quote" | "originMode"> = {},
  ) {
    const focus: DocumentSourceFocus = {
      documentId,
      locator,
      blockKey,
      returnRoute: buildRoute(route),
      ...details,
    };

    if (workspaceView === "knowledge" || workspaceView === "learning") {
      if (linkedWorkspace === "library" && linkedDocumentId === documentId) {
        announceDocumentSource({ focus, placement: "primary" });
      } else {
        storeDocumentSourceFocus(focus);
        setLinkedDocumentId(documentId);
        setLinkedWorkspace("library");
      }
      return;
    }

    if (route.level === "course" && route.view === "library" && route.documentId) {
      announceDocumentSource({
        focus,
        placement: route.documentId === documentId ? "primary" : "secondary",
      });
      return;
    }

    storeDocumentSourceFocus(focus);
    if (details.originMode) {
      window.sessionStorage.setItem("studypilot.agent.continuity", JSON.stringify({ open: true, mode: details.originMode }));
    }
    navigate({ level: "course", courseId, view: "library", documentId });
  }

  function openAgentSource(courseId: number, source: AgentSource) {
    if (source.kind === "page") {
      setWorkspaceNotice(`当前页面：${source.title}`);
      return;
    }
    const sourceMode: AgentMode = window.sessionStorage.getItem("studypilot.agent.source-mode") === "learning" ? "learning" : "assistant";
    const notebookId = Number(source.notebook_id || source.locator?.notebook_id || 0);
    if (["knowledge", "knowledge_notebook", "knowledge_edge"].includes(source.kind) && Number.isInteger(notebookId) && notebookId > 0) {
      knowledgeSourceRequestRef.current += 1;
      setKnowledgeSourceFocus({
        notebookId,
        nodeId: source.kind === "knowledge" ? Number(source.node_id || source.id || 0) || undefined : undefined,
        edgeId: source.kind === "knowledge_edge" ? Number(source.edge_id || source.id || 0) || undefined : undefined,
        title: source.title,
        requestId: knowledgeSourceRequestRef.current,
      });
      window.sessionStorage.setItem("studypilot.agent.continuity", JSON.stringify({ open: true, mode: sourceMode }));
      navigate({ level: "course", courseId, view: "knowledge", notebookId });
      return;
    }
    if (!source.document_id) {
      setWorkspaceNotice(`无法定位来源“${source.title}”：这条记录缺少资料或知识节点位置。`);
      return;
    }
    openKnowledgeSource(courseId, source.document_id, source.locator || {}, source.block_key || "", {
      locationLabel: source.location_label,
      quote: source.excerpt,
      originMode: sourceMode,
    });
  }

  async function trashKnowledgeNotebook(notebook: KnowledgeNotebook) {
    if (route.level !== "course") return;
    await api!.delete(`/api/courses/${route.courseId}/notebooks/${notebook.id}`);
    setNotebooks((current) => current.filter((item) => item.id !== notebook.id));
  }

  function cancelDocumentNavigationClose() {
    const timer = documentNavigationCloseTimerRef.current;
    if (timer !== null) window.clearTimeout(timer);
    documentNavigationCloseTimerRef.current = null;
  }

  function setCourseNavigation(open: boolean) {
    cancelDocumentNavigationClose();
    setDocumentNavigationOpen(open);
  }

  function openDocumentNavigation() {
    setCourseNavigation(true);
  }

  function scheduleDocumentNavigationClose() {
    cancelDocumentNavigationClose();
    documentNavigationCloseTimerRef.current = window.setTimeout(() => setDocumentNavigationOpen(false), 180);
  }

  function changeView(next: ViewKey) {
    if (route.level === "course") {
      const rememberedDocument = next === "library" ? lastCourseDocument(route.courseId) : undefined;
      navigate({ level: "course", courseId: route.courseId, view: next, documentId: rememberedDocument });
      setCourseNavigation(false);
      return;
    }
    if (next === "knowledge") setKnowledgeMode("shelf");
    setView(next);
  }

  useEffect(() => {
    if (!api) return;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const dragOver = (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); document.documentElement.dataset.fileDropActive = "true"; } };
    const drop = async (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); delete document.documentElement.dataset.fileDropActive;
      const files = Array.from(event.dataTransfer?.files || []);
      let imported = 0;
      for (const file of files) { const form = new FormData(); form.append("file", file); try { await api.post("/api/documents/import", form, { timeoutMs: 600_000 }); imported += 1; } catch {} }
      setWorkspaceNotice(imported ? `已导入 ${imported} 份资料` : "没有可导入的资料");
    };
    const leave = () => delete document.documentElement.dataset.fileDropActive;
    window.addEventListener("dragover", dragOver);
    window.addEventListener("drop", drop);
    window.addEventListener("dragleave", leave);
    return () => { leave(); window.removeEventListener("dragover", dragOver); window.removeEventListener("drop", drop); window.removeEventListener("dragleave", leave); };
  }, [api]);

  if (fatal) return <div className="fatal-screen"><div className="brand-mark">SP</div><h1>本地服务未就绪</h1><p>{fatal}</p><button onClick={() => location.reload()}>重新连接</button></div>;
  if (!runtime || !api || !settings || !today) return <BootScreen />;

  const activeCourseId = Number(system?.active_course || settings.active_course || 1);
  const activeCourse = courses.find((course) => course.id === activeCourseId);
  const language = normalizeUiLanguage(settings.ui_language);
  if (route.level === "trash") return (
    <div className="desktop-shell desktop-shell--library">
      <TitleBar language={language} />
      <AgentHost
        api={api}
        courseId={activeCourseId}
        context={{ view: "trash", title: activeCourse?.title }}
        workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
        onOpenSource={(source) => openAgentSource(activeCourseId, source)}
      >
        <Trash courses={trashCourses} onRestore={restoreCourse} onPurge={purgeCourse} onBack={() => navigate({ level: "library" })} />
      </AgentHost>
      {workspaceNotice && <div className="workspace-notice" role="status"><span>{workspaceNotice}</span></div>}
    </div>
  );
  if (route.level === "settings") return (
    <div className="desktop-shell desktop-shell--library">
      <TitleBar language={language} />
      <AgentHost
        api={api}
        courseId={activeCourseId}
        context={{ view: "settings", title: activeCourse?.title }}
        workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
        onOpenSource={(source) => openAgentSource(activeCourseId, source)}
      >
        <GlobalSettings
        theme={settings.theme || "system"}
        startupDestination={settings.startup_destination === "last_course" ? "last_course" : "library"}
        uiFont={settings.ui_font || "system"}
        codeFont={settings.code_font || "system"}
        systemFonts={systemFonts}
        fontScale={Number(settings.ui_font_scale) || 1}
        forceUniformFontSize={settings.force_uniform_font_size === true}
        wallpaperMode={normalizeWallpaperMode(settings.wallpaper_mode)}
        wallpaperOpacity={settings.wallpaper_opacity == null ? .82 : Number(settings.wallpaper_opacity)}
        wallpaperBlur={Number(settings.wallpaper_blur) || 0}
        glassOpacity={normalizeGlassOpacity(settings.glass_opacity)}
        wallpaperAdaptiveTheme={settings.wallpaper_adaptive_theme === true}
        wallpaperImageUrl={wallpaperUrl(api.baseUrl, settings.wallpaper_mode, settings.wallpaper_revision)}
        exportDirectory={exportDirectory}
        workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
        language={language}
        onChangeTheme={changeGlobalTheme}
        onChangeStartup={changeStartupDestination}
        onChangeTypography={changeTypography}
        onChangeFontScale={changeFontScale}
        onChangeForceUniformFontSize={changeForceUniformFontSize}
        onChangeWallpaper={changeWallpaperMode}
        onUploadWallpaper={uploadWallpaper}
        onClearWallpaper={clearWallpaper}
        onChangeWallpaperOpacity={changeWallpaperOpacity}
        onChangeWallpaperBlur={changeWallpaperBlur}
        onChangeGlassOpacity={changeGlassOpacity}
        onChangeWallpaperAdaptiveTheme={changeWallpaperAdaptiveTheme}
        onChooseExportDirectory={chooseExportDirectory}
        onResetExportDirectory={resetExportDirectory}
        onOpenExportDirectory={openExportDirectory}
        onChangeWorkspaceToolbarAutoHide={changeWorkspaceToolbarAutoHide}
        onChangeLanguage={changeLanguage}
        onBack={() => navigate({ level: "library" })}
        />
      </AgentHost>
    </div>
  );
  if (route.level === "library") return (
    <div className="desktop-shell desktop-shell--library">
      <TitleBar language={language} />
      <AgentHost api={api} courseId={activeCourseId} context={{ view: "course-library", title: activeCourse?.title }} workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false} onOpenSource={(source) => openAgentSource(activeCourseId, source)}>
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
      </AgentHost>
      <CourseWizard open={courseWizardOpen} onClose={() => setCourseWizardOpen(false)} onCreate={createCourse} />
    </div>
  );
  const routeCourse = route.level === "course"
    ? courses.find((course) => course.id === route.courseId) || activeCourse
    : activeCourse;
  const workspaceView: ViewKey = route.level === "course"
    ? route.view as ViewKey
    : view;
  const activeLinkedNotebookId = linkedNotebookId || notebooks[0]?.id || null;
  const linkedNotebookControls = notebooks.length > 1 ? <select aria-label="选择分屏知识笔记" value={activeLinkedNotebookId || ""} onChange={(event) => setLinkedNotebookId(Number(event.target.value))}>{notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}</select> : undefined;
  const renderLinkedKnowledge = (courseId: number) => activeLinkedNotebookId
    ? <Knowledge
        key={`linked-knowledge-${courseId}-${activeLinkedNotebookId}-${workspaceEpoch}`}
        api={api}
        courseId={courseId}
        notebookId={activeLinkedNotebookId}
        courseTitle={routeCourse?.title}
        systemFonts={systemFonts}
        onOpenSource={(documentId, locator, blockKey) => openKnowledgeSource(courseId, documentId, locator, blockKey)}
      />
    : <div className="linked-workspace-empty"><span>⌘</span><strong>还没有知识笔记</strong><p>先创建一本知识笔记，再从资料旁边联动查看。</p></div>;

  if (route.level === "course" && route.view === "library" && route.documentId) {
    const documentReader = <DocumentWorkspace
      key={`document-${route.documentId}-${workspaceEpoch}`}
      api={api}
      courseId={route.courseId}
      documentId={route.documentId}
      onBack={() => { rememberCourseDocument(route.courseId, null); navigate({ level: "course", courseId: route.courseId, view: "library" }); }}
      onAgentContextChange={setDocumentAgentContext}
      courseNavigationOpen={documentNavigationOpen}
      onCourseNavigationChange={setCourseNavigation}
      knowledgeSplitOpen={linkedWorkspace === "knowledge"}
      onKnowledgeSplitChange={(open) => setLinkedWorkspace(open ? "knowledge" : null)}
    />;
    const documentWorkspace = linkedWorkspace === "knowledge"
      ? <StudySplitWorkspace
          primary={documentReader}
          companion={renderLinkedKnowledge(route.courseId)}
          companionKind="knowledge"
          companionTitle="知识图谱"
          companionControls={linkedNotebookControls}
          onClose={() => setLinkedWorkspace(null)}
        />
      : documentReader;
    return <div className="desktop-shell desktop-shell--document" onMouseMove={(event) => { const target = event.target as Element; if (target.closest(".document-navigation-flyout, .document-navigation-hotspot")) cancelDocumentNavigationClose(); else if (documentNavigationOpen) scheduleDocumentNavigationClose(); }}>
        <TitleBar language={language} />
        <div
          className="document-navigation-hotspot"
          aria-hidden="true"
          onMouseEnter={openDocumentNavigation}
          onMouseLeave={scheduleDocumentNavigationClose}
        />
        <div
          className="document-navigation-flyout"
          data-open={String(documentNavigationOpen)}
          onMouseEnter={openDocumentNavigation}
          onMouseLeave={scheduleDocumentNavigationClose}
        >
          <NavRail
            active="library"
            onChange={changeView}
            collapsed={false}
            onToggle={() => setCourseNavigation(false)}
            courseTitle={routeCourse?.title}
            onBackToLibrary={() => navigate({ level: "library" })}
            language={language}
          />
        </div>
        <AgentHost
          key={`agent-document-${route.documentId}`}
          api={api}
          courseId={route.courseId}
          context={{
            view: "document",
            documentId: route.documentId,
            documentIds: documentAgentContext.documentIds,
            blockKey: documentAgentContext.blockKey,
            selectedText: documentAgentContext.selectedText,
            locator: documentAgentContext.locator,
            notebookId: linkedWorkspace === "knowledge" ? activeLinkedNotebookId || undefined : undefined,
          }}
          workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
          onOpenSource={(source) => openAgentSource(route.courseId, source)}
        >{documentWorkspace}</AgentHost>
        {workspaceNotice && <div className="workspace-notice" role="status"><span>{workspaceNotice}</span><button aria-label="关闭工作区提示" onClick={() => setWorkspaceNotice("")}>×</button></div>}
      </div>;
  }
  if (route.level === "course" && routeCourse?.course_type === "language") {
    const supportedViews: LanguageCourseView[] = [
      "home", "journey", "lesson", "practice",
      "vocabulary", "library", "stats", "settings",
    ];
    const languageView: LanguageCourseView = supportedViews.includes(route.view as LanguageCourseView)
      ? route.view as LanguageCourseView
      : "home";
    const goToLanguageView = (next: LanguageCourseView) => {
      navigate({ level: "course", courseId: route.courseId, view: next });
    };
    const startLesson = () => goToLanguageView("lesson");
    const languagePage = (() => {
      if (languageView === "home") {
        return <LanguageHome
            api={api}
            courseId={route.courseId}
            courseTitle={routeCourse.title}
            onStartLesson={startLesson}
            onOpenJourney={() => goToLanguageView("journey")}
            onStartPractice={(type) => {
              setLanguagePracticeType(type);
              goToLanguageView("practice");
            }}
            onOpenVocabulary={() => goToLanguageView("vocabulary")}
            onOpenLibrary={() => goToLanguageView("library")}
          />;
      }
      if (languageView === "journey") {
        return <LanguageJourney
          api={api}
          courseId={route.courseId}
          onStart={startLesson}
        />;
      }
      if (languageView === "lesson") {
        return <GuidedLanguageLesson
          api={api}
          courseId={route.courseId}
          targetLanguageTag={routeCourse.target_language_tag || "en-US"}
          onOpenJourney={() => goToLanguageView("journey")}
        />;
      }
      if (languageView === "practice") {
        return <LanguagePractice
            key={`language-practice-${route.courseId}-${languagePracticeType}`}
            api={api}
            course={routeCourse}
            initialType={languagePracticeType}
            onContinueLesson={startLesson}
          />;
      }
      if (languageView === "vocabulary") {
        return <VocabularyLibrary
          api={api}
          course={routeCourse}
          onOpenSource={(item) => {
            if (!item.document_id) return;
            openKnowledgeSource(
              route.courseId,
              item.document_id,
              item.locator || {},
              item.block_key || "",
              { quote: item.term, locationLabel: item.source_id || undefined },
            );
          }}
        />;
      }
      if (languageView === "library") {
        return <LanguageMaterials api={api} courseId={route.courseId} onStart={startLesson}>
          <Library
                key={`language-library-${workspaceEpoch}`}
                api={api}
                onOpen={(document) => navigate({
                  level: "course",
                  courseId: route.courseId,
                  view: "library",
                  documentId: document.id,
                })}
          />
        </LanguageMaterials>;
      }
      if (languageView === "stats") {
        return <LanguageStats
          api={api}
          courseId={route.courseId}
          courseTitle={routeCourse.title}
        />;
      }
      return <LanguageSettings
        api={api}
        course={routeCourse}
        onSaved={(updated) => setCourses((current) => current.map(
          (item) => item.id === updated.id ? { ...item, ...updated } : item,
        ))}
      />;
    })();
    return (
      <div className="desktop-shell desktop-shell--language">
        <TitleBar language={language} />
        <AgentHost
          api={api}
          courseId={route.courseId}
          context={{
            view: `language-${languageView}`,
            title: routeCourse.title,
            languageTag: routeCourse.target_language_tag,
            proficiencyLevel: routeCourse.proficiency_level,
          }}
          workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
          onOpenSource={(source) => openAgentSource(route.courseId, source)}
        >
          <LanguageCourseShell course={routeCourse} activeView={languageView} onNavigate={goToLanguageView} onBackToLibrary={() => navigate({ level: "library" })}>
            {languagePage}
          </LanguageCourseShell>
        </AgentHost>
        {workspaceNotice && <div className="workspace-notice" role="status"><span>{workspaceNotice}</span><button aria-label="关闭工作区提示" onClick={() => setWorkspaceNotice("")}>×</button></div>}
      </div>
    );
  }
  const modulePage = {
    home: null,
    learning: <LearningCenter
      key={`learning-${route.level === "course" ? route.courseId : activeCourseId}-${workspaceEpoch}`}
      api={api}
      courseId={route.level === "course" ? route.courseId : activeCourseId}
      courseTitle={routeCourse?.title || activeCourse?.title}
      agentContext={{
        documentId: linkedDocumentContext.documentIds[0],
        documentIds: linkedDocumentContext.documentIds,
        blockKey: linkedDocumentContext.blockKey,
        selectedText: linkedDocumentContext.selectedText,
        locator: linkedDocumentContext.locator,
      }}
      onOpenSource={(source) => openAgentSource(route.level === "course" ? route.courseId : activeCourseId, source)}
    />,
    roadmap: <CourseRoadmap
      key={`roadmap-${workspaceEpoch}`}
      api={api}
      courseId={route.level === "course" ? route.courseId : activeCourseId}
      courseTitle={routeCourse?.title || activeCourse?.title || "当前课程"}
    />,
    knowledge: route.level === "course"
      ? route.notebookId
        ? <Knowledge
            key={`knowledge-${route.courseId}-${route.notebookId}-${workspaceEpoch}`}
            api={api}
            courseId={route.courseId}
            notebookId={route.notebookId}
            courseTitle={routeCourse?.title}
            systemFonts={systemFonts}
            librarySplitOpen={linkedWorkspace === "library"}
            onBack={() => navigate({ level: "course", courseId: route.courseId, view: "knowledge" })}
            onOpenSource={(documentId, locator, blockKey) => openKnowledgeSource(route.courseId, documentId, locator, blockKey)}
            onOpenLibrarySplit={() => { setLinkedWorkspace((current) => current === "library" ? null : "library"); setLinkedDocumentId(null); }}
            sourceFocus={knowledgeSourceFocus?.notebookId === route.notebookId ? knowledgeSourceFocus : undefined}
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
        : <Knowledge key={`knowledge-${workspaceEpoch}`} api={api} courseId={activeCourseId} courseTitle={activeCourse?.title} systemFonts={systemFonts} librarySplitOpen={linkedWorkspace === "library"} onBack={() => setKnowledgeMode("shelf")} onOpenSource={(documentId, locator, blockKey) => openKnowledgeSource(activeCourseId, documentId, locator, blockKey)} onOpenLibrarySplit={() => { setLinkedWorkspace((current) => current === "library" ? null : "library"); setLinkedDocumentId(null); }} />,
    library: <Library key={`library-${workspaceEpoch}`} api={api} courseId={route.level === "course" ? route.courseId : activeCourseId} onOpenKnowledgeSplit={() => setLinkedWorkspace((current) => current === "knowledge" ? null : "knowledge")} onOpen={(document) => {
          if (route.level === "course") navigate({ level: "course", courseId: route.courseId, view: "library", documentId: document.id });
        }} />,
    lab: <Lab key={`lab-${workspaceEpoch}`} api={api} courseId={Number(system?.active_course || settings.active_course || 1)} />,
    studio: <Studio key={`studio-${workspaceEpoch}`} api={api} />,
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
      systemFonts={systemFonts}
      initialFontScale={Number(settings.ui_font_scale) || 1}
      initialForceUniformFontSize={settings.force_uniform_font_size === true}
      initialWallpaperMode={normalizeWallpaperMode(settings.wallpaper_mode)}
      initialWallpaperOpacity={settings.wallpaper_opacity == null ? .82 : Number(settings.wallpaper_opacity)}
      initialWallpaperBlur={Number(settings.wallpaper_blur) || 0}
      initialGlassOpacity={normalizeGlassOpacity(settings.glass_opacity)}
      initialWallpaperAdaptiveTheme={settings.wallpaper_adaptive_theme === true}
      initialLanguage={language}
      initialWorkspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
      wallpaperImageUrl={wallpaperUrl(api.baseUrl, settings.wallpaper_mode, settings.wallpaper_revision)}
      exportDirectory={exportDirectory}
      onTheme={changeTheme}
      onTypography={changeTypography}
      onFontScale={changeFontScale}
      onForceUniformFontSize={changeForceUniformFontSize}
      onWallpaperMode={changeWallpaperMode}
      onWallpaperUpload={uploadWallpaper}
      onWallpaperClear={clearWallpaper}
      onWallpaperOpacity={changeWallpaperOpacity}
      onWallpaperBlur={changeWallpaperBlur}
      onGlassOpacity={changeGlassOpacity}
      onWallpaperAdaptiveTheme={changeWallpaperAdaptiveTheme}
      onLanguage={changeLanguage}
      onWorkspaceToolbarAutoHide={changeWorkspaceToolbarAutoHide}
      onChooseExportDirectory={chooseExportDirectory}
      onResetExportDirectory={resetExportDirectory}
      onOpenExportDirectory={openExportDirectory}
    />,
  }[workspaceView];
  const courseHomeCourse: Course = routeCourse || {
    id: route.level === "course" ? route.courseId : activeCourseId,
    title: today.phase.title || "课程主页",
    description: "",
  };
  const fallbackHomeSummary: CourseHomeSummary = {
    task_counts: {
      todo: today.tasks.filter((task) => task.status === "todo").length,
      doing: today.tasks.filter((task) => task.status === "doing").length,
      blocked: today.tasks.filter((task) => task.status === "blocked").length,
      done: today.tasks.filter((task) => task.status === "done").length,
    },
    notebook_count: notebooks.length,
    document_count: 0,
    run_count: 0,
    recent_items: [],
  };
  const page = route.level === "course" && route.view === "home"
    ? <CourseHome
          course={courseHomeCourse}
          summary={homeSummary || fallbackHomeSummary}
          onOpenModule={(next) => navigate({ level: "course", courseId: route.courseId, view: next })}
          onContinue={() => document.getElementById("course-daily-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          dailyWorkspace={<Dashboard key={`home-dashboard-${workspaceEpoch}`} api={api} today={today} onRefresh={refreshToday} embedded />}
        />
    : modulePage;
  const linkedLibrary = linkedDocumentId
    ? <DocumentWorkspace
        key={`linked-document-${linkedDocumentId}`}
        api={api}
        courseId={route.level === "course" ? route.courseId : activeCourseId}
        documentId={linkedDocumentId}
        onBack={() => { setLinkedDocumentId(null); setLinkedDocumentContext({ documentIds: [], blockKey: "", selectedText: "", locator: {} }); }}
        onAgentContextChange={setLinkedDocumentContext}
      />
    : <Library api={api} courseId={route.level === "course" ? route.courseId : activeCourseId} compact onOpen={(document) => setLinkedDocumentId(document.id)} />;
  const presentedPage = linkedWorkspace === "library" && (workspaceView === "knowledge" || workspaceView === "learning")
    ? <StudySplitWorkspace
        primary={page}
        companion={linkedLibrary}
        companionKind="library"
        companionTitle={linkedDocumentId ? "资料阅读" : "资料库"}
        primaryTitle={workspaceView === "learning" ? "学习中心" : undefined}
        onClose={() => { setLinkedWorkspace(null); setLinkedDocumentId(null); setLinkedDocumentContext({ documentIds: [], blockKey: "", selectedText: "", locator: {} }); }}
      />
    : linkedWorkspace === "knowledge" && workspaceView === "library"
      ? <StudySplitWorkspace
          primary={page}
          companion={renderLinkedKnowledge(route.level === "course" ? route.courseId : activeCourseId)}
          companionKind="knowledge"
          companionTitle="知识图谱"
          companionControls={linkedNotebookControls}
          onClose={() => setLinkedWorkspace(null)}
        />
      : page;

  return (
    <div className="desktop-shell">
      <TitleBar
        language={language}
        navigationCollapsed={collapsed}
        onExpandNavigation={() => setCollapsed(false)}
      />
      <AgentHost
        api={api}
        courseId={route.level === "course" ? route.courseId : activeCourseId}
        context={{
          view: workspaceView,
          documentId: linkedDocumentContext.documentIds[0],
          documentIds: linkedDocumentContext.documentIds,
          blockKey: linkedDocumentContext.blockKey,
          selectedText: linkedDocumentContext.selectedText,
          locator: linkedDocumentContext.locator,
          notebookId: linkedWorkspace === "knowledge" ? activeLinkedNotebookId || undefined : route.level === "course" ? route.notebookId : undefined,
          title: routeCourse?.title,
        }}
        workspaceToolbarAutoHide={settings.workspace_toolbar_auto_hide !== false}
        onOpenSource={(source) => openAgentSource(route.level === "course" ? route.courseId : activeCourseId, source)}
      >
        <div className="desktop-body">
          <NavRail
            active={workspaceView}
            onChange={changeView}
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
            courseTitle={routeCourse?.title}
            onBackToLibrary={() => navigate({ level: "library" })}
            language={language}
          />
          <main className="main-stage">
            <div className="context-strip"><CourseSwitcher courses={courses} activeCourseId={Number(system?.active_course || settings.active_course || 1)} fallbackTitle={today.phase.title} onActivate={openNotebook} onCreate={createCourse} /><i /><span>{language === "en-US" ? `Week ${today.week.week}` : `第 ${today.week.week} 周`}</span><small>{system?.status === "ready" ? (language === "en-US" ? "Local service ready" : "本地服务正常") : (language === "en-US" ? "Check local service" : "本地服务待检查")}</small></div>
            <div className="page-scroll" key={route.level === "course" ? `${route.courseId}-${route.view}-${route.notebookId || ""}-${route.documentId || ""}` : workspaceView}>{presentedPage}</div>
          </main>
        </div>
      </AgentHost>
      {workspaceNotice && <div className="workspace-notice" role="status"><span>{workspaceNotice}</span><button aria-label="关闭工作区提示" onClick={() => setWorkspaceNotice("")}>×</button></div>}
    </div>
  );
}
