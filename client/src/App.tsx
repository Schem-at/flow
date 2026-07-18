/**
 * Flow - Visual Schematic Script Editor
 * Part of schemat.io
 */

import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './components/editor/Editor';
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary';
import { Home } from './components/Home';
import { FlowRunner } from './components/FlowRunner';
import { ModuleManager } from './components/ModuleManager';
import { ReviewQueue } from './components/ReviewQueue';
import Workbench from './components/Workbench';
import { DocsModal } from './components/editor/DocsModal';
import { Toaster } from './components/Toaster';
import { toast } from './lib/toast';
import { features } from './config/features';

const queryClient = new QueryClient();

function App() {
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
					<Routes>
						<Route path="/" element={<Home />} />
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
					</Routes>
					{/* Global, event-driven (flow:open-docs / ⌘⇧D) API reference */}
					<DocsModal />
					{/* Global toast surface (auth failures, etc.) */}
					<Toaster />
				</BrowserRouter>
			</ReactFlowProvider>
		</QueryClientProvider>
	);
}

export default App;
