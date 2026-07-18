import { useState } from "react";
import type { ApiClient } from "../services/api";

export function Onboarding({ api, onComplete }: { api: ApiClient; onComplete: () => void }) {
  const [role, setRole] = useState("");
  const [hours, setHours] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!role.trim()) return setError("请填写目标岗位");
    setBusy(true); setError("");
    try {
      await api.put("/api/settings/learner_profile", { value: { target_role: role, weekly_hours: hours } });
      await api.put("/api/settings/onboarding_complete", { value: true });
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally { setBusy(false); }
  }

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding" aria-modal="true" role="dialog">
        <div className="eyebrow">FIRST RUN / 01</div>
        <h1>建立学习画像</h1>
        <p>路线不会替你编造起点。先记录目标与每周预算，第一周再用真实证据校准。</p>
        <form onSubmit={submit}>
          <label>目标岗位<input aria-label="目标岗位" value={role} onChange={(event) => setRole(event.target.value)} placeholder="例如：大模型应用算法工程师" autoFocus /></label>
          <label>每周投入<strong>{hours} 小时</strong><input aria-label="每周投入" type="range" min="5" max="40" step="5" value={hours} onChange={(event) => setHours(Number(event.target.value))} /></label>
          {error && <p role="alert" className="error-message">{error}</p>}
          <button className="primary-action" disabled={busy}>{busy ? "正在生成…" : "生成第一周计划"}</button>
        </form>
      </section>
    </div>
  );
}

