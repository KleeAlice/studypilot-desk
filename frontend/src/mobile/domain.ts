export type DataMode = "live" | "snapshot";

export type SourceStatus = {
  mode: DataMode;
  label: string;
  detail: string;
  updatedAt: string;
};

export type MobileCourse = {
  id: string;
  title: string;
  subtitle: string;
  unit: string;
  progress: number;
  completedLessons: number;
  totalLessons: number;
  accent: "indigo" | "mint" | "amber";
};

export type MobileTask = {
  id: string;
  title: string;
  kind: "learn" | "review" | "practice";
  durationMinutes: number;
  completed: boolean;
  xp: number;
};

export type MobileToday = {
  courseId: string;
  streakDays: number;
  dailyProgress: number;
  dailyGoal: number;
  continueTitle: string;
  continueDetail: string;
  tasks: MobileTask[];
};

export type ActivityDay = {
  date: string;
  label: string;
  active: boolean;
  minutes: number;
};

export type MobileStats = {
  streakDays: number;
  activeDays: ActivityDay[];
  weeklyMinutes: number;
  completionRate: number;
  knowledgeNodes: number;
  notebookCount: number;
};

export type MobileNotebook = {
  id: string;
  courseId: string;
  title: string;
  subtitle: string;
  nodeCount: number;
  mastery: number;
  accent: "indigo" | "mint" | "amber";
};

export type MobileGraphNode = {
  id: string;
  title: string;
  kind: "concept" | "note" | "source";
  description: string;
  x: number;
  y: number;
  mastery: number;
};

export type MobileGraph = {
  notebookId: string;
  nodes: MobileGraphNode[];
  edges: Array<{ id: string; sourceId: string; targetId: string }>;
};

export type MobileDocumentSummary = {
  id: string;
  courseId: string;
  title: string;
  kind: string;
  excerpt: string;
};

export type MobileDocument = MobileDocumentSummary & {
  body: string;
};

export interface StudyDataSource {
  readonly mode: DataMode;
  getSourceStatus(): Promise<SourceStatus>;
  listCourses(): Promise<MobileCourse[]>;
  getCourse(id: string): Promise<MobileCourse>;
  getToday(courseId: string): Promise<MobileToday>;
  getStats(courseId: string): Promise<MobileStats>;
  listNotebooks(courseId: string): Promise<MobileNotebook[]>;
  getKnowledgeGraph(notebookId: string): Promise<MobileGraph>;
  listDocuments(courseId: string): Promise<MobileDocumentSummary[]>;
  getDocument(id: string): Promise<MobileDocument>;
}
