import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ApiClient } from "../services/api";
import type { LanguageLesson, LanguageMaterialsResponse } from "./types";

const LESSON_TYPE_LABELS: Record<LanguageLesson["lesson_type"], string> = {
  discover: "认识",
  practice: "强化",
  mission: "实战",
  checkpoint: "阶段关卡",
};

function materialSearchText(lesson: LanguageLesson) {
  return JSON.stringify(lesson).toLocaleLowerCase();
}

export function LanguageMaterials({
  api,
  courseId,
  onStart,
  children,
}: {
  api: ApiClient;
  courseId: number;
  onStart: () => void;
  children?: ReactNode;
}) {
  const [materials, setMaterials] = useState<LanguageMaterialsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setMaterials(
        await api.get<LanguageMaterialsResponse>(
          `/api/courses/${courseId}/language/materials`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内置资料暂时不可用");
    }
  }, [api, courseId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!materials) return [];
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return materials.items;
    return materials.items.filter((lesson) => (
      materialSearchText(lesson).includes(normalized)
    ));
  }, [materials, query]);

  return (
    <section className="language-page language-materials">
      <header>
        <div>
          <span className="language-page-kicker">无需自行找资料</span>
          <h1>课程资料库</h1>
          <p>这里不是目录占位符：每一课的表达、对话、文段、译文、跟读和文化说明都可以直接浏览。</p>
        </div>
        <button type="button" className="language-primary-action" onClick={onStart}>一键开始当前课</button>
      </header>
      <div className="language-materials__builtin">
        <div className="language-section-heading">
          <div>
            <h2>内置分级课程</h2>
            <p>完全离线可用，不依赖 AI，也不要求个人导入。</p>
          </div>
          {materials && <strong>{materials.total_lessons} 节内置课程</strong>}
        </div>

        {error ? (
          <div className="language-materials__error">
            <p role="alert" className="error-message">{error}</p>
            <button type="button" onClick={() => void load()}>重新加载资料</button>
          </div>
        ) : !materials ? (
          <p role="status">正在读取内置词汇、对话和文段…</p>
        ) : (
          <>
            <label className="language-materials__search">
              <span>搜索内置课程</span>
              <input
                type="search"
                aria-label="搜索内置课程"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索目标语言、中文释义、场景或文段"
              />
              <small>{filtered.length} 个结果</small>
            </label>
            <div className="language-materials__lesson-list">
              {filtered.map((lesson) => {
                const expanded = expandedId === lesson.id;
                return (
                  <article key={lesson.id} className={expanded ? "is-expanded" : ""}>
                    <button
                      type="button"
                      aria-label={`${expanded ? "收起" : "展开"}材料：${lesson.title}`}
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? "" : lesson.id)}
                    >
                      <span>{lesson.level} · {LESSON_TYPE_LABELS[lesson.lesson_type]}</span>
                      <div>
                        <h3>{lesson.title}</h3>
                        <p>{lesson.can_do}</p>
                      </div>
                      <i aria-hidden="true">{expanded ? "−" : "+"}</i>
                    </button>
                    {expanded && (
                      <div className="language-materials__lesson-content">
                        <section>
                          <h4>核心表达</h4>
                          {lesson.phrases.map((phrase) => (
                            <article key={phrase.term}>
                              <strong>{phrase.term}</strong>
                              <small>{phrase.pronunciation}</small>
                              <p>{phrase.meaning}</p>
                              <blockquote>{phrase.example}</blockquote>
                            </article>
                          ))}
                        </section>
                        <section>
                          <h4>{lesson.passage.title}</h4>
                          <p>{lesson.passage.text}</p>
                          <small>{lesson.passage.translation}</small>
                        </section>
                        <section>
                          <h4>情境对话</h4>
                          {lesson.dialogue.map((line, index) => (
                            <p key={`${line.speaker}-${index}`}>
                              <strong>{line.speaker}</strong> {line.text}
                              <small>{line.translation}</small>
                            </p>
                          ))}
                        </section>
                        <aside>
                          <strong>文化与语用</strong>
                          <p>{lesson.culture_note}</p>
                        </aside>
                      </div>
                    )}
                  </article>
                );
              })}
              {!filtered.length && (
                <div className="language-empty-vocabulary">
                  <strong>没有匹配的内置课程</strong>
                  <p>试试搜索中文释义、场景名或目标语言表达。</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {children && (
        <div className="language-materials__personal">
          <div className="language-section-heading">
            <div><h2>我的补充资料</h2><p>可选，不导入也能完整学习。</p></div>
          </div>
          {children}
        </div>
      )}
    </section>
  );
}
