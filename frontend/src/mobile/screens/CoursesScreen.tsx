import type { MobileCourse } from "../domain";

export function CoursesScreen({ courses, headingRef }: {
  courses: MobileCourse[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="sp-mobile-screen sp-courses" aria-labelledby="sp-mobile-heading-courses">
      <p className="sp-mobile-eyebrow">COURSE LIBRARY / {courses.length}</p>
      <h1 id="sp-mobile-heading-courses" ref={headingRef} tabIndex={-1}>我的课程</h1>
      <p className="sp-screen-lede">把每门课程看成一条可继续的路径，而不是一堆待办。</p>
      <div className="sp-course-list">
        {courses.map((course, index) => (
          <button className={`sp-course-card sp-course-card--${course.accent} sp-tactile-card`} type="button" key={course.id}>
            <span className="sp-course-card__index">{String(index + 1).padStart(2, "0")}</span>
            <span className="sp-course-card__body">
              <small>{course.unit}</small>
              <strong>{course.title}</strong>
              <span>{course.subtitle}</span>
              <span
                className="sp-linear-progress"
                role="progressbar"
                aria-label={`${course.title}课程进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={course.progress}
              >
                <i style={{ width: `${course.progress}%` }} />
              </span>
              <span className="sp-course-card__meta">
                <b>{course.progress}%</b>
                <span>{course.completedLessons}/{course.totalLessons} 个学习节点</span>
              </span>
            </span>
            <span className="sp-course-card__arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
