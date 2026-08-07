import { useEffect, useMemo, useRef, useState } from "react";
import { ProviderBrandIcon } from "../agent/ProviderBrandIcon";
import type { AgentProvider, AgentThread } from "../agent/types";
import { providerIconName } from "../agent/providerPresentation";
import {
  PROVIDER_SELECTION_EVENT, providerSelectionFromEvent, readProviderSelection, selectProviderGlobally,
} from "../agent/providerSelection";
import { MotionPresence } from "../components/MotionPresence";
import type { ApiClient } from "../services/api";
import type {
  RoadmapGenerationRequest,
  RoadmapGenerationResult,
} from "../types";

type DocumentOption = {
  id: number;
  title: string;
  filename: string;
  status?: string;
  course_id?: number;
};

const WEEK_PRESETS = [4, 8, 12, 24];
const PROGRESS_LABELS = [
  "正在收集课程历史与资料",
  "正在生成结构化学习路线",
  "正在校验阶段、周次与任务字段",
  "正在保存并同步到学习路线",
];

function providerReady(provider: AgentProvider) {
  if (!provider.enabled) return false;
  if (provider.has_api_key) return true;
  try {
    const host = new URL(provider.base_url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export function RoadmapGeneratorDialog({
  api,
  courseId,
  courseTitle,
  open,
  onClose,
  onGenerated,
}: {
  api: ApiClient;
  courseId: number;
  courseTitle: string;
  open: boolean;
  onClose: () => void;
  onGenerated: (result: RoadmapGenerationResult) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [providers, setProviders] = useState<AgentProvider[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [providerId, setProviderId] = useState("");
  const [targetWeeks, setTargetWeeks] = useState(12);
  const [customDuration, setCustomDuration] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [startDate, setStartDate] = useState("");
  const [planningGoal, setPlanningGoal] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [result, setResult] = useState<RoadmapGenerationResult | null>(null);
  const [error, setError] = useState("");
  const runRef = useRef(0);

  const readyProviders = useMemo(
    () => providers.filter(providerReady),
    [providers],
  );
  const historyMessageCount = useMemo(
    () => threads.reduce((total, thread) => total + Number(thread.message_count || 0), 0),
    [threads],
  );

  useEffect(() => {
    if (!open) return;
    const run = ++runRef.current;
    setStep(1);
    setError("");
    setResult(null);
    setLoading(true);
    setCustomDuration(false);
    setTargetWeeks(12);
    setPlanningGoal("");
    setSelectedDocumentIds([]);
    Promise.all([
      api.get<AgentProvider[]>("/api/agent/providers"),
      api.get<DocumentOption[]>(`/api/courses/${courseId}/documents`),
      api.get<AgentThread[]>(`/api/agent/threads?course_id=${courseId}`),
    ]).then(([nextProviders, nextDocuments, nextThreads]) => {
      if (run !== runRef.current) return;
      setProviders(nextProviders);
      setDocuments(nextDocuments.filter((item) => item.course_id == null || item.course_id === courseId));
      setThreads(nextThreads);
      setProviderId((current) => {
        const globallySelected = readProviderSelection();
        if (nextProviders.some((item) => item.id === globallySelected && providerReady(item))) return globallySelected;
        if (nextProviders.some((item) => item.id === current && providerReady(item))) return current;
        return nextProviders.find(providerReady)?.id || "";
      });
    }).catch((reason) => {
      if (run === runRef.current) {
        setError(reason instanceof Error ? reason.message : "无法读取模型与课程资料");
      }
    }).finally(() => {
      if (run === runRef.current) setLoading(false);
    });
    return () => { runRef.current += 1; };
  }, [api, courseId, open]);

  useEffect(() => {
    if (!open) return;
    function syncProvider(event: Event) {
      const selected = providerSelectionFromEvent(event);
      if (providers.some((item) => item.id === selected && providerReady(item))) setProviderId(selected);
    }
    window.addEventListener(PROVIDER_SELECTION_EVENT, syncProvider);
    return () => window.removeEventListener(PROVIDER_SELECTION_EVENT, syncProvider);
  }, [open, providers]);

  function chooseProvider(provider: AgentProvider) {
    setProviderId(provider.id);
    selectProviderGlobally(provider.id);
  }

  function toggleDocument(documentId: number) {
    setSelectedDocumentIds((current) => current.includes(documentId)
      ? current.filter((item) => item !== documentId)
      : [...current, documentId]);
  }

  async function generate() {
    if (!providerId || generating) return;
    setGenerating(true);
    setError("");
    setResult(null);
    setProgressIndex(0);
    const timers = [1, 2, 3].map((value, index) => window.setTimeout(
      () => setProgressIndex(value),
      650 + index * 850,
    ));
    const payload: RoadmapGenerationRequest = {
      provider_id: providerId,
      start_date: startDate || null,
      target_weeks: Math.max(1, Math.min(52, Number(targetWeeks) || 12)),
      weekly_hours: Math.max(0.5, Math.min(168, Number(weeklyHours) || 6)),
      document_ids: selectedDocumentIds,
      planning_goal: planningGoal.trim(),
    };
    try {
      const generated = await api.post<RoadmapGenerationResult>(
        `/api/courses/${courseId}/roadmap/generate`,
        payload,
        { timeoutMs: 360_000 },
      );
      setProgressIndex(3);
      setResult(generated);
      onGenerated(generated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学习路线生成失败，请重试");
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      setGenerating(false);
    }
  }

  return (
    <MotionPresence present={open} exitMs={180}>
      {(presence) => (
        <div
          className="roadmap-generator-backdrop"
          data-presence={presence}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !generating) onClose();
          }}
        >
          <section className="roadmap-generator" role="dialog" aria-modal="true" aria-labelledby="roadmap-generator-title">
            <header>
              <div>
                <small>AI COURSE PLANNER · {step} / 3</small>
                <h2 id="roadmap-generator-title">为“{courseTitle}”生成学习计划</h2>
                <p>结合本课程历史对话、你选定的资料和可投入时间生成。</p>
              </div>
              <button aria-label="关闭学习计划生成器" disabled={generating} onClick={onClose}>×</button>
            </header>
            <div className="roadmap-generator__steps" aria-label="生成步骤">
              {["选择模型", "安排时间", "选择资料"].map((label, index) => (
                <span key={label} className={step >= index + 1 ? "is-active" : ""}>
                  <i>{index + 1}</i>{label}
                </span>
              ))}
            </div>

            <div className="roadmap-generator__body">
              {loading && <div className="roadmap-generator__loading" role="status"><i />正在读取课程上下文…</div>}
              {!loading && step === 1 && (
                <div className="roadmap-generator__providers">
                  {!readyProviders.length && (
                    <div className="roadmap-generator__empty">
                      <strong>还没有可用模型</strong>
                      <p>请先在 PILOT 的模型设置中填写 API 密钥，或启动本地模型服务。</p>
                    </div>
                  )}
                  {providers.map((provider) => {
                    const ready = providerReady(provider);
                    return (
                      <button
                        type="button"
                        key={provider.id}
                        disabled={!ready}
                        className={providerId === provider.id ? "is-selected" : ""}
                        aria-pressed={providerId === provider.id}
                        onClick={() => chooseProvider(provider)}
                      >
                        <span><ProviderBrandIcon name={providerIconName(provider)} /></span>
                        <div><strong>{provider.label}</strong><small>{provider.model || "未设置模型"}</small></div>
                        <i>{ready ? providerId === provider.id ? "已选择" : "可用" : "未配置"}</i>
                      </button>
                    );
                  })}
                </div>
              )}

              {!loading && step === 2 && (
                <div className="roadmap-generator__time">
                  <label>
                    计划总周数
                    <div className="roadmap-generator__presets">
                      {WEEK_PRESETS.map((weeks) => (
                        <button type="button" key={weeks} className={!customDuration && targetWeeks === weeks ? "is-selected" : ""} onClick={() => { setCustomDuration(false); setTargetWeeks(weeks); }}>
                          {weeks} 周
                        </button>
                      ))}
                      <button type="button" className={customDuration ? "is-selected" : ""} onClick={() => setCustomDuration(true)}>自定义</button>
                    </div>
                    {customDuration && <input aria-label="自定义学习周数" type="number" min="1" max="52" value={targetWeeks} onChange={(event) => setTargetWeeks(Number(event.target.value))} />}
                  </label>
                  <label>每周投入小时<input type="number" min="0.5" max="168" step="0.5" value={weeklyHours} onChange={(event) => setWeeklyHours(Number(event.target.value))} /></label>
                  <label>开始日期（可选）<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                  <label className="roadmap-generator__goal">
                    计划目标或完成范围（可选）
                    <textarea
                      aria-label="计划目标或完成范围"
                      rows={4}
                      value={planningGoal}
                      onChange={(event) => setPlanningGoal(event.target.value)}
                      placeholder="例如：完成教材第 1—8 章，能独立做课程作业；也可以留空。"
                    />
                  </label>
                  <aside><strong>{targetWeeks} 周 · 约 {Math.round(targetWeeks * weeklyHours)} 小时</strong><span>AI 会控制每周任务量，并为每个阶段设置可验证标准。</span></aside>
                </div>
              )}

              {!loading && step === 3 && !generating && !result && (
                <div className="roadmap-generator__sources">
                  <article>
                    <span>对话</span>
                    <div><strong>自动纳入课程历史对话</strong><small>{threads.length} 个对话 · {historyMessageCount} 条消息</small></div>
                    <i>始终包含</i>
                  </article>
                  <div className="roadmap-generator__documents">
                    <header>
                      <strong>选择资料</strong>
                      <div>
                        <span>{selectedDocumentIds.length} / {documents.length}</span>
                        {documents.length > 0 && <button
                          type="button"
                          aria-label={selectedDocumentIds.length === documents.length ? "取消全选全部资料" : "全选全部资料"}
                          onClick={() => setSelectedDocumentIds(selectedDocumentIds.length === documents.length ? [] : documents.map((item) => item.id))}
                        >{selectedDocumentIds.length === documents.length ? "取消全选" : "全选"}</button>}
                      </div>
                    </header>
                    {!documents.length && <p>本课程还没有资料，也可以仅根据课程和历史对话生成。</p>}
                    {documents.map((document) => (
                      <label key={document.id}>
                        <input type="checkbox" checked={selectedDocumentIds.includes(document.id)} onChange={() => toggleDocument(document.id)} />
                        <span><strong>{document.title}</strong><small>{document.filename}</small></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {generating && (
                <div className="roadmap-generator__progress" role="status">
                  <span className="roadmap-generator__orb"><i /><i /><i /></span>
                  <strong>{PROGRESS_LABELS[progressIndex]}</strong>
                  <ol>{PROGRESS_LABELS.map((label, index) => <li key={label} className={progressIndex >= index ? "is-active" : ""}>{label}</li>)}</ol>
                </div>
              )}

              {result && (
                <div className="roadmap-generator__success" role="status">
                  <span>✓</span>
                  <strong>学习路线已生成并同步</strong>
                  <p>{result.roadmap.phases.length} 个阶段 · {result.roadmap.weeks.length} 周 · {result.trace.model}</p>
                  <details>
                    <summary>查看结构化生成详情</summary>
                    <code>{result.trace.schema}</code>
                    {result.trace.fields.map((field) => <i key={field.key}>{field.key} · ready</i>)}
                  </details>
                </div>
              )}
              {error && <p className="error-message" role="alert">{error}</p>}
            </div>

            <footer>
              <button className="quiet-action" disabled={generating} onClick={step === 1 || result ? onClose : () => setStep((step - 1) as 1 | 2)}>
                {step === 1 || result ? "关闭" : "上一步"}
              </button>
              <span />
              {!result && step < 3 && <button className="primary-action" disabled={loading || (step === 1 && !providerId)} onClick={() => setStep((step + 1) as 2 | 3)}>下一步</button>}
              {!result && step === 3 && <button className="primary-action" disabled={generating || !providerId} onClick={() => void generate()}>{generating ? "生成中…" : "生成学习计划"}</button>}
              {result && <button className="primary-action" onClick={onClose}>查看学习路线</button>}
            </footer>
          </section>
        </div>
      )}
    </MotionPresence>
  );
}
