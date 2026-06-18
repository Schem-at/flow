/**
 * Flow - Visual Schematic Script Editor
 * Part of schemat.io
 */

import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './components/editor/Editor';
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary';
import { Home } from './components/Home';
import { FlowRunner } from './components/FlowRunner';
import { ModuleManager } from './components/ModuleManager';
import Workbench from './components/Workbench';
import { DocsModal } from './components/editor/DocsModal';
import { features } from './config/features';

const queryClient = new QueryClient();

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ReactFlowProvider>
				<BrowserRouter>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/workbench" element={<Workbench />} />
						{features.modules && <Route path="/modules" element={<ModuleManager />} />}
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
				</BrowserRouter>
			</ReactFlowProvider>
		</QueryClientProvider>
	);
}

export default App;
