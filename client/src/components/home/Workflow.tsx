import { WorkflowStep } from './WorkflowStep';

export function Workflow() {
  return (
    <section className="py-32 px-6 bg-[#0a0a0a] relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none" />
      
      {/* Top Gradient Line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent"></div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-24">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-neutral-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            WORKFLOW
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight text-white">From Flow to Endpoint</h2>
          <p className="text-neutral-400 max-w-2xl mx-auto text-lg">
            Design your logic visually, then consume it programmatically. The bridge between Minecraft creativity and external APIs.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
          {/* Connecting Lines (Desktop) */}
          <svg className="hidden lg:block absolute top-1/2 left-0 w-full h-24 -translate-y-1/2 pointer-events-none z-0 overflow-visible">
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#333" stopOpacity="0" />
                <stop offset="50%" stopColor="#4ade80" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#333" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Line 1 -> 2 */}
            <path d="M 300 48 C 350 48, 350 48, 400 48" stroke="url(#lineGradient)" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
            {/* Line 2 -> 3 */}
            <path d="M 800 48 C 850 48, 850 48, 900 48" stroke="url(#lineGradient)" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
          </svg>

          <WorkflowStep 
            number="01"
            title="Define Inputs"
            desc="Set up your flow schema. Accept Integers, Strings, Booleans, or even File uploads (Schematics/NBT)."
            code={`{
  "radius": "number",
  "material": "string",
  "template": "file"
}`}
          />

          <WorkflowStep 
            number="02"
            title="Process Logic"
            desc="Use 50+ built-in nodes or write custom scripts to manipulate data, generate geometry, and merge NBT."
            isCenter={true}
            code={`// Visual Flow Execution
Running Node: SphereGenerator
Running Node: NBTMerge
Subflow: 'TreeGenerator'
> Completed in 12ms`}
          />

          <WorkflowStep 
            number="03"
            title="Call API"
            desc="Your flow is instantly available as a POST endpoint. Send JSON, receive the processed file or data."
            code={`curl -X POST /api/run/flow-id \\
  -d '{"radius": 32}' \\
  -o output.schem`}
          />
        </div>
      </div>
    </section>
  );
}
