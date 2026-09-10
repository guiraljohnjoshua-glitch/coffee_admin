import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, 
  Package, 
  Settings, 
  LogOut,
  Menu,
  X,
  Lock
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [appName, setAppName] = useState("John Coffee's");
  const [employeeStatus, setEmployeeStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkEmployeeStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
        if (session.user.email === 'johnjoshuaguiral12@gmail.com') {
          setEmployeeStatus('owner');
          setLoadingStatus(false);
          return;
        }

        const { data: employeeData } = await supabase
          .from('orders')
          .select('status')
          .eq('product_variant', 'EMPLOYEE_ACCOUNT')
          .eq('customer_name', session.user.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (employeeData) {
          setEmployeeStatus(employeeData.status);
        } else {
          setEmployeeStatus('not_found');
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Orders', path: '/orders', icon: Package },
    { name: 'Settings', path: '/settings', icon: Settings },
    { name: 'Owner Portal', path: '/owner', icon: Lock },
  ];

  if (loadingStatus) {
    return (
      <div className="app-container flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-[#C68A57] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (employeeStatus === 'pending') {
    return (
      <div className="app-container flex items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-[#2A1A12] border border-[rgba(255,255,255,0.1)] rounded-2xl max-w-md w-full mx-4 shadow-xl">
          <Lock className="w-16 h-16 mx-auto mb-6 text-[#A89B93]" />
          <h2 className="text-2xl font-serif font-bold text-[#F7F4EB] mb-2">Pending Approval</h2>
          <p className="text-[#A89B93] mb-8">Your account is waiting for the owner to approve it. Please check back later.</p>
          <button 
            onClick={handleLogout}
            className="w-full py-3 px-4 rounded-xl font-medium text-white transition-all transform active:scale-[0.98] bg-[#C68A57] hover:bg-[#B57A47] shadow-lg shadow-[#C68A57]/20"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  if (employeeStatus === 'not_found' || employeeStatus === 'cancelled') {
    return (
      <div className="app-container flex items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-[#2A1A12] border border-[rgba(255,255,255,0.1)] rounded-2xl max-w-md w-full mx-4 shadow-xl">
          <Lock className="w-16 h-16 mx-auto mb-6 text-red-400" />
          <h2 className="text-2xl font-serif font-bold text-[#F7F4EB] mb-2">Access Denied</h2>
          <p className="text-[#A89B93] mb-8">Your employee record was not found or your access has been revoked.</p>
          <button 
            onClick={handleLogout}
            className="w-full py-3 px-4 rounded-xl font-medium text-white transition-all transform active:scale-[0.98] bg-[#C68A57] hover:bg-[#B57A47] shadow-lg shadow-[#C68A57]/20"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container font-sans text-text-main">
      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center justify-between p-4 dark-sidebar sticky top-0 z-50">
        <h1 className="text-xl font-serif font-bold tracking-tight text-[#F7F4EB]">{appName}</h1>
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
          <div className="mb-10 px-2 flex items-center gap-2 text-[#F7F4EB]">
            <h1 className="text-2xl font-serif font-bold tracking-tight">{appName}</h1>
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
            Log out
          </button>
          
          <div className="mt-6 flex items-center gap-3 pt-6 border-t border-[rgba(255,255,255,0.1)]">
            <div className="w-8 h-8 rounded-full bg-primary"></div>
            <div>
              <p className="text-sm font-semibold text-[#F7F4EB]">Admin User</p>
              <p className="text-xs text-[#A89B93]">Administrator</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 md:pt-10 max-w-full overflow-hidden">
          <div className="max-w-5xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
