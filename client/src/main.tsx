import "./lib/cryptoPolyfill";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";

// Dev-only: load the eruda mobile console. Guarded by import.meta.env.DEV so the
// dead branch is tree-shaken out of production builds — no dev tools ship to prod.
if (import.meta.env.DEV) {
	const s = document.createElement("script");
	s.src = "https://cdn.jsdelivr.net/npm/eruda";
	s.onload = () =>
		(window as unknown as { eruda?: { init(): void } }).eruda?.init();
	document.head.appendChild(s);
}

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error(
		"Root element not found. Check if it's in your index.html or if the id is correct.",
	);
}
createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
);
