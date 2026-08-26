import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, 
  Package, 
  Settings, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [appName, setAppName] = useState("John Coffee's");

  useEffect(() => {
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
  ];

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
