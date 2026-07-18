export type NavigationMotion = "forward" | "back" | "lateral" | "replace";

export type MotionRoute =
  | { level: "library" | "trash" | "settings" }
  | { level: "course"; courseId: number; view: string; notebookId?: number };

function routeDepth(route: MotionRoute): number {
  if (route.level !== "course") return route.level === "library" ? 0 : 1;
  if (route.notebookId) return 3;
  return route.view === "home" ? 1 : 2;
}

export function buildNavigationMotion(from: MotionRoute, to: MotionRoute): NavigationMotion {
  if (from.level === "course" && to.level === "course" && from.courseId !== to.courseId) return "replace";
  const delta = routeDepth(to) - routeDepth(from);
  if (delta > 0) return "forward";
  if (delta < 0) return "back";
  return from.level === "course" && to.level === "course" ? "lateral" : "replace";
}

export function commitSpatialTransition(update: () => void, intent: NavigationMotion): void {
  document.documentElement.dataset.motionIntent = intent;
  delete document.documentElement.dataset.motionState;
  update();
}

export function waitForMotionFeedback(duration = 220): Promise<void> {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return Promise.resolve();
  }
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}
