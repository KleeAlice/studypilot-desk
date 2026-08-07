import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

type WorkspaceToolbarProps = {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocusCapture: () => void;
  onBlurCapture: (event: FocusEvent<HTMLElement>) => void;
};

type WorkspaceToolbarVisibility = {
  autoHide: boolean;
  visible: boolean;
  toolbarProps: WorkspaceToolbarProps;
};

const alwaysVisible: WorkspaceToolbarVisibility = {
  autoHide: false,
  visible: true,
  toolbarProps: {
    onPointerEnter: () => undefined,
    onPointerLeave: () => undefined,
    onFocusCapture: () => undefined,
    onBlurCapture: () => undefined,
  },
};

const WorkspaceToolbarVisibilityContext = createContext<WorkspaceToolbarVisibility>(alwaysVisible);

const INITIAL_VISIBLE_MS = 1200;
const LEAVE_HIDE_MS = 650;
const TOP_REVEAL_HIDE_MS = 1600;
const TOOLBAR_REVEAL_EDGE_PX = 160;

export function WorkspaceToolbarVisibilityProvider({ autoHide, children }: {
  autoHide: boolean;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback((delay = LEAVE_HIDE_MS) => {
    clearHideTimer();
    if (!autoHide) {
      setVisible(true);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setVisible(false);
    }, delay);
  }, [autoHide, clearHideTimer]);

  const show = useCallback(() => {
    clearHideTimer();
    setVisible(true);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!autoHide) {
      clearHideTimer();
      setVisible(true);
      return;
    }
    setVisible(true);
    scheduleHide(INITIAL_VISIBLE_MS);
    return clearHideTimer;
  }, [autoHide, clearHideTimer, scheduleHide]);

  useEffect(() => {
    if (!autoHide) return;
    const revealAtTop = (event: PointerEvent) => {
      if (event.clientY <= TOOLBAR_REVEAL_EDGE_PX) {
        show();
        scheduleHide(TOP_REVEAL_HIDE_MS);
      }
    };
    window.addEventListener("pointermove", revealAtTop);
    return () => window.removeEventListener("pointermove", revealAtTop);
  }, [autoHide, scheduleHide, show]);

  const toolbarProps = useMemo<WorkspaceToolbarProps>(() => ({
    onPointerEnter: show,
    onPointerLeave: () => scheduleHide(),
    onFocusCapture: show,
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleHide();
    },
  }), [scheduleHide, show]);

  const value = useMemo<WorkspaceToolbarVisibility>(() => ({
    autoHide,
    visible: !autoHide || visible,
    toolbarProps,
  }), [autoHide, toolbarProps, visible]);

  return (
    <WorkspaceToolbarVisibilityContext.Provider value={value}>
      {children}
    </WorkspaceToolbarVisibilityContext.Provider>
  );
}

export function useWorkspaceToolbarVisibility() {
  return useContext(WorkspaceToolbarVisibilityContext);
}
