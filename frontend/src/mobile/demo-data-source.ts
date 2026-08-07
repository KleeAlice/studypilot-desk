import type {
  MobileCourse,
  MobileDocument,
  MobileDocumentSummary,
  MobileGraph,
  MobileNotebook,
  MobileStats,
  MobileToday,
  SourceStatus,
  StudyDataSource,
} from "./domain";

const courses: MobileCourse[] = [
  {
    id: "course-algorithm",
    title: "算法与工程进阶",
    subtitle: "建立能落地的算法直觉",
    unit: "第 4 单元 · 图与搜索",
    progress: 64,
    completedLessons: 18,
    totalLessons: 28,
    accent: "indigo",
  },
  {
    id: "course-ml-system",
    title: "机器学习系统",
    subtitle: "从实验到可靠服务",
    unit: "第 2 单元 · 数据闭环",
    progress: 37,
    completedLessons: 7,
    totalLessons: 19,
    accent: "mint",
  },
];

const todayByCourse: Record<string, MobileToday> = {
  "course-algorithm": {
    courseId: "course-algorithm",
    streakDays: 12,
    dailyProgress: 42,
    dailyGoal: 100,
    continueTitle: "最短路径的状态设计",
    continueDetail: "继续上次的图搜索笔记 · 约 8 分钟",
    tasks: [
      { id: "task-1", title: "复盘 Dijkstra 的松弛条件", kind: "review", durationMinutes: 6, completed: true, xp: 10 },
      { id: "task-2", title: "完成一道多源最短路练习", kind: "practice", durationMinutes: 18, completed: false, xp: 25 },
      { id: "task-3", title: "连接 BFS 与动态规划笔记", kind: "learn", durationMinutes: 10, completed: false, xp: 15 },
      { id: "task-4", title: "写下今天的一个易错点", kind: "review", durationMinutes: 4, completed: false, xp: 8 },
    ],
  },
  "course-ml-system": {
    courseId: "course-ml-system",
    streakDays: 12,
    dailyProgress: 24,
    dailyGoal: 100,
    continueTitle: "训练数据的版本边界",
    continueDetail: "继续数据闭环 · 约 12 分钟",
    tasks: [
      { id: "task-5", title: "梳理特征生成的输入契约", kind: "learn", durationMinutes: 12, completed: false, xp: 18 },
    ],
  },
};

const activeMinutes = [18, 0, 24, 36, 12, 0, 28, 14, 22, 31, 0, 26, 44, 19];
const stats: MobileStats = {
  streakDays: 12,
  activeDays: activeMinutes.map((minutes, index) => ({
    date: `2026-07-${String(index + 5).padStart(2, "0")}`,
    label: `${index + 5} 日`,
    active: minutes > 0,
    minutes,
  })),
  weeklyMinutes: 184,
  completionRate: 78,
  knowledgeNodes: 86,
  notebookCount: 5,
};

const notebooks: MobileNotebook[] = [
  {
    id: "notebook-graph",
    courseId: "course-algorithm",
    title: "图与搜索",
    subtitle: "路径、状态与剪枝",
    nodeCount: 18,
    mastery: 72,
    accent: "indigo",
  },
  {
    id: "notebook-complexity",
    courseId: "course-algorithm",
    title: "复杂度直觉",
    subtitle: "从约束反推方案",
    nodeCount: 11,
    mastery: 61,
    accent: "amber",
  },
];

const graphs: Record<string, MobileGraph> = {
  "notebook-graph": {
    notebookId: "notebook-graph",
    nodes: [
      { id: "node-bfs", title: "BFS", kind: "concept", description: "等权图上的层序扩张。", x: 52, y: 46, mastery: 88 },
      { id: "node-state", title: "状态建模", kind: "note", description: "把路径历史压缩进可判重状态。", x: 166, y: 30, mastery: 74 },
      { id: "node-dijkstra", title: "Dijkstra", kind: "concept", description: "以当前最短距离驱动扩张。", x: 164, y: 126, mastery: 67 },
      { id: "node-relax", title: "松弛", kind: "note", description: "用更短路径更新已知上界。", x: 282, y: 86, mastery: 76 },
      { id: "node-source", title: "算法讲义", kind: "source", description: "图搜索章节的原始资料。", x: 278, y: 170, mastery: 54 },
    ],
    edges: [
      { id: "edge-1", sourceId: "node-bfs", targetId: "node-state" },
      { id: "edge-2", sourceId: "node-state", targetId: "node-dijkstra" },
      { id: "edge-3", sourceId: "node-dijkstra", targetId: "node-relax" },
      { id: "edge-4", sourceId: "node-relax", targetId: "node-source" },
    ],
  },
  "notebook-complexity": {
    notebookId: "notebook-complexity",
    nodes: [
      { id: "node-time", title: "时间复杂度", kind: "concept", description: "输入规模增长时的计算成本。", x: 70, y: 80, mastery: 70 },
      { id: "node-space", title: "空间复杂度", kind: "concept", description: "额外存储随规模的增长。", x: 220, y: 110, mastery: 64 },
      { id: "node-bound", title: "约束", kind: "note", description: "从数据范围推断可接受数量级。", x: 148, y: 190, mastery: 82 },
    ],
    edges: [
      { id: "edge-c1", sourceId: "node-time", targetId: "node-bound" },
      { id: "edge-c2", sourceId: "node-space", targetId: "node-bound" },
    ],
  },
};

const documents: MobileDocument[] = [
  {
    id: "doc-graph-notes",
    courseId: "course-algorithm",
    title: "图搜索讲义",
    kind: "PDF",
    excerpt: "从层序遍历到带权最短路径的统一视角。",
    body: "图搜索的关键是明确状态、转移、边界与判重条件。",
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireItem<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

export function createDemoDataSource(): StudyDataSource {
  return {
    mode: "snapshot",
    async getSourceStatus(): Promise<SourceStatus> {
      return { mode: "snapshot", label: "离线快照", detail: "来自 Study PC", updatedAt: "今天 18:32" };
    },
    async listCourses() {
      return clone(courses);
    },
    async getCourse(id: string) {
      return clone(requireItem(courses.find((course) => course.id === id), `Unknown course: ${id}`));
    },
    async getToday(courseId: string) {
      return clone(requireItem(todayByCourse[courseId], `Unknown course: ${courseId}`));
    },
    async getStats() {
      return clone(stats);
    },
    async listNotebooks(courseId: string) {
      return clone(notebooks.filter((notebook) => notebook.courseId === courseId));
    },
    async getKnowledgeGraph(notebookId: string) {
      return clone(requireItem(graphs[notebookId], `Unknown notebook: ${notebookId}`));
    },
    async listDocuments(courseId: string): Promise<MobileDocumentSummary[]> {
      return clone(documents.filter((document) => document.courseId === courseId).map(({ body: _body, ...summary }) => summary));
    },
    async getDocument(id: string) {
      return clone(requireItem(documents.find((document) => document.id === id), `Unknown document: ${id}`));
    },
  };
}
