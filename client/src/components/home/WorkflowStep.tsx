interface WorkflowStepProps {
  number: string;
  title: string;
  desc: string;
  code: string;
  isCenter?: boolean;
}

export function WorkflowStep({ number, title, desc, code, isCenter }: WorkflowStepProps) {
  return (
    <div className={`relative group ${isCenter ? 'lg:-translate-y-4' : ''}`}>
      {/* Glow effect for center card */}
      {isCenter && (
        <div className="absolute -inset-0.5 bg-green-500/20 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
      )}
      
      <div className={`
        relative h-full rounded-xl p-6 border transition-all duration-300
        ${isCenter 
          ? 'bg-[#0c0c0e] border-green-500/30 shadow-[0_0_30px_-10px_rgba(74,222,128,0.1)]' 
          : 'bg-[#0c0c0e] border-white/10 hover:border-white/20'
        }
      `}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center font-mono text-sm font-bold border
            ${isCenter
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-white/5 text-neutral-400 border-white/10'
            }
          `}>
            {number}
          </div>
          <h3 className={`text-lg font-bold ${isCenter ? 'text-white' : 'text-neutral-200'}`}>
            {title}
          </h3>
        </div>

        {/* Description */}
        <p className="text-neutral-400 text-sm leading-relaxed mb-6 min-h-[3rem]">
          {desc}
        </p>
        
        {/* Code Block */}
        <div className="bg-[#050505] rounded-lg border border-white/5 p-4 overflow-hidden relative group/code">
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:250%_250%] animate-shine pointer-events-none" />
          <pre className="font-mono text-[10px] leading-relaxed text-neutral-300 overflow-x-auto scrollbar-hide">
            {code}
          </pre>
        </div>
      </div>
    </div>
  );
}
