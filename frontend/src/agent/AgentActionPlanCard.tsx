import { useState } from "react";
import type { AgentActionOperation, AgentActionPlan } from "./types";


const operationLabels: Record<AgentActionOperation["type"], string> = {
  replace_document_block: "修改 Markdown",
  create_knowledge_node: "新建知识节点",
  update_knowledge_node: "修改知识节点",
  delete_knowledge_node: "删除知识节点",
  create_knowledge_edge: "新建知识关系",
  delete_knowledge_edge: "删除知识关系",
};

const statusCopy: Record<AgentActionPlan["status"], string> = {
  pending: "等待你的确认",
  executing: "正在执行整批操作…",
  completed: "整批操作已执行",
  cancelled: "计划已取消，未修改任何内容",
  undone: "整批操作已撤销",
  failed: "整批执行失败，所有修改已回滚",
};

function operationTarget(operation: AgentActionOperation) {
  if (operation.document_id) return `资料 #${operation.document_id} · ${operation.block_key || "正文"}`;
  if (operation.node_id) return `节点 #${operation.node_id}`;
  if (operation.edge_id) return `关系 #${operation.edge_id}`;
  if (operation.temp_id) return `新节点 ${operation.temp_id}`;
  if (operation.notebook_id) return `知识笔记 #${operation.notebook_id}`;
  return "当前工作区";
}

export function AgentActionPlanCard({
  plan,
  onAction,
}: {
  plan: AgentActionPlan;
  onAction: (action: "confirm" | "cancel" | "undo") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | "undo" | null>(null);
  const [error, setError] = useState("");

  async function run(action: "confirm" | "cancel" | "undo") {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      await onAction(action);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "计划操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className={`agent-action-plan is-${plan.status} ${plan.destructive ? "is-destructive" : ""}`}
      role="region"
      aria-label={plan.status === "pending" ? "待确认操作计划" : "Agent 操作计划"}
    >
      <header>
        <div><small>ACTION PLAN · {plan.operations.length} STEPS</small><strong>{plan.title}</strong></div>
        <span>{statusCopy[plan.status]}</span>
      </header>
      {plan.summary && <p>{plan.summary}</p>}
      {plan.destructive && <div className="agent-action-plan__warning">包含删除操作</div>}
      <details open={plan.operations.length <= 4}>
        <summary>查看具体修改</summary>
        <ol>
          {plan.operations.map((operation, index) => (
            <li key={`${operation.type}-${index}`} className={operation.type.startsWith("delete_") ? "is-delete" : ""}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <span><strong>{operation.description || operationLabels[operation.type]}</strong><small>{operationLabels[operation.type]} · {operationTarget(operation)}</small></span>
            </li>
          ))}
        </ol>
      </details>
      {plan.status === "pending" && (
        <footer>
          <button aria-label="取消整批计划" disabled={busy !== null} onClick={() => void run("cancel")}>{busy === "cancel" ? "取消中…" : "取消"}</button>
          <button className="is-primary" aria-label="确认执行整批计划" disabled={busy !== null} onClick={() => void run("confirm")}>{busy === "confirm" ? "执行中…" : `确认执行 ${plan.operations.length} 项`}</button>
        </footer>
      )}
      {plan.status === "completed" && (
        <footer><button aria-label="撤销整批操作" disabled={busy !== null} onClick={() => void run("undo")}>{busy === "undo" ? "撤销中…" : "撤销整批操作"}</button></footer>
      )}
      {(plan.error || error) && <p className="agent-action-plan__error" role="alert">{error || plan.error}</p>}
    </section>
  );
}
