import { useEffect, useState } from "react";
import type { ApiClient } from "../services/api";

export function ReviewHub({ api }: { api: ApiClient }) {
  const [reviews, setReviews] = useState<any[]>([]); const [weekly, setWeekly] = useState<any[]>([]); const [interviews, setInterviews] = useState<any[]>([]);
  useEffect(() => { void Promise.all([api.get<any[]>("/api/reviews"), api.get<any[]>("/api/weekly-reviews"), api.get<any[]>("/api/interviews")]).then(([a,b,c]) => { setReviews(a); setWeekly(b); setInterviews(c); }); }, [api]);
  return <section className="page"><div className="page-heading"><div><div className="eyebrow">REVIEW / CAREER EVIDENCE</div><h1>复盘、面试与证据</h1><p>把真实运行结果翻译成复习任务、项目表达和面试材料。</p></div></div><div className="review-columns"><section><div className="panel-index">DUE REVIEWS</div><h2>到期复习</h2>{reviews.length ? reviews.map((item) => <article key={item.id}><strong>{item.knowledge_title}</strong><span>{item.due_date}</span></article>) : <div className="empty-state">暂无到期复习。完成测验后会按证据自动生成。</div>}</section><section><div className="panel-index">WEEKLY REVIEW</div><h2>周复盘</h2>{weekly.length ? weekly.map((item) => <article key={item.id}><strong>{item.title}</strong></article>) : <div className="empty-state">尚未填写周复盘。周日记录失败案例和“下周删掉什么”。</div>}</section><section><div className="panel-index">INTERVIEW CARDS</div><h2>面试卡片</h2>{interviews.length ? interviews.map((item) => <article key={item.id}><strong>{item.title}</strong></article>) : <div className="empty-state">暂无面试卡片。每张卡只回答一个问题，并关联项目指标。</div>}</section></div></section>;
}

