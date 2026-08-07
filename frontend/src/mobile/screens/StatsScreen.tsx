import type { MobileStats } from "../domain";

export function StatsScreen({ stats, headingRef }: {
  stats: MobileStats;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="sp-mobile-screen sp-stats" aria-labelledby="sp-mobile-heading-stats">
      <p className="sp-mobile-eyebrow">LEARNING PULSE / 14 DAYS</p>
      <h1 id="sp-mobile-heading-stats" ref={headingRef} tabIndex={-1}>学习节奏</h1>
      <p className="sp-screen-lede">看见真实投入，而不是制造虚假的在线时长。</p>

      <div className="sp-stats-hero sp-tactile-card">
        <div className="sp-stats-hero__streak"><span aria-hidden="true">▲</span><strong>{stats.streakDays}</strong><small>连续学习天数</small></div>
        <div><span className="sp-card-kicker">THIS WEEK</span><h2>本周 {stats.weeklyMinutes} 分钟</h2><p>稳定推进，比偶尔冲刺更可靠。</p></div>
      </div>

      <section className="sp-activity-card" aria-labelledby="activity-heading">
        <div className="sp-section-heading"><div><span className="sp-card-kicker">ACTIVITY</span><h2 id="activity-heading">两周活动</h2></div></div>
        <div className="sp-activity-grid">
          {stats.activeDays.map((day) => (
            <div
              key={day.date}
              className="sp-activity-day"
              data-active={day.active || undefined}
              data-testid="activity-day"
              aria-label={`${day.label}，${day.active ? `学习 ${day.minutes} 分钟` : "未学习"}`}
            >
              <span aria-hidden="true">{day.active ? "✓" : "·"}</span>
              <small>{day.label.replace(" 日", "")}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="sp-metric-grid">
        <article><span className="sp-card-kicker">COMPLETION</span><strong>{stats.completionRate}%</strong><small>任务完成率</small></article>
        <article><span className="sp-card-kicker">KNOWLEDGE</span><strong>{stats.knowledgeNodes}</strong><small>{stats.knowledgeNodes} 个知识节点</small></article>
        <article><span className="sp-card-kicker">NOTEBOOKS</span><strong>{stats.notebookCount}</strong><small>知识笔记本</small></article>
      </div>
    </section>
  );
}
