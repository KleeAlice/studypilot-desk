import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { DocumentAnnotation, DocumentBlock } from "./types";

export type AnnotationTool = "select" | "highlight" | "note" | "pen" | "marker" | "rectangle" | "ellipse" | "eraser";

interface Point { x: number; y: number }
interface DraftShape { start: Point; current: Point; points: Point[] }

function point(event: ReactPointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(bounds.width, 1))),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(bounds.height, 1))),
  };
}

function bounds(shape: DraftShape) {
  return {
    x: Math.min(shape.start.x, shape.current.x),
    y: Math.min(shape.start.y, shape.current.y),
    width: Math.abs(shape.current.x - shape.start.x),
    height: Math.abs(shape.current.y - shape.start.y),
  };
}

function pathPoints(points: Point[]) {
  return points.map((item) => `${item.x * 100},${item.y * 100}`).join(" ");
}

export function AnnotationOverlay({ surfaceRef, block, annotations, tool, onCreate, onErase }: {
  surfaceRef: RefObject<HTMLDivElement | null>;
  block: DocumentBlock | null;
  annotations: DocumentAnnotation[];
  tool: AnnotationTool;
  onCreate: (kind: DocumentAnnotation["kind"], geometry: Record<string, unknown>) => Promise<void>;
  onErase: (annotationId: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [frame, setFrame] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const pointerId = useRef<number | null>(null);
  const drawing = ["pen", "marker", "rectangle", "ellipse"].includes(tool);
  const erasing = tool === "eraser";
  const visible = useMemo(
    () => annotations.filter((annotation) => annotation.block_key === block?.block_key && ["pen", "marker", "rectangle", "ellipse"].includes(annotation.kind)),
    [annotations, block],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !block) return;
    const target = Array.from(surface.querySelectorAll<HTMLElement>("[data-document-block]"))
      .find((item) => item.dataset.documentBlock === block.block_key);
    if (!target) return;
    const update = () => {
      let left = 0;
      let top = 0;
      let node: HTMLElement | null = target;
      while (node && node !== surface) {
        left += node.offsetLeft;
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      setFrame({ left, top, width: target.offsetWidth, height: target.offsetHeight });
    };
    update();
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(target);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [block, surfaceRef]);

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (erasing) {
      const target = event.target instanceof Element ? event.target.closest<SVGElement>("[data-annotation-id]") : null;
      const annotationId = Number(target?.dataset.annotationId || 0);
      if (annotationId) {
        event.preventDefault();
        event.stopPropagation();
        void onErase(annotationId);
      }
      return;
    }
    if (!drawing || !block) return;
    const start = point(event);
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraft({ start, current: start, points: [start] });
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draft || pointerId.current !== event.pointerId) return;
    const current = point(event);
    setDraft((value) => value ? { ...value, current, points: [...value.points, current] } : value);
  }

  function up(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draft || pointerId.current !== event.pointerId || !drawing) return;
    const completed = { ...draft, current: point(event) };
    pointerId.current = null;
    setDraft(null);
    const area = bounds(completed);
    if (area.width < .003 && area.height < .003) return;
    const geometry = tool === "pen" || tool === "marker"
      ? { points: completed.points, coordinate_space: "block-normalized-v2" }
      : { ...area, coordinate_space: "block-normalized-v2" };
    void onCreate(tool as DocumentAnnotation["kind"], geometry);
  }

  const preview = draft ? bounds(draft) : null;
  return <div
    className={`annotation-overlay ${drawing ? "is-drawing" : ""} ${erasing ? "is-erasing" : ""}`}
    aria-label="在当前资料块上圈画"
    data-tool={tool}
    data-block-key={block?.block_key || ""}
    style={frame}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
  >
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {visible.map((annotation) => annotation.kind === "pen" || annotation.kind === "marker"
        ? <polyline key={annotation.id} data-annotation-id={annotation.id} className={`annotation-shape is-${annotation.kind}`} points={pathPoints(annotation.geometry.points || [])} />
        : annotation.kind === "ellipse"
          ? <ellipse key={annotation.id} data-annotation-id={annotation.id} className="annotation-shape is-ellipse" cx={(annotation.geometry.x + annotation.geometry.width / 2) * 100} cy={(annotation.geometry.y + annotation.geometry.height / 2) * 100} rx={annotation.geometry.width * 50} ry={annotation.geometry.height * 50} />
          : <rect key={annotation.id} data-annotation-id={annotation.id} className="annotation-shape is-rectangle" x={annotation.geometry.x * 100} y={annotation.geometry.y * 100} width={annotation.geometry.width * 100} height={annotation.geometry.height * 100} />)}
      {draft && (tool === "pen" || tool === "marker") && <polyline className={`annotation-shape is-${tool} is-preview`} points={pathPoints(draft.points)} />}
      {preview && tool === "ellipse" && <ellipse className="annotation-shape is-ellipse is-preview" cx={(preview.x + preview.width / 2) * 100} cy={(preview.y + preview.height / 2) * 100} rx={preview.width * 50} ry={preview.height * 50} />}
      {preview && tool === "rectangle" && <rect className="annotation-shape is-rectangle is-preview" x={preview.x * 100} y={preview.y * 100} width={preview.width * 100} height={preview.height * 100} />}
    </svg>
  </div>;
}
