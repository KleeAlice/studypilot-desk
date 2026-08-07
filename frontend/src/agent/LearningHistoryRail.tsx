import { useState } from "react";
import type { FocusEvent } from "react";
import type { AgentThread } from "./types";


export function LearningHistoryRail({
  threads,
  activeThreadId,
  onNew,
  onOpen,
  onTogglePin,
  onRequestDelete,
  onRequestDeleteAll,
}: {
  threads: AgentThread[];
  activeThreadId?: number;
  onNew: () => void | Promise<void>;
  onOpen: (thread: AgentThread) => void | Promise<void>;
  onTogglePin: (thread: AgentThread) => void | Promise<void>;
  onRequestDelete: (thread: AgentThread) => void;
  onRequestDeleteAll: () => void;
}) {
  const [railPinned, setRailPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = railPinned || hovered || focused;

  function leaveFocus(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocused(false);
  }

  return (
    <>
      <button
        type="button"
        className="learning-history-toggle"
        aria-label="历史对话"
        aria-controls="learning-history-rail"
        aria-pressed={railPinned}
        title={railPinned ? "取消固定学习历史" : "固定展开学习历史"}
        onClick={() => {
          setRailPinned((value) => !value);
          setHovered(false);
        }}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <div
        className="learning-history-edge"
        data-testid="learning-history-edge"
        aria-hidden="true"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={(event) => {
          const nextTarget = event.relatedTarget;
          const rail = event.currentTarget.nextElementSibling;
          if (nextTarget instanceof Node && rail?.contains(nextTarget)) return;
          setHovered(false);
        }}
      />
      <aside
        id="learning-history-rail"
        className="learning-history-rail"
        role="region"
        aria-label="学习历史"
        aria-hidden={!open}
        data-open={String(open)}
        data-testid="learning-history-rail"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={leaveFocus}
      >
        <header>
          <div>
            <small>LEARNING SESSIONS</small>
            <strong>学习历史</strong>
          </div>
          <span>{threads.length}</span>
        </header>
        <div className="learning-history-actions">
          <button
            className="learning-history-new"
            type="button"
            aria-label="新建学习对话"
            onClick={() => void onNew()}
          >＋ 新建学习对话</button>
          <button
            className="learning-history-delete-all"
            type="button"
            aria-label="删除全部学习对话"
            disabled={threads.length === 0}
            onClick={onRequestDeleteAll}
          >全部删除</button>
        </div>
        <div className="learning-history-list">
          {!threads.length && <p>还没有学习记录。新建一次学习后会自动保存在这里。</p>}
          {threads.map((thread) => (
            <article
              key={thread.id}
              className={`${thread.id === activeThreadId ? "is-active" : ""} ${thread.pinned ? "is-pinned" : ""}`.trim()}
            >
              <button type="button" aria-label={`打开对话 ${thread.title}`} onClick={() => void onOpen(thread)}>
                <strong>{thread.title}</strong>
                <small>
                  <span>已学习 {thread.learning_state?.completed_concepts?.length || thread.learning_state?.lesson_index || 0} 个知识点</span>
                  <span>当前：{thread.learning_state?.current_concept || "尚未开始"}</span>
                </small>
              </button>
              <button
                type="button"
                className="learning-history-pin"
                aria-label={`${thread.pinned ? "取消置顶" : "置顶"}对话 ${thread.title}`}
                aria-pressed={thread.pinned === true}
                title={thread.pinned ? "取消置顶" : "收藏置顶"}
                onClick={() => void onTogglePin(thread)}
              >{thread.pinned ? "★" : "☆"}</button>
              <button
                type="button"
                className="learning-history-delete"
                aria-label={`删除对话 ${thread.title}`}
                onClick={() => onRequestDelete(thread)}
              >×</button>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}
