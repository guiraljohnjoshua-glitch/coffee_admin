import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appName, setAppName] = useState("John Coffee's");
  const navigate = useNavigate();

  useEffect(() => {
    const storedName = localStorage.getItem('appName');
    if (storedName) {
      setAppName(storedName);
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/');
    }
  };

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center p-4 font-sans text-text-main relative"
      style={{
        backgroundImage: 'url("https://images.unsplash.com/photo-1497935586351-b67a49e012bf?ixlib=rb-4.0.3&auto=format&fit=crop&w=2071&q=80")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-[3px]"></div>

      <div className="w-full max-w-sm bg-[#fbf9f6]/95 backdrop-blur-xl p-8 rounded-[24px] shadow-2xl border border-white/50 relative z-10">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <Package size={28} className="text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-serif font-bold text-center tracking-tight mb-2 text-text-main">Log in to {appName}</h1>
        <p className="text-center text-text-muted text-[14px] mb-8">Enter your credentials to manage orders.</p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-[14px] font-medium text-text-muted mb-1 ml-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-[10px] bg-glass border border-border-glass focus:border-primary focus:ring-0 transition-all outline-none text-[14px]"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-[14px] font-medium text-text-muted mb-1 ml-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-[10px] bg-glass border border-border-glass focus:border-primary focus:ring-0 transition-all outline-none text-[14px]"
              placeholder="••••••••"
              required
            />
          </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3.5 rounded-full font-semibold mt-4 hover:bg-primary-dark transition-colors disabled:opacity-70 text-[14px]"
            >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}
