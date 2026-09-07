import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package } from 'lucide-react';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [appName, setAppName] = useState("John Coffee's");
  const navigate = useNavigate();

  useEffect(() => {
    const storedName = localStorage.getItem('appName');
    if (storedName) {
      setAppName(storedName);
    }
  }, []);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage('Account created successfully! You can now log in.');
        setIsSignUp(false); // Switch back to login
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        navigate('/');
      }
    }
    setLoading(false);
  };

  return (
    <div className="app-container flex items-center justify-center p-4 font-sans text-text-main">
      <div className="w-full max-w-sm glass-panel p-8 rounded-[24px]">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <Package size={28} className="text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-serif font-bold text-center tracking-tight mb-2 text-text-main">
          {isSignUp ? `Join ${appName}` : `Log in to ${appName}`}
        </h1>
        <p className="text-center text-text-muted text-[14px] mb-8">
          {isSignUp ? 'Create an account for a new employee.' : 'Enter your credentials to manage orders.'}
        </p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl text-center">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-600 text-sm rounded-xl text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
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
              placeholder="employee@example.com"
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
            {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Log in'}
          </button>
          
          <div className="text-center mt-4">
            <button 
              type="button" 
              onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
              className="text-primary hover:underline text-sm font-medium"
            >
              {isSignUp ? 'Already have an account? Log in' : 'New employee? Sign up here'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
