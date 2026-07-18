export const COURSE_COVER_PRESETS = [
  { id: "cobalt", label: "海盐蓝" },
  { id: "indigo", label: "靛夜紫" },
  { id: "moss", label: "苔原绿" },
  { id: "ember", label: "赤陶棕" },
  { id: "plum", label: "暮莓紫" },
  { id: "sand", label: "琥珀茶" },
] as const;

export type CourseCoverPreset = typeof COURSE_COVER_PRESETS[number]["id"];
