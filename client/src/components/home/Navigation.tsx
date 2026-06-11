import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Github } from 'lucide-react';

export function Navigation() {
  const location = useLocation();
  const isEditor = location.pathname === '/editor';

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo Section */}
        <Link 
          to="/" 
          className="flex items-center gap-3 group focus:outline-none"
          aria-label="Go to homepage"
        >
          <div className="relative w-8 h-8 flex items-center justify-center">
            {/* Glow effect behind logo on hover */}
            <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <svg 
              viewBox="0 0 100 100" 
              fill="none" 
              className="w-full h-full relative z-10 transition-transform duration-300 group-hover:scale-105"
            >
              {/* Passive Nodes */}
              <rect x="24" y="24" width="16" height="16" rx="4" className="fill-neutral-800 transition-colors group-hover:fill-neutral-700" />
              <rect x="24" y="48" width="16" height="16" rx="4" className="fill-neutral-800 transition-colors group-hover:fill-neutral-700" />
              <rect x="24" y="72" width="16" height="16" rx="4" className="fill-neutral-800 transition-colors group-hover:fill-neutral-700" />
              <rect x="48" y="24" width="16" height="16" rx="4" className="fill-neutral-800 transition-colors group-hover:fill-neutral-700" />
              <rect x="48" y="48" width="16" height="16" rx="4" className="fill-neutral-800 transition-colors group-hover:fill-neutral-700" />
              
              {/* Active Output Node */}
              <rect x="72" y="24" width="16" height="16" rx="4" className="fill-green-500/20 stroke-green-500" strokeWidth="1.5" />
              
              {/* Connections */}
              <path d="M40 32 H48 M64 32 H72 M40 56 H48 M32 40 V48 M32 64 V72" className="stroke-neutral-700 group-hover:stroke-neutral-500 transition-colors" strokeWidth="2" />
            </svg>
          </div>
        </Link>
        
        {/* Right Actions */}
        <div className="flex items-center gap-4 sm:gap-6">
          <a 
            href="https://github.com/Nano112/flow" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hidden md:flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors group"
          >
            <Github className="w-4 h-4 transition-transform group-hover:rotate-12" />
            <span>GitHub</span>
          </a>

          {/* Vertical Divider */}
          <div className="hidden md:block w-px h-4 bg-white/10" />

          {/* CTA Button */}
          {!isEditor && (
            <Link 
              to="/editor"
              className="group relative inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-black text-sm font-semibold rounded-lg overflow-hidden transition-all hover:bg-green-400 hover:shadow-[0_0_20px_-5px_rgba(74,222,128,0.6)] active:scale-95"
            >
              {/* Shine effect container */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
              
              <span>Open Editor</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}

          {/* If inside editor, show a different state (optional) */}
          {isEditor && (
             <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-mono text-green-400">Editor Active</span>
             </div>
          )}
        </div>
      </div>
    </nav>
  );
}