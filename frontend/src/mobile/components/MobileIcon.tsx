export type MobileIconName = "home" | "courses" | "notes" | "stats" | "cloud";

const paths: Record<MobileIconName, string[]> = {
  home: ["M3.5 10.5 12 3l8.5 7.5", "M5.5 9.5v10h13v-10", "M9.5 19.5v-6h5v6"],
  courses: ["M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z", "M4 5.5v15", "M8 7h8", "M8 11h6"],
  notes: ["M5 4h14v16H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
  stats: ["M5 19V9", "M12 19V4", "M19 19v-7", "M3 19.5h18"],
  cloud: ["M7.5 18H18a4 4 0 0 0 .4-8A6.5 6.5 0 0 0 6 8.5 4.8 4.8 0 0 0 7.5 18Z"],
};

export function MobileIcon({ name, size = 22 }: { name: MobileIconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths[name].map((path) => (
        <path key={path} d={path} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
