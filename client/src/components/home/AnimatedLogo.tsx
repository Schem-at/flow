import { useEffect, useRef } from 'react';
import anime from 'animejs';

export function AnimatedLogo() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Selectors
    const nodes = containerRef.current.querySelectorAll('.node-rect');
    const connections = containerRef.current.querySelectorAll('.connection-path');
    const letters = containerRef.current.querySelectorAll('.letter-char');
    
    // Reset initial states manually to ensure clean restart if component remounts
    anime.set(letters, { 
      rotateY: 90, 
      translateX: -20, 
      opacity: 0,
      transformOrigin: '0% 50%' // Hinge on the left edge
    });

    const tl = anime.timeline({
      easing: 'easeOutExpo',
    });

    tl
    // 1. Nodes pop in (Grid Stagger)
    .add({
      targets: nodes,
      scale: [0, 1],
      opacity: [0, 1],
      delay: anime.stagger(50, { grid: [3, 3], from: 'center' }),
      duration: 600,
      easing: 'easeOutBack(1.5)' // Slight bounce
    })
    // 2. Connections draw themselves
    .add({
      targets: connections,
      strokeDashoffset: [anime.setDashoffset, 0],
      opacity: [0, 1],
      duration: 800,
      easing: 'easeInOutQuad'
    }, '-=400')
    // 3. The "Fold Out" Reveal
    .add({
      targets: letters,
      rotateY: [90, 0],      // Unfold like a book
      translateX: [-40, 0],  // Slide out from behind logo
      opacity: [0, 1],
      duration: 1200,
      delay: anime.stagger(100), // l... o... w...
      easing: 'easeOutElastic(1, .6)' // Mechanical spring feel
    }, '-=600');

    // Continuous Pulse for the Active Node (Top Right)
    anime({
      targets: containerRef.current.querySelector('.node-active'),
      stroke: ['#4ade80', '#22c55e'],
      fillOpacity: [0.2, 0.4],
      direction: 'alternate',
      loop: true,
      duration: 2000,
      easing: 'easeInOutSine'
    });

    // Subtle pulse for all nodes
    anime({
      targets: containerRef.current.querySelectorAll('.node-rect:not(.node-active)'),
      opacity: [1, 0.7],
      direction: 'alternate',
      loop: true,
      duration: 3000,
      delay: anime.stagger(200),
      easing: 'easeInOutSine'
    });

  }, []);

  return (
    <div 
      ref={containerRef} 
      className="relative flex items-end justify-center select-none mb-6"
      style={{ perspective: '1000px' }} // Essential for the 3D fold effect
    >
      {/* 
        LOGO CONTAINER 
        Z-index 20 ensures the logo sits "on top" of the letters 
        before they slide out 
      */}
      <div className="relative flex-shrink-0 z-20" style={{ width: '72px', height: '72px' }}>
        <svg viewBox="0 0 72 72" fill="none" className="w-full h-full overflow-visible">
           {/* CONNECTION PATHS */}
           <path 
             className="connection-path opacity-0" 
             d="M22 20 H32 M44 20 H54 M22 38 H32 M14 26 V32 M14 44 V50" 
             stroke="#525252" 
             strokeWidth="2" 
             strokeLinecap="round" 
           />

           {/* NODES - 3x3 grid, 12x12 nodes, bottom row ends at y=60 */}
           {/* Left Col */}
           <rect className="node-rect opacity-0" x="10" y="14" width="12" height="12" rx="3" fill="#3f3f46" stroke="#52525b" strokeWidth="1" />
           <rect className="node-rect opacity-0" x="10" y="32" width="12" height="12" rx="3" fill="#3f3f46" stroke="#52525b" strokeWidth="1" />
           <rect className="node-rect opacity-0" x="10" y="50" width="12" height="12" rx="3" fill="#3f3f46" stroke="#52525b" strokeWidth="1" />
           {/* Middle Col */}
           <rect className="node-rect opacity-0" x="30" y="14" width="12" height="12" rx="3" fill="#3f3f46" stroke="#52525b" strokeWidth="1" />
           <rect className="node-rect opacity-0" x="30" y="32" width="12" height="12" rx="3" fill="#3f3f46" stroke="#52525b" strokeWidth="1" />

           {/* Active Output Node - Top Right */}
           <rect 
             className="node-rect node-active opacity-0" 
             x="50" 
             y="14" 
             width="12" 
             height="12" 
             rx="3" 
             fill="#4ade80" 
             fillOpacity="0.2"
             stroke="#4ade80" 
             strokeWidth="2" 
           />
        </svg>
      </div>
      
      {/* 
        TEXT CONTAINER 
        Aligned to bottom with the SVG grid
      */}
      <div className="relative flex items-end z-10 -ml-1 pb-[4px]">
        <div className="flex text-6xl font-bold tracking-tighter leading-none text-white">
          {/* Individual letters for staggered animation */}
          <span className="letter-char inline-block origin-left opacity-0">l</span>
          <span className="letter-char inline-block origin-left opacity-0">o</span>
          <span className="letter-char inline-block origin-left opacity-0">w</span>
        </div>
      </div>
    </div>
  );
}
