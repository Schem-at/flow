import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import anime from 'animejs';
import { Zap, Book } from 'lucide-react';
import { MockFlowGraph } from './MockFlowGraph';
import { AnimatedLogo } from './AnimatedLogo';

export function Hero() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Hero Animation
    anime({
      targets: '.hero-element',
      translateY: [30, 0],
      opacity: [0, 1],
      delay: anime.stagger(80, { start: 200 }),
      easing: 'easeOutCubic',
      duration: 900
    });

    // Subtle breathing for background glows
    anime({
      targets: '.glow-bg',
      opacity: [0.2, 0.5],
      scale: [1, 1.15],
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
      duration: 5000,
    });
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!heroRef.current) return;
    
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    
    const x = (clientX / innerWidth - 0.5) * 2; // -1 to 1
    const y = (clientY / innerHeight - 0.5) * 2; // -1 to 1

    // Parallax for background glows
    anime({
      targets: '.glow-bg',
      translateX: (_el: Element, i: number) => x * 40 * (i + 1),
      translateY: (_el: Element, i: number) => y * 40 * (i + 1),
      duration: 400,
      easing: 'easeOutQuad'
    });

    // Subtle tilt for the editor preview card
    anime({
      targets: '.hero-card',
      rotateX: -y * 2,
      rotateY: x * 2,
      duration: 800,
      easing: 'easeOutCubic'
    });
  };

  return (
    <section 
      className="pt-36 pb-28 px-6 relative flex flex-col items-center justify-center overflow-hidden min-h-screen [perspective:1000px]" 
      ref={heroRef}
      onMouseMove={handleMouseMove}
    >
      {/* Background Grid + Glows */}
      <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
        {/* Grid pattern with fade */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_60%,transparent_100%)]" />
        
        {/* Ambient glows */}
        <div className="glow-bg absolute -top-[20%] left-[10%] w-[600px] h-[600px] bg-green-500/15 rounded-full blur-[150px]" />
        <div className="glow-bg absolute top-[5%] right-[5%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[150px]" />
        <div className="glow-bg absolute bottom-[10%] left-[30%] w-[400px] h-[400px] bg-purple-500/8 rounded-full blur-[150px]" />
      </div>

      <div className="max-w-5xl mx-auto w-full relative z-10 flex flex-col items-center text-center">
        
        {/* Animated Logo Badge */}
        <AnimatedLogo />
        
        {/* Main Headline */}
        <h1 className="hero-element text-5xl md:text-7xl lg:text-8xl font-bold pb-8 tracking-tight leading-[0.95] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50">
          Build tools,<br />not just structures.
        </h1>
        
        {/* Subheadline */}
        <p className="hero-element text-lg md:text-xl text-neutral-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          A visual metaprogramming environment for Minecraft. Define schemas, compose logic flows, and deploy them as API endpoints — instantly.
        </p>
        
        {/* CTAs */}
        <div className="hero-element flex flex-col sm:flex-row items-center justify-center gap-4 mb-24">
          <button 
            onClick={() => navigate('/editor')}
            className="h-12 px-8 bg-green-500 hover:bg-green-400 text-black rounded-lg font-semibold transition-all duration-300 hover:scale-[1.02] shadow-[0_0_40px_-10px_rgba(74,222,128,0.5)] hover:shadow-[0_0_50px_-10px_rgba(74,222,128,0.7)] flex items-center gap-2.5"
          >
            Start Building <Zap className="w-4 h-4" />
          </button>
          <button 
            onClick={() => navigate('/docs')}
            className="h-12 px-8 bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-neutral-300 hover:text-white rounded-lg font-medium transition-all duration-300 flex items-center gap-2.5"
          >
            <Book className="w-4 h-4" /> Documentation
          </button>
        </div>

        {/* Editor Preview */}
        <div className="hero-element w-full max-w-4xl relative hero-card" style={{ transformStyle: 'preserve-3d' }}>
          {/* Glow behind card */}
          <div className="absolute -inset-4 bg-gradient-to-b from-green-500/10 via-transparent to-transparent rounded-3xl blur-2xl opacity-50" />
            <MockFlowGraph />
        </div>
      </div>
    </section>
  );
}
