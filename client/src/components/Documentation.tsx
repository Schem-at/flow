import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Code, Box, Zap, Layers, Search, Menu, X } from 'lucide-react';

export function Documentation() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('introduction');

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-300 flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 w-full z-50 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="p-2 hover:bg-neutral-900 rounded-lg transition-colors"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <Box className="w-5 h-5 text-neutral-950" />
              </div>
              <span className="font-bold text-xl text-white tracking-tight">Flow Docs</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search documentation..." 
                className="bg-neutral-900 border border-neutral-800 rounded-lg py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:border-green-500 transition-colors w-64"
              />
            </div>
            <button 
              className="md:hidden p-2 hover:bg-neutral-900 rounded-lg"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-7xl mx-auto w-full flex relative">
        {/* Sidebar */}
        <aside className={`
          fixed md:sticky top-16 left-0 h-[calc(100vh-4rem)] w-64 bg-neutral-950 border-r border-neutral-800 
          transform transition-transform duration-300 z-40 overflow-y-auto
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="p-6 space-y-8">
            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Guide</h3>
              <ul className="space-y-2">
                <li>
                  <button 
                    onClick={() => scrollToSection('introduction')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'introduction' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Introduction
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => scrollToSection('building-flows')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'building-flows' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Building Your First Flow
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Core Concepts</h3>
              <ul className="space-y-2">
                <li>
                  <button 
                    onClick={() => scrollToSection('nodes')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'nodes' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Nodes & Logic
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => scrollToSection('data-types')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'data-types' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Data Types
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => scrollToSection('execution')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'execution' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Execution Flow
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Guides</h3>
              <ul className="space-y-2">
                <li>
                  <button 
                    onClick={() => scrollToSection('schematics')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'schematics' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Generating Schematics
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => scrollToSection('custom-nodes')}
                    className={`text-sm hover:text-white transition-colors text-left w-full ${activeSection === 'custom-nodes' ? 'text-green-400 font-medium' : ''}`}
                  >
                    Custom Nodes
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-12 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-16 pb-20">
            {/* Getting Started */}
            <section id="introduction" className="space-y-6 scroll-mt-24">
              <h1 className="text-4xl font-bold text-white">Introduction</h1>
              <p className="text-lg leading-relaxed text-neutral-400">
                Flow is a node-based visual environment for creating Minecraft schematics. Instead of placing blocks manually, you define <strong>logic</strong> that generates structures for you.
              </p>
              <p className="text-lg leading-relaxed text-neutral-400">
                It allows for complex math, geometry generation, and precise NBT manipulation that would be impossible or tedious to do by hand.
              </p>
            </section>

            {/* Building Flows */}
            <section id="building-flows" className="space-y-6 scroll-mt-24">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-500" /> Building Your First Flow
              </h2>
              <p className="leading-relaxed">
                Every flow follows a basic pattern: <strong>Input &rarr; Processing &rarr; Output</strong>.
              </p>
              
              <div className="space-y-6 mt-4">
                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">1. The Generator</h3>
                  <p className="text-neutral-400 mb-4">Start with a node that creates geometry. Drag a <strong>Shape Generator</strong> node onto the canvas.</p>
                  <div className="flex gap-2 text-sm">
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">Sphere</span>
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">Cuboid</span>
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">Cylinder</span>
                  </div>
                </div>

                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">2. Data Manipulation</h3>
                  <p className="text-neutral-400">Connect the geometry to modifiers. Use a <strong>Set Block</strong> node to define the material, or an <strong>NBT Merge</strong> node to add custom data to tile entities.</p>
                </div>

                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">3. Export</h3>
                  <p className="text-neutral-400">Finally, connect your result to a <strong>File Output</strong> node. This will let you download the final <code>.schem</code> file.</p>
                </div>
              </div>
            </section>

            {/* Nodes & Logic */}
            <section id="nodes" className="space-y-6 scroll-mt-24">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Layers className="w-6 h-6 text-purple-500" /> Nodes & Logic
              </h2>
              <p className="leading-relaxed">
                Flow uses a data-flow programming model. Data moves from left to right through connections (wires) between nodes.
              </p>
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div className="p-6 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                  <h3 className="font-bold text-white mb-2">Input Nodes</h3>
                  <p className="text-sm">Provide data to your flow, such as numbers, strings, or NBT structures.</p>
                </div>
                <div className="p-6 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                  <h3 className="font-bold text-white mb-2">Processing Nodes</h3>
                  <p className="text-sm">Manipulate data, perform calculations, or transform geometry.</p>
                </div>
              </div>
            </section>

             {/* Data Types */}
             <section id="data-types" className="space-y-6 scroll-mt-24">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Code className="w-6 h-6 text-blue-500" /> Data Types
              </h2>
              <p className="leading-relaxed">
                Flow supports strict typing for connections to ensure valid logic.
              </p>
              <ul className="space-y-3 mt-4">
                <li className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                  <span><strong className="text-white">Any:</strong> Universal type that accepts any connection.</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span><strong className="text-white">Number:</strong> Floating point or integer values.</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  <span><strong className="text-white">String:</strong> Text data.</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span><strong className="text-white">Object/NBT:</strong> Complex structured data.</span>
                </li>
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
