import { useState } from "react";


export type LearningGenerationFieldStatus = "pending" | "generating" | "ready";

export interface LearningGenerationField {
  key: string;
  status: LearningGenerationFieldStatus;
}

export interface LearningGenerationProgress {
  phase: string;
  label: string;
  schema: string;
  fields: LearningGenerationField[];
}

const initialProgress: LearningGenerationProgress = {
  phase: "understanding",
  label: "正在理解学习目标",
  schema: "studypilot-learning/v1",
  fields: [
    { key: "thread_title", status: "generating" },
    { key: "concept", status: "pending" },
    { key: "direct_answer", status: "pending" },
    { key: "explanation", status: "pending" },
    { key: "example", status: "pending" },
    { key: "practice", status: "pending" },
  ],
};

const statusLabels: Record<LearningGenerationFieldStatus, string> = {
  pending: "等待",
  generating: "生成中",
  ready: "已完成",
};

export function LearningGenerationIndicator({
  progress = initialProgress,
}: {
  progress?: LearningGenerationProgress | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const value = progress || initialProgress;
  const readyCount = value.fields.filter((field) => field.status === "ready").length;
  const percentage = Math.max(
    8,
    Math.round((readyCount / Math.max(value.fields.length, 1)) * 100),
  );

  return (
    <section
      className="learning-generation"
      role="status"
      aria-live="polite"
      aria-label="正在生成结构化学习内容"
    >
      <header>
        <span className="learning-generation__orb" aria-hidden="true">
          <i />
        </span>
        <div>
          <strong>生成学习内容中</strong>
          <p>{value.label}</p>
        </div>
        <span className="learning-generation__percent">{percentage}%</span>
      </header>
      <div className="learning-generation__track" aria-hidden="true">
        <i style={{ width: `${percentage}%` }} />
      </div>
      <button
        type="button"
        className="learning-generation__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "收起思考过程" : "查看思考过程"}
      </button>
      {expanded && (
        <div className="learning-generation__details">
          <div className="learning-generation__schema">
            <span>结构协议</span>
            <code>{value.schema}</code>
          </div>
          <p className="learning-generation__privacy">
            这里只展示结构化字段生成状态，不包含模型内部私有推理。
          </p>
          <ul>
            {value.fields.map((field) => (
              <li key={field.key} data-status={field.status}>
                <i aria-hidden="true" />
                <code>{field.key}</code>
                <span>{statusLabels[field.status]}</span>
              </li>
            ))}
          </ul>
          <pre aria-label="结构化字段预览">
            {JSON.stringify(
              {
                schema: value.schema,
                phase: value.phase,
                fields: Object.fromEntries(
                  value.fields.map((field) => [field.key, field.status]),
                ),
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </section>
  );
}
