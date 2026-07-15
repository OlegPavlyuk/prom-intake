import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@medplum/react/styles.css";
import { App } from "./App";
import { medplum } from "./medplum";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

createRoot(container).render(
  <StrictMode>
    <App medplum={medplum} />
  </StrictMode>
);
