import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

interface DiagramSize {
  width: number;
  height: number;
}

function readDiagramSize(svg: SVGSVGElement): DiagramSize {
  const values = (svg.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
  const viewBoxWidth = values.length === 4 ? values[2] : 0;
  const viewBoxHeight = values.length === 4 ? values[3] : 0;
  return {
    width: Math.max(1, viewBoxWidth || Number(svg.getAttribute("width")) || 960),
    height: Math.max(1, viewBoxHeight || Number(svg.getAttribute("height")) || 540),
  };
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<DiagramSize>({ width: 960, height: 540 });

  useEffect(() => {
    let active = true;
    const renderId = `studypilot-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const dark = document.documentElement.dataset.theme === "dark";
    setError("");
    setLoading(true);
    setZoom(1);
    void import("mermaid").then(({ default: mermaid }) => {
      if (!active) return null;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: dark ? {
          background: "#172033",
          primaryColor: "#253a63",
          primaryTextColor: "#f3f6ff",
          primaryBorderColor: "#8fb8ff",
          lineColor: "#9fc2ff",
          secondaryColor: "#173e46",
          tertiaryColor: "#352d57",
          fontFamily: "var(--app-font-family)",
          fontSize: "15px",
        } : {
          background: "#ffffff",
          primaryColor: "#f8fbff",
          primaryTextColor: "#17213a",
          primaryBorderColor: "#4f83cc",
          lineColor: "#467fb7",
          secondaryColor: "#eef8f7",
          tertiaryColor: "#f5f1ff",
          fontFamily: "var(--app-font-family)",
          fontSize: "15px",
        },
        suppressErrorRendering: true,
        flowchart: { htmlLabels: false, useMaxWidth: false, curve: "basis" },
      });
      return mermaid.render(renderId, chart);
    }).then((result) => {
      if (!result || !active || !hostRef.current) return;
      hostRef.current.innerHTML = result.svg;
      result.bindFunctions?.(hostRef.current);
      const svg = hostRef.current.querySelector("svg");
      if (svg) {
        const size = readDiagramSize(svg);
        setNaturalSize(size);
        // Very wide LR/TB charts become an unreadable grey stripe when squeezed to 100%.
        // Open those at their natural size and let the reader pan horizontally.
        const shouldFit = size.width / size.height <= 6;
        setFit(shouldFit);
        setZoom(shouldFit && size.width > 1200 ? 1.25 : 1);
      }
      setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setLoading(false);
      setError(reason instanceof Error ? reason.message : "流程图语法无法解析");
    });
    return () => { active = false; };
  }, [chart, reactId]);

  useEffect(() => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;
    svg.style.width = fit ? `${Math.round(zoom * 100)}%` : `${Math.round(naturalSize.width * zoom)}px`;
    svg.style.maxWidth = "none";
    svg.style.height = "auto";
  }, [fit, naturalSize, zoom, loading]);

  if (error) return <div className="mermaid-diagram is-error" role="alert"><strong>流程图没有渲染</strong><span>{error}</span><pre><code>{chart}</code></pre></div>;
  return (
    <figure className="mermaid-figure">
      <figcaption className="mermaid-toolbar" aria-label="流程图显示工具">
        <span>{fit ? "适应宽度" : "原始画布"} · {Math.round(zoom * 100)}%</span>
        <div>
          <button type="button" aria-label="缩小流程图" onClick={() => setZoom((value) => Math.max(.35, value - .15))}>−</button>
          <button type="button" aria-label="放大流程图" onClick={() => setZoom((value) => Math.min(3, value + .15))}>＋</button>
          <button type="button" aria-label="适应流程图宽度" className={fit ? "is-active" : ""} onClick={() => { setFit(true); setZoom(1); }}>适应</button>
          <button type="button" aria-label="原始大小显示流程图" className={!fit ? "is-active" : ""} onClick={() => { setFit(false); setZoom(1); }}>原始大小</button>
        </div>
      </figcaption>
      <div
        ref={hostRef}
        className="mermaid-diagram"
        role="img"
        aria-label="Mermaid 流程图"
        aria-busy={loading}
        data-fit={String(fit)}
        style={{ "--mermaid-natural-ratio": String(naturalSize.width / naturalSize.height) } as CSSProperties}
      />
    </figure>
  );
}
