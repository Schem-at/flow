/**
 * Flow - Visual Schematic Script Editor
 * Part of schemat.io
 */

import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './components/editor/Editor';
import { Home } from './components/Home';
import { FlowRunner } from './components/FlowRunner';
import { ModuleManager } from './components/ModuleManager';
import Workbench from './components/Workbench';
import { DocsModal } from './components/editor/DocsModal';

const queryClient = new QueryClient();

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ReactFlowProvider>
				<BrowserRouter>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/workbench" element={<Workbench />} />
						<Route path="/modules" element={<ModuleManager />} />
						<Route path="/editor" element={<Editor />} />
						<Route path="/editor/:flowId" element={<Editor />} />
						<Route path="/run/:flowId" element={<FlowRunner />} />
						<Route path="/flow/:flowId" element={<Editor />} />
					</Routes>
					{/* Global, event-driven (flow:open-docs / ⌘⇧D) API reference */}
					<DocsModal />
				</BrowserRouter>
			</ReactFlowProvider>
		</QueryClientProvider>
	);
}

export default App;
