import type { MobileGraph, MobileNotebook } from "../domain";
import { GraphPreview } from "../components/GraphPreview";

export function NotesScreen({ notebooks, graph, headingRef }: {
  notebooks: MobileNotebook[];
  graph: MobileGraph;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const active = notebooks.find((notebook) => notebook.id === graph.notebookId) ?? notebooks[0];
  return (
    <section className="sp-mobile-screen sp-notes" aria-labelledby="sp-mobile-heading-notes">
      <p className="sp-mobile-eyebrow">KNOWLEDGE SPACE / {notebooks.length}</p>
      <h1 id="sp-mobile-heading-notes" ref={headingRef} tabIndex={-1}>知识笔记</h1>
      <p className="sp-screen-lede">在小屏上保留关系与层级，点按节点阅读细节。</p>
      <div className="sp-notebook-strip" aria-label="笔记本">
        {notebooks.map((notebook) => (
          <button
            key={notebook.id}
            type="button"
            className={`sp-notebook-chip sp-notebook-chip--${notebook.accent}`}
            aria-pressed={notebook.id === active.id}
            aria-label={`打开笔记本：${notebook.title}`}
          >
            <strong>{notebook.title}</strong>
            <span>{notebook.nodeCount} 节点 · 掌握 {notebook.mastery}%</span>
          </button>
        ))}
      </div>
      <div className="sp-section-heading">
        <div><span className="sp-card-kicker">GRAPH PREVIEW</span><h2>{active.title}</h2></div>
        <span>{active.nodeCount} 个节点</span>
      </div>
      <GraphPreview graph={graph} title={active.title} />
    </section>
  );
}
