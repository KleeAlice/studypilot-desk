export type ProductIconName = "network" | "matrix" | "python" | "research" | "book" | "dashboard" | "roadmap" | "library" | "review";

export function ProductIcon({ name, className = "product-icon" }: { name: ProductIconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === "network" && <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="13" cy="18" r="2.2" /><path d="m8.2 6.8 7.6-.6M7.4 9l4.2 6.8m4.8-7.7-2.2 7.7" /></>}
    {name === "matrix" && <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>}
    {name === "python" && <><path d="M8 5.5c0-1 1-1.8 2-1.8h4c1.1 0 2 .9 2 2v4.2H9.5a3.5 3.5 0 0 0-3.5 3.5v1.1" /><path d="M16 18.5c0 1-1 1.8-2 1.8h-4a2 2 0 0 1-2-2v-4.2h6.5a3.5 3.5 0 0 0 3.5-3.5V9.5" /><circle cx="11" cy="6.7" r=".6" fill="currentColor" stroke="none" /><circle cx="13" cy="17.3" r=".6" fill="currentColor" stroke="none" /></>}
    {name === "research" && <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5M8.3 10.5h4.4m-2.2-2.2v4.4" /></>}
    {name === "book" && <><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h5v16H7a2.5 2.5 0 0 0-2.5 2z" /><path d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-5v16h5a2.5 2.5 0 0 1 2.5 2z" /></>}
    {name === "dashboard" && <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="4" rx="2" /><rect x="13" y="10" width="7" height="10" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /></>}
    {name === "roadmap" && <><path d="M5 20V5" /><path d="M5 6c4-3 8 3 14-1v9c-6 4-10-2-14 1" /></>}
    {name === "library" && <><path d="M4.5 5.5h4v14h-4zM10 4.5h4v15h-4zM15.6 6l3.5-1 3 13.5-3.5 1z" /></>}
    {name === "review" && <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2M5 5l2 2m12-2-2 2" /></>}
  </svg>;
}
