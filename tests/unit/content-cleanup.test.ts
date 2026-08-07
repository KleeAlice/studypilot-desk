import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("content-first screens do not render the removed explanatory microcopy", () => {
  const paths = [
    "frontend/src/components/TitleBar.tsx",
    "frontend/src/features/CourseLibrary.tsx",
    "frontend/src/features/Roadmap.tsx",
    "frontend/src/features/NotebookLibrary.tsx",
    "frontend/src/features/Knowledge.tsx",
    "frontend/src/document/DocumentWorkspace.tsx",
    "frontend/src/features/Lab.tsx",
  ];
  const source = paths.map((path) => readFileSync(resolve(path), "utf8")).join("\n");
  for (const removed of [
    "半年算法转向学习操作系统",
    "先选择你此刻要投入的世界，再进入任务、知识、资料与实验。",
    "周计划可以调整，阶段出口必须由证据通过。",
    "先在知识画布建立概念、便签和引用；路线编排可以随后补充。",
    "每本笔记都是一个独立的思考空间；打开后再进入导图与自由画布。",
    "修改保留为可撤销修订",
    "像使用桌面 IDE 一样选择环境、编写测试，并复盘每次运行。",
  ]) expect(source).not.toContain(removed);
});
