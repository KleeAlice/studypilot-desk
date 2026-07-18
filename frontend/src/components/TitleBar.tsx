export function TitleBar() {
  return (
    <header className="titlebar">
      <div className="titlebar__drag">
        <span className="brand-mark">SP</span>
        <span className="titlebar__name">StudyPilot Desk</span>
        <span className="titlebar__edition">半年算法转向学习操作系统</span>
      </div>
      <div className="window-actions">
        <button aria-label="最小化窗口" onClick={() => window.studypilot.window.minimize()}>—</button>
        <button aria-label="最大化或还原窗口" onClick={() => window.studypilot.window.toggleMaximize()}>□</button>
        <button className="window-close" aria-label="关闭窗口" onClick={() => window.studypilot.window.close()}>×</button>
      </div>
    </header>
  );
}

