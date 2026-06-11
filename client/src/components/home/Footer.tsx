import { Workflow } from 'lucide-react';

export function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-white/5 text-center md:text-left">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2 text-neutral-400">
          <Workflow className="w-4 h-4" />
          <span className="text-sm">Flow &copy; 2025</span>
        </div>
        <div className="text-sm text-neutral-500">
          Built for the <span className="text-neutral-300">Technical Minecraft</span> community.
        </div>
      </div>
    </footer>
  );
}
