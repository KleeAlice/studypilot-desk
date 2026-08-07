import { useEffect, useRef, useState } from "react";
import type { MobileGraph, MobileGraphNode } from "../domain";

const kindLabels: Record<MobileGraphNode["kind"], string> = {
  concept: "概念",
  note: "便签",
  source: "资料",
};

export function GraphPreview({ graph, title }: { graph: MobileGraph; title: string }) {
  const [selected, setSelected] = useState<MobileGraphNode | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  useEffect(() => {
    if (selected) closeRef.current?.focus();
  }, [selected]);

  return (
    <div className="sp-graph-card">
      <div className="sp-graph-stage">
        <svg role="img" aria-label={`${title}知识图谱`} viewBox="0 0 360 230" preserveAspectRatio="xMidYMid meet">
          <g className="sp-graph-edges">
            {graph.edges.map((edge) => {
              const source = nodesById.get(edge.sourceId);
              const target = nodesById.get(edge.targetId);
              if (!source || !target) return null;
              return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
            })}
          </g>
          <g className="sp-graph-dots">
            {graph.nodes.map((node) => <circle key={node.id} cx={node.x} cy={node.y} r="18" data-kind={node.kind} />)}
          </g>
        </svg>
        {graph.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className="sp-graph-node"
            data-kind={node.kind}
            aria-label={`知识节点：${node.title}`}
            style={{ left: `${node.x / 3.6}%`, top: `${node.y / 2.3}%` }}
            onClick={() => setSelected(node)}
          >
            <span>{node.title}</span>
          </button>
        ))}
      </div>
      <div className="sp-graph-legend" aria-label="图谱图例">
        <span><i data-kind="concept" />概念</span>
        <span><i data-kind="note" />便签</span>
        <span><i data-kind="source" />资料</span>
      </div>
      {selected ? (
        <div className="sp-sheet-layer">
          <button className="sp-sheet-backdrop" type="button" aria-label="关闭节点详情" onClick={() => setSelected(null)} />
          <section className="sp-node-sheet" role="dialog" aria-modal="true" aria-label={selected.title}>
            <div className="sp-node-sheet__handle" aria-hidden="true" />
            <div className="sp-node-sheet__heading">
              <span>{kindLabels[selected.kind]}</span>
              <button ref={closeRef} type="button" aria-label="关闭节点详情" onClick={() => setSelected(null)}>×</button>
            </div>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
            <div className="sp-mastery-row">
              <span>掌握度 {selected.mastery}%</span>
              <span className="sp-linear-progress" aria-hidden="true"><i style={{ width: `${selected.mastery}%` }} /></span>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
