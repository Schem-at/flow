import { useState, useEffect, useRef } from 'react';
import anime from 'animejs';
import { Globe, Settings2, Cpu } from 'lucide-react';

// --- CONSTANTS ---
const NODE_WIDTH = 180;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 64;
const PREVIEW_HEIGHT = 144;

// The internal resolution of our canvas
const GRAPH_W = 800;
const GRAPH_H = 450;

const GRAPH = {
  width: GRAPH_W,
  height: GRAPH_H,
  nodes: {
    input: { x: 40, y: 100 },
    logic: { x: 310, y: 50 },
    output: { x: 600, y: 120 },
  },
};

const getPortY = (nodeY: number, rowIndex: number, extraOffset = 0) => {
  return nodeY + HEADER_HEIGHT + (rowIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2) + extraOffset;
};

export function MockFlowGraph() {
  const [radius, setRadius] = useState(32);
  const [material, setMaterial] = useState('wireframe');
  // @ts-ignore
  const [isHovered, setIsHovered] = useState(false);

  // Responsive Scaling Logic
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        // Calculate ratio between available width and graph width
        const availableWidth = containerRef.current.offsetWidth;
        // Limit max scale to 1 (don't stretch on huge screens), allow shrinking
        const newScale = Math.min(availableWidth / GRAPH_W, 1);
        setScale(newScale);
      }
    };

    // Initial calc
    handleResize();

    // Listen for window resize
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- ANIMATIONS ---
  useEffect(() => {
    anime({
      targets: '.flow-line',
      strokeDashoffset: [anime.setDashoffset, 0],
      easing: 'linear',
      duration: 1500,
      loop: true,
    });

    anime({
      targets: '.port-ring',
      scale: [0.8, 1.4],
      opacity: [0.5, 0],
      easing: 'easeOutSine',
      duration: 2000,
      loop: true,
    });
  }, []);

  useEffect(() => {
    anime({
      targets: '.signal-burst',
      strokeDashoffset: [anime.setDashoffset, 0],
      easing: 'easeOutExpo',
      duration: 600,
      opacity: [1, 0]
    });
  }, [radius, material]);

  // --- WIRE COORDINATES ---
  const wires = [
    {
      x1: GRAPH.nodes.input.x + NODE_WIDTH,
      y1: getPortY(GRAPH.nodes.input.y, 0),
      x2: GRAPH.nodes.logic.x,
      y2: getPortY(GRAPH.nodes.logic.y, 0),
      color: '#a855f7'
    },
    {
      x1: GRAPH.nodes.input.x + NODE_WIDTH,
      y1: getPortY(GRAPH.nodes.input.y, 1),
      x2: GRAPH.nodes.logic.x,
      y2: getPortY(GRAPH.nodes.logic.y, 1),
      color: '#22c55e'
    },
    {
      x1: GRAPH.nodes.logic.x + NODE_WIDTH,
      y1: getPortY(GRAPH.nodes.logic.y, 2, PREVIEW_HEIGHT),
      x2: GRAPH.nodes.output.x,
      y2: getPortY(GRAPH.nodes.output.y, 0),
      color: '#3b82f6'
    }
  ];

  return (
    <div>
      <div className="relative rounded-2xl border border-white/10 bg-[#0a0a0c] shadow-2xl shadow-black/50 overflow-hidden">

        <div className="h-11 border-b border-white/5 bg-[#111113] flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white/10 hover:bg-red-500/80 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-white/10 hover:bg-yellow-500/80 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-white/10 hover:bg-green-500/80 transition-colors" />
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-md border border-green-500/20">
              10/10 computed
            </span>
            <span className="text-neutral-500">API Mode</span>
          </div>
        </div>

        <div className="relative aspect-[16/9] bg-[#08080a]">
          {/* Dot grid pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff12_1px,transparent_1px)] [background-size:24px_24px]" />

          <div
            ref={containerRef}
            className="relative select-none group/canvas mx-auto"
            style={{
              width: '100%',
              maxWidth: `${GRAPH_W}px`,
              // Dynamic height based on the scale to prevent whitespace below
              height: `${GRAPH_H * scale}px`,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >

            {/* SCALING LAYER: This holds the fixed 800x450 system and shrinks it */}
            <div
              style={{
                width: GRAPH_W,
                height: GRAPH_H,
                transform: `scale(${scale})`,
                transformOrigin: 'top left', // Scale from the corner
              }}
              className="relative"
            >
              {/* SVG WIRE LAYER */}
              <svg
                viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
                className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
              >
                <defs>
                  <filter id="glow-fx" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {wires.map((wire, i) => (
                  <Wire key={i} {...wire} />
                ))}
              </svg>

              {/* NODES LAYER */}
              <div className="absolute inset-0 w-full h-full">

                {/* --- NODE 1: INPUT --- */}
                <Node
                  x={GRAPH.nodes.input.x}
                  y={GRAPH.nodes.input.y}
                  title="Scene Data"
                  icon={Settings2}
                  accent="purple"
                >
                  <NodeRow>
                    <div className="flex-1 w-0">
                      <div className="flex justify-between text-[9px] uppercase tracking-wider text-neutral-500 font-mono mb-1">
                        <span>Radius</span>
                        <span className="text-purple-400">{radius}</span>
                      </div>
                      <input
                        type="range" min="10" max="60" value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        // Added touch-action-none to prevent scrolling while dragging slider on mobile
                        className="w-full h-1 bg-neutral-800 rounded-full appearance-none accent-purple-500 cursor-pointer touch-none"
                      />
                    </div>
                    <Port position="right" color="purple" />
                  </NodeRow>

                  <NodeRow>
                    <div className="flex-1 w-full">
                      <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono mb-1">Material</div>
                      <div className="grid grid-cols-2 gap-1 w-full pr-1">
                        {['wireframe', 'solid'].map(m => (
                          <button
                            key={m}
                            onClick={() => setMaterial(m)}
                            className={`
                        text-[9px] uppercase py-1 px-1 rounded border transition-all text-center
                        ${material === m
                                ? 'bg-neutral-800 text-white border-neutral-600'
                                : 'text-neutral-600 border-transparent hover:text-neutral-400 hover:bg-white/5'}
                      `}
                          >
                            {m === 'wireframe' ? 'Wire' : 'Solid'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Port position="right" color="green" />
                  </NodeRow>
                </Node>


                {/* --- NODE 2: LOGIC --- */}
                <Node
                  x={GRAPH.nodes.logic.x}
                  y={GRAPH.nodes.logic.y}
                  title="Generator"
                  icon={Cpu}
                  accent="blue"
                >
                  <NodeRow>
                    <Port position="left" color="purple" />
                    <div className="flex-1 text-[10px] text-neutral-500 font-mono pl-2 truncate">
                      in_radius <span className="text-purple-500">({radius})</span>
                    </div>
                  </NodeRow>

                  <NodeRow>
                    <Port position="left" color="green" />
                    <div className="flex-1 text-[10px] text-neutral-500 font-mono pl-2 truncate">
                      in_material
                    </div>
                  </NodeRow>

                  <div className="h-32 mx-3 my-2 bg-black rounded border border-neutral-800 relative flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                    <svg width="100%" height="100%" className="overflow-visible">
                      <circle
                        cx="50%" cy="50%" r={radius}
                        fill={material === 'solid' ? '#3b82f6' : 'none'}
                        fillOpacity={0.8}
                        stroke="#3b82f6" strokeWidth="2"
                        className="transition-all duration-300 ease-out"
                        filter="url(#glow-fx)"
                      />
                    </svg>
                  </div>

                  <NodeRow>
                    <div className="flex-1 text-right text-[10px] text-neutral-500 font-mono pr-2">
                      mesh_out
                    </div>
                    <Port position="right" color="blue" />
                  </NodeRow>
                </Node>


                {/* --- NODE 3: OUTPUT --- */}
                <Node
                  x={GRAPH.nodes.output.x}
                  y={GRAPH.nodes.output.y}
                  title="API Output"
                  icon={Globe}
                  accent="emerald"
                >
                  <NodeRow>
                    <Port position="left" color="blue" />
                    <div className="flex-1 pl-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] text-emerald-500 font-bold">200 OK</span>
                      </div>
                    </div>
                  </NodeRow>

                  <div className="p-3 pt-0">
                    <div className="bg-black/50 border border-neutral-800 rounded p-2 font-mono text-[9px] leading-4 text-neutral-400 overflow-hidden">
                      <div>{'{'}</div>
                      <div className="pl-2 text-emerald-400">"status": "ok",</div>
                      <div className="pl-2">"rad": <span className="text-purple-400">{radius}.0</span>,</div>
                      <div className="pl-2">"tris": {Math.floor(radius * 12.4)}</div>
                      <div>{'}'}</div>
                    </div>
                  </div>
                </Node>

              </div>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0a0c] to-transparent pointer-events-none" />

        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function Wire({ x1, y1, x2, y2, color }: any) {
  const dist = Math.abs(x2 - x1) * 0.5;
  const path = `M ${x1} ${y1} C ${x1 + dist} ${y1}, ${x2 - dist} ${y2}, ${x2} ${y2}`;

  return (
    <g>
      <path d={path} stroke={color} strokeWidth="2" strokeOpacity="0.1" fill="none" />
      <path d={path} stroke={color} strokeWidth="2" strokeDasharray="4 4" fill="none" className="flow-line opacity-60" />
      <path d={path} stroke="white" strokeWidth="2" strokeDasharray="100 1000" fill="none" className="signal-burst opacity-0" style={{ filter: 'url(#glow-fx)' }} />
    </g>
  );
}

function Node({ x, y, title, icon: Icon, children, accent }: any) {
  const borderColors: any = {
    purple: 'border-purple-500/30 hover:border-purple-500/60',
    blue: 'border-blue-500/30 hover:border-blue-500/60',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60',
  };

  return (
    <div
      className={`absolute bg-[#0c0c0e] border rounded-lg shadow-xl transition-colors duration-300 ${borderColors[accent]}`}
      style={{ left: x, top: y, width: NODE_WIDTH }}
    >
      <div className="flex items-center px-3 border-b border-white/5 bg-white/5" style={{ height: HEADER_HEIGHT }}>
        <Icon size={12} className={`mr-2 text-${accent}-400`} />
        <span className="text-[10px] font-bold text-neutral-200 uppercase tracking-widest truncate">{title}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function NodeRow({ children }: any) {
  return (
    <div className="relative flex items-center px-3 w-full border-b border-white/5 last:border-0" style={{ height: ROW_HEIGHT }}>
      {children}
    </div>
  );
}

function Port({ position, color }: { position: 'left' | 'right', color: string }) {
  const colors: any = {
    purple: 'bg-purple-500 border-purple-900',
    green: 'bg-green-500 border-green-900',
    blue: 'bg-blue-500 border-blue-900'
  };
  const style = position === 'right'
    ? { right: -5, top: '50%', transform: 'translate(0, -50%)' }
    : { left: -5, top: '50%', transform: 'translate(0, -50%)' };

  return (
    <div className={`absolute w-2.5 h-2.5 rounded-full border-2 z-20 ${colors[color]}`} style={style}>
      <div className={`port-ring absolute -inset-1 rounded-full border opacity-0 ${colors[color].split(' ')[0].replace('bg-', 'border-')}`}></div>
    </div>
  );
}