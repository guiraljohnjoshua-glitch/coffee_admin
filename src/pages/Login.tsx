import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeEmployeeIdentifier, formatDisplayName } from '../lib/authUtils';
import { Package, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    return () => {
      setPassword(''); // Ensure password is cleared when leaving the page
    };
  }, []);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = normalizeEmployeeIdentifier(email);
    if (!normalizedEmail) {
      setError("Please enter a username or email.");
      setLoading(false);
      return;
    }

    if (isSignUp) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        setLoading(false);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        // Sign out immediately so we can insert the employee record as an anonymous user, 
        // bypassing the RLS policy that restricts authenticated users from inserting.
        await supabase.auth.signOut();

        // Create pending employee account request in orders table
        const { error: insertError } = await supabase.from('orders').insert([{
          customer_name: normalizedEmail,
          email: normalizedEmail,
          phone: '',
          city: 'Unassigned', // Default role until owner assigns Crew or Delivery
          address: '',
          product_name: 'Employee Registration',
          product_variant: 'EMPLOYEE_ACCOUNT',
          quantity: 1,
          status: 'pending' // Pending owner approval
        }]);

        if (insertError) {
          console.error("Failed to create employee record:", insertError);
          setError("Failed to create employee request. Please try again.");
        } else {
          setMessage('Account registered successfully! The owner must approve your account and assign your role (Crew Member or Delivery Member) before you can log in.');
          setIsSignUp(false); // Switch back to login
          setPassword('');
        }
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes("invalid login credentials")) {
          // Check if they are an employee in our system waiting for approval
          const { data: employeeData } = await supabase
            .from('orders')
            .select('status, city')
            .eq('product_variant', 'EMPLOYEE_ACCOUNT')
            .eq('customer_name', normalizedEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
            
          if (employeeData && employeeData.status === 'pending') {
            setError("Account Pending: The owner has not approved your account yet.");
          } else {
            setError("Invalid email/username or password. Please try again.");
          }
        } else {
          setError(signInError.message);
        }
      } else {
        // If logged in as owner, record sign in & proceed directly
        if (normalizedEmail === 'johnjoshuaguiral12@gmail.com') {
          try {
            await fetch('/api/attendance/sign-in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: normalizedEmail,
                employeeName: 'Store Owner',
                role: 'Owner'
              })
            });
          } catch (e) {
            console.warn('Could not record owner sign in:', e);
          }
          navigate('/');
          setLoading(false);
          return;
        }

        // Check if employee is approved AND assigned a role
        const { data: employeeData } = await supabase
          .from('orders')
          .select('status, city, customer_name')
          .eq('product_variant', 'EMPLOYEE_ACCOUNT')
          .eq('customer_name', normalizedEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!employeeData) {
          await supabase.auth.signOut();
          setError("Access Denied: No employee record found for this account.");
        } else if (employeeData.status === 'pending') {
          await supabase.auth.signOut();
          setError("Account Pending: Your account is waiting for the owner to approve it and assign your role.");
        } else if (employeeData.status === 'cancelled') {
          await supabase.auth.signOut();
          setError("Access Denied: Your account access has been revoked or rejected by the owner.");
        } else if (employeeData.status === 'processing' && (!employeeData.city || employeeData.city === 'Unassigned')) {
          await supabase.auth.signOut();
          setError("Role Pending: Your account is approved, but the owner has not assigned your role (Crew Member or Delivery Member) yet. Please wait for the owner to assign you.");
        } else {
          // Approved and assigned! Record employee present & working attendance with exact time
          try {
            const displayName = formatDisplayName(normalizedEmail);
            await fetch('/api/attendance/sign-in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: normalizedEmail,
                employeeName: displayName,
                role: employeeData.city || 'Crew Member'
              })
            });
          } catch (e) {
            console.warn('Could not record employee sign-in:', e);
          }

          navigate('/');
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="app-container flex items-center justify-center p-4 font-sans text-text-main min-h-screen">
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
          {isSignUp 
            ? 'Sign up with any username or email you like.' 
            : 'Enter your username or email to manage orders.'}
        </p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl text-center leading-relaxed">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-xl text-center leading-relaxed">
            {message}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-4" autoComplete="off">
          <div>
            <div className="flex justify-between items-center mb-1 ml-1">
              <label className="block text-[14px] font-medium text-text-muted" htmlFor="email">
                Username or Email
              </label>
            </div>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-[10px] bg-glass border border-border-glass focus:border-primary focus:ring-0 transition-all outline-none text-[14px]"
              placeholder={isSignUp ? "e.g. sarah or sarah@coffee" : "Username or email"}
              required
              autoComplete="off"
            />
            {isSignUp && (
              <p className="text-xs text-text-muted mt-1 ml-1">
                No real email needed — use any name or handle you choose!
              </p>
            )}
          </div>

          <div>
            <label className="block text-[14px] font-medium text-text-muted mb-1 ml-1" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-12 py-3 rounded-[10px] bg-glass border border-border-glass focus:border-primary focus:ring-0 transition-all outline-none text-[14px]"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3.5 rounded-full font-semibold mt-4 hover:bg-primary-dark transition-colors disabled:opacity-70 text-[14px]"
            >
            {loading ? 'Processing...' : isSignUp ? 'Create Employee Account' : 'Log in'}
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
