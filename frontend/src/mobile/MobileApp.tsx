import { useEffect, useRef, useState } from "react";
import type { MobileCourse, MobileGraph, MobileNotebook, MobileStats, MobileToday, SourceStatus, StudyDataSource } from "./domain";
import { BottomNav, type MobileDestination } from "./components/BottomNav";
import { SourcePill } from "./components/SourcePill";
import { HomeScreen } from "./screens/HomeScreen";
import { CoursesScreen } from "./screens/CoursesScreen";
import { NotesScreen } from "./screens/NotesScreen";
import { StatsScreen } from "./screens/StatsScreen";

export function MobileApp({ source }: { source: StudyDataSource }) {
  const [destination, setDestination] = useState<MobileDestination>("home");
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [course, setCourse] = useState<MobileCourse | null>(null);
  const [courses, setCourses] = useState<MobileCourse[]>([]);
  const [today, setToday] = useState<MobileToday | null>(null);
  const [stats, setStats] = useState<MobileStats | null>(null);
  const [notebooks, setNotebooks] = useState<MobileNotebook[]>([]);
  const [graph, setGraph] = useState<MobileGraph | null>(null);
  const [loadError, setLoadError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([source.getSourceStatus(), source.listCourses()]).then(async ([nextStatus, nextCourses]) => {
      const nextCourse = nextCourses[0];
      const [nextToday, nextStats, nextNotebooks] = await Promise.all([
        source.getToday(nextCourse.id),
        source.getStats(nextCourse.id),
        source.listNotebooks(nextCourse.id),
      ]);
      const nextGraph = await source.getKnowledgeGraph(nextNotebooks[0].id);
      if (!active) return;
      setStatus(nextStatus);
      setCourse(nextCourse);
      setCourses(nextCourses);
      setToday(nextToday);
      setStats(nextStats);
      setNotebooks(nextNotebooks);
      setGraph(nextGraph);
    }).catch(() => {
      if (active) setLoadError("暂时无法读取学习快照");
    });
    return () => { active = false; };
  }, [source]);

  useEffect(() => {
    if (status) headingRef.current?.focus();
  }, [destination, status]);

  if (loadError) {
    return <main className="sp-mobile sp-mobile--center"><p role="alert">{loadError}</p></main>;
  }

  if (!status || !course || !today || !stats || !graph) {
    return (
      <main className="sp-mobile sp-mobile--center" aria-label="正在载入学习快照">
        <div className="sp-mobile-loader" aria-hidden="true" />
        <p>正在整理今天的学习路径…</p>
      </main>
    );
  }

  return (
    <div className="sp-mobile">
      <header className="sp-mobile-topbar">
        <a className="sp-mobile-brand" href="#main-content" aria-label="StudyPilot Mobile 首页">
          <span>SP</span>
          <strong>StudyPilot</strong>
        </a>
        <SourcePill status={status} />
      </header>
      <main id="main-content" className="sp-mobile-main">
        <div key={destination}>
          {destination === "home" ? (
            <HomeScreen course={course} today={today} headingRef={headingRef} />
          ) : destination === "courses" ? (
            <CoursesScreen courses={courses} headingRef={headingRef} />
          ) : destination === "notes" ? (
            <NotesScreen notebooks={notebooks} graph={graph} headingRef={headingRef} />
          ) : (
            <StatsScreen stats={stats} headingRef={headingRef} />
          )}
        </div>
      </main>
      <BottomNav active={destination} onChange={setDestination} />
    </div>
  );
}
