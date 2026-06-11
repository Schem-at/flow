import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github } from 'lucide-react';

export function CTA() {
  const navigate = useNavigate();

  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto text-center border border-white/10 bg-[#121214] rounded-3xl p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-green-500"></div>
        <div className="absolute -top-[100px] -left-[100px] w-[300px] h-[300px] bg-green-500/10 blur-[100px] rounded-full pointer-events-none"></div>
        
        <h2 className="text-4xl font-bold mb-6 relative z-10">Start engineering your builds</h2>
        <p className="text-neutral-400 mb-10 max-w-xl mx-auto relative z-10">
          Join the community of developers and builders creating the next generation of Minecraft tools.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
          <button 
            onClick={() => navigate('/editor')}
            className="px-8 py-4 bg-white text-black rounded-xl font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2"
          >
            Launch Editor <ArrowRight className="w-4 h-4" />
          </button>
          <a 
            href="https://github.com/Nano112/flow"
            target="_blank" rel="noopener noreferrer"
            className="px-8 py-4 bg-black border border-neutral-800 text-white rounded-xl font-bold hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
          >
            <Github className="w-4 h-4" /> View Source
          </a>
        </div>
      </div>
    </section>
  );
}
