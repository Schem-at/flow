import { loadRoute } from './lib/loadRoute';
/**
 * Flow - Visual Schematic Script Editor
 * Part of schemat.io
 */

import { useEffect, useState, lazy, Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
const Editor = lazy(() => loadRoute(() => import('./components/editor/Editor')).then(m => ({ default: m.Editor })));
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary';
const ToolCatalogue = lazy(() => loadRoute(() => import("./components/ToolCatalogue")).then(m => ({ default: m.ToolCatalogue })));
const Home = lazy(() => loadRoute(() => import('./components/Home')).then(m => ({ default: m.Home })));
const FlowRunner = lazy(() => loadRoute(() => import('./components/FlowRunner')).then(m => ({ default: m.FlowRunner })));
const ModuleManager = lazy(() => loadRoute(() => import('./components/ModuleManager')).then(m => ({ default: m.ModuleManager })));
const ReviewQueue = lazy(() => loadRoute(() => import('./components/ReviewQueue')).then(m => ({ default: m.ReviewQueue })));
const Workbench = lazy(() => loadRoute(() => import('./components/Workbench')));
const DocsModal = lazy(() => loadRoute(() => import('./components/editor/DocsModal')).then(m => ({ default: m.DocsModal })));
import { Toaster } from './components/Toaster';
import { toast } from './lib/toast';
import { features } from './config/features';

const queryClient = new QueryClient();

function App() {
 const [docsLoaded, setDocsLoaded] = useState(false);
 useEffect(() => { const open = () => setDocsLoaded(true); const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); open(); } }; window.addEventListener("flow:open-docs", open); window.addEventListener("keydown", key); return () => { window.removeEventListener("flow:open-docs", open); window.removeEventListener("keydown", key); }; }, []);
	// Surface auth failures: any request that comes back 401/403 raises a toast,
	// so a signed-out run/load isn't a silent failure. The auth PROBE itself
	// (`/api/user`) legitimately 401s when signed out — exclude it.
	useEffect(() => {
		const orig = window.fetch.bind(window);
		let last = 0;
		window.fetch = (async (...args: Parameters<typeof orig>) => {
			const res = await orig(...args);
			const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url ?? '';
			if ((res.status === 401 || res.status === 403) && !url.includes('/api/user') && Date.now() - last > 4000) {
				last = Date.now();
				const schemati = import.meta.env.VITE_SCHEMATI_URL || 'https://schemati.test';
				toast('Authentication required — sign in to use this.', 'error', {
					href: `${schemati}/login?redirect=${encodeURIComponent(window.location.href)}`,
					hrefLabel: 'Sign in',
				});
			}
			return res;
		}) as typeof window.fetch;
		return () => {
			window.fetch = orig;
		};
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<ReactFlowProvider>
				<BrowserRouter>
					<EditorErrorBoundary><Suspense fallback={<div role="status" className="p-12 text-neutral-400">Loading tools…</div>}><Routes>
						<Route path="/" element={<ToolCatalogue />} /><Route path="/mine" element={<Home />} />
						<Route path="/workbench" element={<Workbench />} />
						{features.modules && <Route path="/modules" element={<ModuleManager />} />}
						{/* Admin moderation queue (self-gates to admins). */}
						<Route path="/review" element={<ReviewQueue />} />
						{/* Top-level boundary so a non-node editor crash shows a
						    recoverable error screen with a reload button, not a white page. */}
						<Route path="/editor" element={<EditorErrorBoundary><Editor /></EditorErrorBoundary>} />
						<Route path="/editor/:flowId" element={<EditorErrorBoundary><Editor /></EditorErrorBoundary>} />
						{/* Run-as-tool player (read-only). Supports ?example=<id>. */}
						<Route path="/run" element={<FlowRunner />} />
						<Route path="/run/:flowId" element={<FlowRunner />} />
						{/* Chromeless embed player for <iframe>. Supports ?example=<id>. */}
						<Route path="/embed" element={<FlowRunner embed />} />
						<Route path="/embed/:flowId" element={<FlowRunner embed />} />
						<Route path="/flow/:flowId" element={<EditorErrorBoundary><Editor /></EditorErrorBoundary>} />
					</Routes></Suspense></EditorErrorBoundary>
					{/* Global, event-driven (flow:open-docs / ⌘⇧D) API reference */}
					{docsLoaded && <Suspense fallback={null}><DocsModal initiallyOpen /></Suspense>}
					{/* Global toast surface (auth failures, etc.) */}
					<Toaster />
				</BrowserRouter>
			</ReactFlowProvider>
		</QueryClientProvider>
	);
}

export default App;
