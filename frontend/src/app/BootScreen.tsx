import { useEffect, useState } from "react";


const stages = [
  {
    label: "正在启动本地服务",
    detail: "准备离线学习引擎与模型连接",
  },
  {
    label: "正在连接学习数据库",
    detail: "检查课程、资料与学习进度",
  },
  {
    label: "正在恢复课程与对话",
    detail: "整理上次离开时的学习现场",
  },
];

export function BootScreen() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, stages.length - 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="boot-screen" role="status" aria-live="polite">
      <section className="boot-shell">
        <header>
          <span className="boot-mark">SP</span>
          <div>
            <strong>StudyPilot Desk</strong>
            <small>LEARNING WORKSPACE</small>
          </div>
          <i aria-hidden="true" />
        </header>
        <div className="boot-preview" aria-hidden="true">
          <aside>
            <i />
            <i />
            <i />
            <i />
          </aside>
          <section>
            <span />
            <strong />
            <p />
            <p />
            <div>
              <i />
              <i />
              <i />
            </div>
          </section>
        </div>
        <footer>
          <div className="boot-stage-copy">
            <span className="boot-spinner" aria-hidden="true" />
            <div>
              <strong>{stages[stage].label}</strong>
              <small>{stages[stage].detail}</small>
            </div>
          </div>
          <ol aria-label="启动进度">
            {stages.map((item, index) => (
              <li
                key={item.label}
                className={index < stage ? "is-ready" : index === stage ? "is-active" : ""}
                aria-current={index === stage ? "step" : undefined}
              />
            ))}
          </ol>
          <p>窗口已就绪，学习数据正在后台装载</p>
        </footer>
      </section>
    </main>
  );
}
