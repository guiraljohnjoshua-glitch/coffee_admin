import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDisplayName } from '../lib/authUtils';
import { 
  LayoutDashboard, 
  Package, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Lock,
  Clock,
  ShieldAlert,
  UserCheck,
  Coffee,
  Bot,
  Sparkles
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import FloatingAiChatbot from './FloatingAiChatbot';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [appName, setAppName] = useState("Tara Timpla Coffee");
  const [employeeStatus, setEmployeeStatus] = useState<string | null>(null);
  const [employeeRole, setEmployeeRole] = useState<string>('Unassigned');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkEmployeeStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
        if (session.user.email === 'johnjoshuaguiral12@gmail.com') {
          setEmployeeStatus('owner');
          setEmployeeRole('Owner');
          setLoadingStatus(false);
          return;
        }

        const { data: employeeData } = await supabase
          .from('orders')
          .select('status, city')
          .eq('product_variant', 'EMPLOYEE_ACCOUNT')
          .eq('customer_name', session.user.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (employeeData) {
          setEmployeeStatus(employeeData.status);
          setEmployeeRole(employeeData.city || 'Unassigned');
        } else {
          setEmployeeStatus('not_found');
          setEmployeeRole('Unassigned');
        }
      }
      setLoadingStatus(false);
    };

    checkEmployeeStatus();

    const storedName = localStorage.getItem('appName');
    if (storedName) {
      setAppName(storedName);
    }
    
    // Listen for custom event when app name changes
    const handleAppNameChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setAppName(customEvent.detail || "John Coffee's");
    };
    
    window.addEventListener('appNameChanged', handleAppNameChange);
    return () => window.removeEventListener('appNameChanged', handleAppNameChange);
  }, []);

  const isOwner = employeeStatus === 'owner' || userEmail === 'johnjoshuaguiral12@gmail.com';

  // Guard against employees directly accessing /settings or /owner
  useEffect(() => {
    if (!loadingStatus && !isOwner) {
      if (location.pathname === '/settings' || location.pathname === '/owner') {
        navigate('/', { replace: true });
      }
    }
  }, [location.pathname, loadingStatus, isOwner, navigate]);

  const handleLogout = async () => {
    try {
      if (userEmail) {
        await fetch('/api/attendance/sign-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        });
      }
    } catch (e) {
      console.warn('Could not record employee sign-out:', e);
    }
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Navigation for all approved team members (Crew, Delivery, Owner)
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Working Station', path: '/station', icon: Coffee },
    { name: 'Orders', path: '/orders', icon: Package },
    { name: 'AI Growth & Attendance', path: '/ai-barista', icon: Sparkles },
    ...(isOwner ? [
      { name: 'Settings', path: '/settings', icon: Settings },
      { name: 'Owner Portal', path: '/owner', icon: Lock },
    ] : []),
  ];

  if (loadingStatus) {
    return (
      <div className="app-container flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-[#C68A57] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // State 1: Awaiting owner approval
  if (employeeStatus === 'pending') {
    return (
      <div className="app-container flex items-center justify-center min-h-screen p-4">
        <div className="text-center p-8 bg-[#2A1A12] border border-[rgba(255,255,255,0.1)] rounded-3xl max-w-md w-full shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#F7F4EB] mb-2">Pending Owner Approval</h2>
          <p className="text-[#A89B93] text-sm mb-8 leading-relaxed">
            Your employee account has been created, but requires the owner to approve it and assign your role (Crew Member or Delivery Member) before you can log in.
          </p>
          <button 
            onClick={handleLogout}
            className="w-full py-3.5 px-4 rounded-xl font-medium text-white transition-all transform active:scale-[0.98] bg-[#C68A57] hover:bg-[#B57A47] shadow-lg shadow-[#C68A57]/20"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // State 2: Approved, but role not assigned yet by the owner
  if (employeeStatus === 'processing' && (!employeeRole || employeeRole === 'Unassigned')) {
    return (
      <div className="app-container flex items-center justify-center min-h-screen p-4">
        <div className="text-center p-8 bg-[#2A1A12] border border-[rgba(255,255,255,0.1)] rounded-3xl max-w-md w-full shadow-2xl">
          <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <UserCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#F7F4EB] mb-2">Role Assignment Pending</h2>
          <p className="text-[#A89B93] text-sm mb-8 leading-relaxed">
            Your account is approved! However, the owner has not assigned your specific role (Crew Member or Delivery Member) yet. Please wait for role assignment.
          </p>
          <button 
            onClick={handleLogout}
            className="w-full py-3.5 px-4 rounded-xl font-medium text-white transition-all transform active:scale-[0.98] bg-[#C68A57] hover:bg-[#B57A47] shadow-lg shadow-[#C68A57]/20"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // State 3: Revoked or Not Found
  if (employeeStatus === 'not_found' || employeeStatus === 'cancelled') {
    return (
      <div className="app-container flex items-center justify-center min-h-screen p-4">
        <div className="text-center p-8 bg-[#2A1A12] border border-[rgba(255,255,255,0.1)] rounded-3xl max-w-md w-full shadow-2xl">
          <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#F7F4EB] mb-2">Access Denied</h2>
          <p className="text-[#A89B93] text-sm mb-8 leading-relaxed">
            Your employee record was not found or your access has been revoked by the owner.
          </p>
          <button 
            onClick={handleLogout}
            className="w-full py-3.5 px-4 rounded-xl font-medium text-white transition-all transform active:scale-[0.98] bg-[#C68A57] hover:bg-[#B57A47] shadow-lg shadow-[#C68A57]/20"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container font-sans text-text-main">
      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center justify-between p-4 dark-sidebar sticky top-0 z-50">
        <div>
          <h1 className="text-xl font-serif font-bold tracking-tight text-[#F7F4EB]">{appName}</h1>
          <p className="text-[11px] text-primary font-medium">
            {isOwner ? 'Store Owner' : employeeRole}
          </p>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 -mr-2 text-[#A89B93] hover:text-[#F7F4EB] transition-colors">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 dark-sidebar pt-20 px-4">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-full transition-all font-medium text-left",
                  location.pathname === item.path 
                    ? "bg-primary text-white" 
                    : "text-[#A89B93] hover:bg-[#3A2A22]"
                )}
              >
                <item.icon size={20} />
                {item.name}
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-full text-red-400 hover:bg-red-500/10 transition-all font-medium text-left mt-4"
            >
              <LogOut size={20} />
              Log out
            </button>
          </nav>
        </div>
      )}

      <div className="flex max-w-7xl mx-auto">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 py-8 px-6 dark-sidebar shadow-2xl z-10">
          <div className="mb-8 px-2 flex flex-col gap-0.5 text-[#F7F4EB]">
            <h1 className="text-2xl font-serif font-bold tracking-tight">{appName}</h1>
            <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
              {isOwner ? 'Owner Dashboard' : `${employeeRole} Portal`}
            </span>
          </div>
          <nav className="flex-1 flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-full transition-all font-medium text-sm w-full text-left",
                  location.pathname === item.path 
                    ? "bg-primary text-[#2A1A12] font-semibold" 
                    : "text-[#A89B93] hover:bg-[#3A2A22] hover:text-[#F7F4EB]"
                )}
              >
                <item.icon size={18} />
                {item.name}
              </button>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-full text-[#A89B93] hover:bg-red-500/10 hover:text-red-400 transition-all font-medium text-sm w-full text-left"
          >
            <LogOut size={18} />
            Sign Out Shift
          </button>

          <div className="mt-4 px-3 py-2.5 rounded-xl bg-[#3A2A22]/60 border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-medium text-emerald-300">Present & Working</span>
            </div>
            <span className="text-[10px] text-[#A89B93]">Shift Logged</span>
          </div>
          
          <div className="mt-4 flex items-center gap-3 pt-4 border-t border-[rgba(255,255,255,0.1)]">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-[#2A1A12] font-bold text-xs shrink-0">
              {isOwner ? 'OW' : employeeRole === 'Delivery Member' ? 'DM' : 'CM'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-[#F7F4EB] truncate" title={userEmail || ''}>
                {formatDisplayName(userEmail)}
              </p>
              <p className="text-xs text-primary font-medium truncate">
                {isOwner ? 'Store Owner' : employeeRole}
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 md:pt-10 max-w-full overflow-hidden">
          <div className="max-w-5xl mx-auto">
            <Outlet context={{ employeeRole, isOwner, userEmail }} />
          </div>
        </main>
      </div>

      {/* Floating Website AI Barista Chatbot (accessible from anywhere) */}
      <FloatingAiChatbot />
    </div>
  );
}
