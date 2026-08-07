import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileApp } from "./MobileApp";
import { createDemoDataSource } from "./demo-data-source";
import "./styles.css";

const root = document.getElementById("mobile-root");
if (!root) throw new Error("StudyPilot Mobile root is missing");

createRoot(root).render(
  <StrictMode>
    <MobileApp source={createDemoDataSource()} />
  </StrictMode>,
);
