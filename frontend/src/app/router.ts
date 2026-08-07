import { buildNavigationMotion, commitSpatialTransition } from "../ui/motion";

export type CourseView = "home" | "learning" | "journey" | "lesson" | "practice" | "vocabulary" | "roadmap" | "knowledge" | "library" | "lab" | "studio" | "stats" | "settings";

export type AppRoute =
  | { level: "library" }
  | { level: "trash" }
  | { level: "settings" }
  | { level: "course"; courseId: number; view: CourseView; notebookId?: number; documentId?: number };

const courseViews = new Set<CourseView>([
  "home", "learning", "journey", "lesson", "practice", "vocabulary", "roadmap", "knowledge", "library", "lab", "studio", "stats", "settings",
]);

export function parseRoute(pathname: string): AppRoute {
  const hashRouteIndex = pathname.indexOf("#/");
  const routeValue = (hashRouteIndex >= 0 ? pathname.slice(hashRouteIndex + 1) : pathname).replace(/^#/, "");
  let parts = routeValue.split("/").filter(Boolean);
  const routeRoot = parts.findIndex((part) => part === "courses" || part === "trash" || part === "settings");
  if (routeRoot > 0) parts = parts.slice(routeRoot);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "courses")) return { level: "library" };
  if (parts.length === 1 && parts[0] === "trash") return { level: "trash" };
  if (parts.length === 1 && parts[0] === "settings") return { level: "settings" };
  if (parts[0] !== "courses") return { level: "library" };
  const courseId = Number(parts[1]);
  const requestedView = parts[2] || "home";
  const view = (requestedView === "dashboard" || requestedView === "review" ? "home" : requestedView) as CourseView;
  if (!Number.isInteger(courseId) || courseId <= 0 || !courseViews.has(view)) return { level: "library" };
  const notebookId = view === "knowledge" && parts[3] ? Number(parts[3]) : undefined;
  const documentId = view === "library" && parts[3] === "documents" && parts[4] ? Number(parts[4]) : undefined;
  if (Number.isInteger(documentId) && Number(documentId) > 0) {
    return { level: "course", courseId, view, documentId };
  }
  return Number.isInteger(notebookId) && Number(notebookId) > 0
    ? { level: "course", courseId, view, notebookId }
    : { level: "course", courseId, view };
}

export function buildRoute(route: AppRoute): string {
  if (route.level === "library") return "/courses";
  if (route.level === "trash") return "/trash";
  if (route.level === "settings") return "/settings";
  const suffix = route.documentId
    ? `/documents/${route.documentId}`
    : route.notebookId ? `/${route.notebookId}` : "";
  return `/courses/${route.courseId}/${route.view}${suffix}`;
}

export function buildNavigationTarget(route: AppRoute, protocol = window.location.protocol): string {
  const path = buildRoute(route);
  return protocol === "file:" ? `#${path}` : path;
}

export function currentRoute(): AppRoute {
  return parseRoute(window.location.hash.startsWith("#/") ? window.location.hash : window.location.pathname);
}

export function hasExplicitRoute(): boolean {
  return window.location.protocol === "file:"
    ? window.location.hash.startsWith("#/")
    : window.location.pathname !== "/";
}

export function navigate(route: AppRoute, replace = false): void {
  const intent = buildNavigationMotion(currentRoute(), route);
  commitSpatialTransition(() => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", buildNavigationTarget(route));
    window.dispatchEvent(new PopStateEvent("popstate", { state: { studypilotMotionManaged: true } }));
  }, intent);
}
