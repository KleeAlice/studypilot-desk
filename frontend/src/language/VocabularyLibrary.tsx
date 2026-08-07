import { useCallback, useEffect, useMemo, useState } from "react";
import type { VocabularyItem } from "../agent/types";
import type { ApiClient } from "../services/api";
import type { Course } from "../types";
import { PronunciationDisplay } from "./PronunciationDisplay";

interface VocabularyDraft {
  term: string;
  pronunciation: string;
  meaning: string;
  example: string;
}

const EMPTY_DRAFT: VocabularyDraft = {
  term: "",
  pronunciation: "",
  meaning: "",
  example: "",
};

export function VocabularyLibrary({
  api,
  course,
  onOpenSource,
}: {
  api: ApiClient;
  course: Course;
  onOpenSource: (item: VocabularyItem) => void;
}) {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [query, setQuery] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<VocabularyDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await api.get<VocabularyItem[]>(`/api/vocabulary?course_id=${course.id}&limit=200`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "词汇本暂时无法加载");
    }
  }, [api, course.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    const now = Date.now();
    return items.filter((item) => {
      if (dueOnly && item.next_review_at && new Date(item.next_review_at).getTime() > now) return false;
      if (!keyword) return true;
      return `${item.term} ${item.pronunciation} ${item.meaning} ${item.example}`
        .toLocaleLowerCase()
        .includes(keyword);
    });
  }, [dueOnly, items, query]);

  async function save() {
    if (!draft.term.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await api.post<VocabularyItem>("/api/vocabulary", {
        course_id: course.id,
        language_tag: course.target_language_tag || "",
        term: draft.term.trim(),
        pronunciation: draft.pronunciation.trim(),
        meaning: draft.meaning.trim(),
        example: draft.example.trim(),
        source_kind: "",
        source_id: "",
        document_id: null,
        block_key: "",
        locator: {},
      });
      setItems((current) => [created, ...current]);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "词汇保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="language-page vocabulary-library" aria-label="语言课程词汇本">
      <header className="vocabulary-library__header">
        <div><h1>词汇本</h1><p>保存真实词语、读音、例句和出处，并按复习时间安排训练。</p></div>
        <button className="language-primary-action" onClick={() => setAdding(true)}>添加词汇</button>
      </header>
      <div className="vocabulary-toolbar">
        <label>
          <span aria-hidden="true">⌕</span>
          <input aria-label="搜索词汇" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索原词、释义或例句" />
        </label>
        <button className={dueOnly ? "is-active" : ""} aria-pressed={dueOnly} onClick={() => setDueOnly((value) => !value)}>只看待复习</button>
        <span>{visibleItems.length} / {items.length}</span>
      </div>

      {adding && (
        <form className="vocabulary-add-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <header><strong>添加词汇</strong><button type="button" aria-label="关闭添加词汇" onClick={() => setAdding(false)}>×</button></header>
          <div>
            <label>原词<input autoFocus value={draft.term} onChange={(event) => setDraft((value) => ({ ...value, term: event.target.value }))} /></label>
            <label>读音<input value={draft.pronunciation} onChange={(event) => setDraft((value) => ({ ...value, pronunciation: event.target.value }))} /></label>
            <label>释义<input value={draft.meaning} onChange={(event) => setDraft((value) => ({ ...value, meaning: event.target.value }))} /></label>
            <label>例句<textarea value={draft.example} onChange={(event) => setDraft((value) => ({ ...value, example: event.target.value }))} /></label>
          </div>
          <footer><button type="button" onClick={() => setAdding(false)}>取消</button><button type="submit" disabled={busy || !draft.term.trim()}>{busy ? "正在保存…" : "保存词汇"}</button></footer>
        </form>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}
      {visibleItems.length ? (
        <div className="vocabulary-list">
          {visibleItems.map((item) => (
            <article key={item.id}>
              <header>
                <div>
                  <h2>{item.term}</h2>
                  <PronunciationDisplay value={item.pronunciation} scheme={course.pronunciation_scheme} romanization={course.romanization_enabled} />
                </div>
                <span>{item.next_review_at ? new Date(item.next_review_at).toLocaleDateString("zh-CN") : "现在复习"}</span>
              </header>
              <p>{item.meaning || "还没有释义"}</p>
              {item.example && <blockquote>{item.example}</blockquote>}
              <footer>
                <small>{item.repetitions ? `已复习 ${item.repetitions} 次 · 间隔 ${item.interval_days} 天` : "新词"}</small>
                {item.document_id && <button aria-label={`查看 ${item.term} 的来源`} onClick={() => onOpenSource(item)}>查看出处</button>}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="language-empty-vocabulary">
          <strong>{items.length ? "没有匹配的词汇" : "词汇本还是空的"}</strong>
          <p>{items.length ? "换个关键词或关闭筛选。" : "添加第一个词后就可以开始四类训练。"}</p>
        </div>
      )}
    </section>
  );
}
