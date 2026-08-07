type WorkspaceView = "chat" | "history" | "settings";

export function LearningWorkspaceHeader({
  title,
  lessonIndex,
  selectedDocumentCount,
  documentPickerOpen,
  progressOpen,
  view,
  onToggleDocuments,
  onToggleProgress,
  onNewSession,
  onOpenSettings,
  onContinueInDock,
}: {
  title: string;
  lessonIndex?: number;
  selectedDocumentCount: number;
  documentPickerOpen: boolean;
  progressOpen: boolean;
  view: WorkspaceView;
  onToggleDocuments: () => void;
  onToggleProgress: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onContinueInDock: () => void;
}) {
  return (
    <header className="learning-workbench__topbar">
      <div className="learning-workbench__session">
        <i aria-hidden="true" />
        <strong>{title}</strong>
        {Boolean(lessonIndex) && <span>知识点 {lessonIndex}</span>}
        <small className="learning-workbench__saved"><i aria-hidden="true" />本地自动保存</small>
      </div>
      <div className="learning-workbench__actions">
        <button
          aria-expanded={documentPickerOpen}
          aria-label="选择学习资料"
          onClick={onToggleDocuments}
        >
          {selectedDocumentCount ? `资料 · ${selectedDocumentCount}` : "学习资料"}
        </button>
        <button
          aria-expanded={progressOpen}
          aria-label="查看学习进度"
          className={progressOpen ? "is-active" : ""}
          onClick={onToggleProgress}
        >
          学习进度
        </button>
        <button aria-label="新对话" onClick={onNewSession}>＋ 新对话</button>
        <button
          aria-label="学习模型设置"
          className={view === "settings" ? "is-active" : ""}
          onClick={onOpenSettings}
        >
          模型
        </button>
        <button aria-label="在右侧助手继续" onClick={onContinueInDock}>
          右侧继续 ↗
        </button>
      </div>
    </header>
  );
}
