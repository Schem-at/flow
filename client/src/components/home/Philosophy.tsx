import { Layers, Code, Database, Globe } from 'lucide-react';

export function Philosophy() {
  return (
    <section className="py-32 px-6 bg-[#0a0a0a] relative overflow-hidden border-t border-white/5">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none" />

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-neutral-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
            PHILOSOPHY
          </div>

          <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight text-white">Logic, Abstracted.</h2>
          
          <div className="space-y-6 text-neutral-400 text-lg leading-relaxed">
            <p>
              Building complex generators requires more than just placing blocks. Flow allows you to create 
              <span className="text-white font-semibold"> reusable logic units</span> (Subflows) that act like functions in code.
            </p>
            <p>
              Design your logic once, define your inputs (numbers, schematics, strings), and use it anywhere. It's not just a schematic generator; it's a visual programming language for spatial data.
            </p>
          </div>
          
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-mono text-green-400">
            <span className="px-3 py-1 bg-green-500/10 rounded border border-green-500/20 hover:bg-green-500/20 transition-colors cursor-default">.flow</span>
            <span className="px-3 py-1 bg-green-500/10 rounded border border-green-500/20 hover:bg-green-500/20 transition-colors cursor-default">.schem</span>
            <span className="px-3 py-1 bg-green-500/10 rounded border border-green-500/20 hover:bg-green-500/20 transition-colors cursor-default">JSON API</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FeatureCard 
            icon={Layers} 
            color="text-purple-400" 
            title="Recursive Subflows" 
            desc="Package complex logic into a single node. Nest flows infinitely."
          />
          <FeatureCard 
            icon={Code} 
            color="text-blue-400" 
            title="Synthase Script" 
            desc="Drop into JS when visual nodes aren't enough. Full AST control."
          />
          <FeatureCard 
            icon={Database} 
            color="text-yellow-400" 
            title="Strict Schemas" 
            desc="Type-safe inputs and outputs ensure your tools are robust."
          />
          <FeatureCard 
            icon={Globe} 
            color="text-green-400" 
            title="Instant API" 
            desc="Your flow becomes a REST endpoint automatically."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, color, title, desc, className = "" }: { icon: any, color: string, title: string, desc: string, className?: string }) {
  return (
    <div className={`h-full p-6 bg-[#0c0c0e] border border-white/10 rounded-xl hover:border-white/20 transition-all duration-300 group flex flex-col ${className}`}>
      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <h3 className="text-white font-bold mb-2">{title}</h3>
      <p className="text-neutral-400 text-sm leading-relaxed flex-1">{desc}</p>
    </div>
  );
}
