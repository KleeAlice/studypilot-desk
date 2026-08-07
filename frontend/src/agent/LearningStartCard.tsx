import { useState, type FormEvent } from "react";

export type LearningStartMaterial = {
  id: number;
  title: string;
  filename: string;
  format?: string;
};

export function LearningStartCard({
  hasSelectedMaterials = false,
  selectedMaterials = [],
  availableMaterialCount = selectedMaterials.length,
  onManageMaterials,
  onRemoveMaterial,
  onStart,
  onAutonomousStart,
}: {
  hasSelectedMaterials?: boolean;
  selectedMaterials?: LearningStartMaterial[];
  availableMaterialCount?: number;
  onManageMaterials?: () => void;
  onRemoveMaterial?: (documentId: number) => void;
  onStart: (prompt: string) => void;
  onAutonomousStart?: (subject: string, goal: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [autonomousGoal, setAutonomousGoal] = useState("");
  const [materialGoal, setMaterialGoal] = useState("");
  const ready = hasSelectedMaterials || selectedMaterials.length > 0;
  const totalMaterials = Math.max(availableMaterialCount, selectedMaterials.length);

  function submitAutonomous(event: FormEvent) {
    event.preventDefault();
    const normalized = subject.trim();
    if (!normalized || !onAutonomousStart) return;
    onAutonomousStart(normalized, autonomousGoal.trim());
  }

  return (
    <section className="learning-start" aria-label="开始学习模式">
      <header><h2>今天想学什么</h2></header>
      <div className="learning-start__options" data-layout="stacked">
        <form
          className="learning-start__option learning-start__autonomous"
          role="group"
          aria-label="自主规划学习"
          onSubmit={submitAutonomous}
        >
          <header><span>01</span><strong>从主题开始</strong></header>
          <div className="learning-start__fields">
            <label htmlFor="learning-subject">
              <span>学习主题</span>
              <input
                id="learning-subject"
                aria-label="想学习的主题"
                autoComplete="off"
                placeholder="输入你想学习的内容"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label htmlFor="autonomous-learning-goal">
              <span>计划目标或完成范围（可选）</span>
              <textarea
                id="autonomous-learning-goal"
                aria-label="自主学习目标（可选）"
                placeholder="想学到什么程度（可留空）"
                value={autonomousGoal}
                onChange={(event) => setAutonomousGoal(event.target.value)}
              />
            </label>
          </div>
          <footer><button className="learning-start__submit" type="submit" aria-label="规划并开始学习" disabled={!subject.trim() || !onAutonomousStart}>规划并开始</button></footer>
        </form>

        <form
          className="learning-start__option learning-start__materials"
          role="group"
          aria-label="从资料开始学习"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            onStart(materialGoal.trim() || "开始学习所选资料");
          }}
        >
          <header className="learning-start__material-heading">
            <div><span>02</span><strong>从资料开始</strong></div>
            <button type="button" aria-label="管理学习资料" onClick={onManageMaterials}>
              选择资料
            </button>
          </header>
          <div className="learning-start__material-layout">
            <div className="learning-start__selected-materials" role="list" aria-label="已选学习资料">
              {selectedMaterials.length ? selectedMaterials.map((material) => (
                <article key={material.id} role="listitem">
                  <i>{(material.format || material.filename.split(".").pop() || "资料").slice(0, 4).toUpperCase()}</i>
                  <span><strong>{material.title}</strong><small>{material.filename}</small></span>
                  {onRemoveMaterial && (
                    <button
                      type="button"
                      aria-label={`移除资料 ${material.title}`}
                      onClick={() => onRemoveMaterial(material.id)}
                    >
                      ×
                    </button>
                  )}
                </article>
              )) : (
                <div className="learning-start__material-empty">还没有选择资料</div>
              )}
            </div>
            <label htmlFor="material-learning-goal">
              <span>计划目标或完成范围（可选）</span>
              <textarea
                id="material-learning-goal"
                aria-label="资料学习目标（可选）"
                placeholder="想完成哪些内容（可留空）"
                value={materialGoal}
                onChange={(event) => setMaterialGoal(event.target.value)}
                disabled={!ready}
              />
            </label>
          </div>
          <footer>
            <span aria-live="polite">已选 {selectedMaterials.length || (ready ? 1 : 0)} / {totalMaterials}</span>
            <button className="learning-start__submit" type="submit" aria-label="从这些资料开始" disabled={!ready}>开始学习</button>
          </footer>
        </form>
      </div>
    </section>
  );
}
