import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  LearningCard,
  LearningFeedbackKind,
  LearningGenerationTrace,
  LearningPractice,
} from "./types";


const feedbackOptions: Array<[string, LearningFeedbackKind]> = [
  ["再简单一点", "simpler"],
  ["换个例子", "another_example"],
  ["我懂了", "understood"],
  ["还没懂", "confused"],
];

function LearningMarkdown({
  children,
  className = "",
  inline = false,
}: {
  children: string;
  className?: string;
  inline?: boolean;
}) {
  const classes = ["learning-markdown", inline ? "is-inline" : "", className]
    .filter(Boolean)
    .join(" ");
  const normalizedChildren = children
    .replace(/(?:<br\s*\/?>(?:\s|&nbsp;)*){2,}/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, inline ? " " : "\n");
  const markdown = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={inline ? { p: ({ children: value }) => <>{value}</> } : undefined}
    >
      {normalizedChildren}
    </ReactMarkdown>
  );
  return inline
    ? <span className={classes}>{markdown}</span>
    : <div className={classes}>{markdown}</div>;
}


function LearningPracticeBlock({
  practice,
  disabled,
  onAnswer,
}: {
  practice: LearningPractice;
  disabled: boolean;
  onAnswer?: (answer: string) => void;
}) {
  const [selectedOption, setSelectedOption] = useState("");
  const [openAnswer, setOpenAnswer] = useState("");
  const typedPractice = practice.type === "multiple_choice" || practice.type === "open";

  return (
    <section className="learning-card__question">
      <small>
        {practice.type === "multiple_choice"
          ? "选择题 · 四选一"
          : practice.type === "open"
            ? "开放题 · 用自己的话回答"
            : "轮到你"}
      </small>
      <LearningMarkdown className="learning-card__question-text">
        {practice.question}
      </LearningMarkdown>

      {practice.type === "multiple_choice" && (
        <div
          className="learning-practice-options"
          role="radiogroup"
          aria-label="选择一个答案"
        >
          {(practice.options || []).map((option) => (
            <label
              key={option.id}
              className={selectedOption === option.id ? "is-selected" : ""}
            >
              <input
                type="radio"
                name={`practice-${practice.concept}`}
                aria-label={`${option.id}. ${option.text}`}
                value={option.id}
                checked={selectedOption === option.id}
                disabled={disabled}
                onChange={() => setSelectedOption(option.id)}
              />
              <i>{option.id}</i>
              <LearningMarkdown inline className="learning-practice-option-text">
                {option.text}
              </LearningMarkdown>
            </label>
          ))}
          {onAnswer && (
            <button
              type="button"
              className="learning-practice-submit"
              disabled={disabled || !selectedOption}
              onClick={() => {
                const selected = practice.options?.find(
                  (option) => option.id === selectedOption,
                );
                if (selected) onAnswer(`我的答案：${selected.id}. ${selected.text}`);
              }}
            >
              提交答案
            </button>
          )}
        </div>
      )}

      {practice.type === "open" && onAnswer && (
        <div className="learning-practice-open">
          <textarea
            aria-label="填写开放式回答"
            placeholder="用自己的话说明，不需要追求标准措辞…"
            value={openAnswer}
            disabled={disabled}
            onChange={(event) => setOpenAnswer(event.target.value)}
          />
          <button
            type="button"
            disabled={disabled || !openAnswer.trim()}
            onClick={() => onAnswer(`我的回答：${openAnswer.trim()}`)}
          >
            提交回答
          </button>
        </div>
      )}

      {practice.reference_answer && (
        <details className="learning-card__reference-answer">
          <summary>查看参考答案</summary>
          <LearningMarkdown className="learning-card__reference-text">
            {practice.reference_answer}
          </LearningMarkdown>
        </details>
      )}
      {!typedPractice && !practice.reference_answer && null}
    </section>
  );
}

export function LearningMessageCard({
  card,
  disabled = false,
  generationTrace,
  onAnswer,
  onFeedback,
}: {
  card: LearningCard;
  disabled?: boolean;
  generationTrace?: LearningGenerationTrace;
  onAnswer?: (answer: string) => void;
  onFeedback: (kind: LearningFeedbackKind, label: string) => void;
}) {
  const directAnswer = card.direct_answer || card.plain_explanation || "";
  const explanation = card.explanation || "";
  const example = typeof card.example === "string"
    ? { scenario: card.example, analysis: "" }
    : card.example;
  const practice = card.practice || {
    concept: card.concept,
    question: card.question || "",
    reference_answer: "",
  };
  const structuredCard = { ...card };
  delete structuredCard.learning_path;

  return (
    <section className="learning-card" aria-label={`学习知识点：${card.concept}`}>
      <header>
        <small>这次只学一个点</small>
        <h3>{card.concept}</h3>
      </header>
      <section className="learning-card__answer">
        <small>先给结论</small>
        <LearningMarkdown className="learning-card__direct-answer">
          {directAnswer}
        </LearningMarkdown>
      </section>
      {explanation && (
        <section>
          <small>展开讲清楚</small>
          <LearningMarkdown className="learning-card__explanation">
            {explanation}
          </LearningMarkdown>
        </section>
      )}
      <section>
        <small>与本题对齐的例子</small>
        <LearningMarkdown className="learning-card__example-scenario">
          {example.scenario}
        </LearningMarkdown>
        {example.analysis && <LearningMarkdown className="learning-card__example-analysis">
          {example.analysis}
        </LearningMarkdown>}
      </section>
      <LearningPracticeBlock
        practice={practice}
        disabled={disabled}
        onAnswer={onAnswer}
      />
      <details className="learning-card__structured">
        <summary>查看结构化内容</summary>
        <p>展示已通过校验的学习字段，不包含模型内部私有推理。</p>
        {generationTrace && (
          <div>
            <code>{generationTrace.schema}</code>
            <span>
              {generationTrace.outcome === "repaired"
                ? "已自动修复并校验"
                : "一次生成并校验通过"}
            </span>
          </div>
        )}
        <pre aria-label="已校验学习内容">
          {JSON.stringify(structuredCard, null, 2)}
        </pre>
      </details>
      <footer aria-label="学习反馈">
        {feedbackOptions.map(([label, kind]) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => onFeedback(kind, label)}
          >
            {label}
          </button>
        ))}
      </footer>
    </section>
  );
}
