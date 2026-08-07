import { useState } from "react";
import type { ApiClient } from "../services/api";
import type { TodayData } from "../types";

export function Dashboard({ api, today, onRefresh, embedded = false }: { api: ApiClient; today: TodayData; onRefresh: () => Promise<void>; embedded?: boolean }) {
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const tasks = today.tasks ?? [];
  const done = tasks.filter((task) => task.status === "done").length;

  async function addTask(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!title.trim()) return;
    try {
      await api.post("/api/tasks", { title, week: today.week.week, kind: "learning", priority: 1 });
      setTitle(""); setNotice("任务已写入本地数据库"); await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "任务保存失败"); }
  }

  async function captureClipboard() {
    setError(""); setNotice("");
    try {
      const content = await window.studypilot.clipboard.readText();
      if (!content.trim()) return setError("剪贴板中没有可收集的文字");
      await api.post("/api/captures", { title: content.slice(0, 48), payload: { content, category: "inbox" } });
      setNotice("剪贴板内容已保存到收集箱");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "收集失败"); }
  }

  return (
    <section className={`${embedded ? "dashboard-page dashboard-page--embedded" : "page dashboard-page"}`}>
      <div className={embedded ? "dashboard-embedded-heading" : "page-heading"}>
        <div><div className="eyebrow">第 {today.week.week} 周</div><h2>本周执行</h2></div>
        <button className="quiet-action" onClick={captureClipboard}>从剪贴板收集</button>
      </div>
      <div className="dashboard-grid">
        <article className="focus-panel">
          <h2>本周基础输入</h2>
          <p className="focus-copy">{today.week.foundation || "尚未设置本周基础任务"}</p>
          <div className="progress-line"><span style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
          <div className="metric-row"><strong>{done}/{tasks.length}</strong><span>任务完成</span><strong>{today.week.week}/24</strong><span>路线位置</span></div>
        </article>
        <article className="gate-panel">
          <div className="gate-badge">阶段</div><div><h2>阶段闸门</h2><p>{today.phase.acceptance || "按真实证据验收"}</p></div>
        </article>
        <article className="work-panel">
          <h2>执行队列</h2>
          {tasks.length ? <ul className="task-list">{tasks.map((task) => <li key={task.id}><span className={`task-state task-state--${task.status}`} /> <span>{task.title}</span><small>{task.status}</small></li>)}</ul> : <div className="empty-state">还没有用户任务。路线任务在右侧，先写入今天真正要做的一件事。</div>}
          <form className="inline-form" onSubmit={addTask}><input aria-label="新任务" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下可验收的下一步" /><button>添加任务</button></form>
          {notice && <p className="success-message" role="status">{notice}</p>}{error && <p className="error-message" role="alert">{error}</p>}
        </article>
        <article className="evidence-panel">
          <h2>本周交付</h2>
          <ol>{(today.week.deliverables ?? []).map((item, index) => <li key={`${index}-${item}`}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol>
          <h3>项目 / 研究轨</h3><ul>{(today.week.tasks ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </div>
    </section>
  );
}
