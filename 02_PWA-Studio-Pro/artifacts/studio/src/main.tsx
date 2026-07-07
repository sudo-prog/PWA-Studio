import { createRoot } from "react-dom/client";
import App from "./App";
import { setBaseUrl } from "@workspace/api-client-react";
import "./index.css";

// Wire the API base URL at runtime. Defaults to same-origin ("/") so the SPA
// works behind a proxy that serves both the static frontend and the API.
// On a Vercel-only deploy of the frontend, set VITE_API_BASE_URL to the
// URL of a separately hosted API server (see vercel.json / README).
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "";
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
