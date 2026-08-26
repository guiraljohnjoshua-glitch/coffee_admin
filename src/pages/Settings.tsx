import { useState, useEffect, FormEvent } from 'react';
import { Save } from 'lucide-react';

export default function Settings() {
  const [appName, setAppName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem('appName') || "John Coffee's";
    setAppName(storedName);
  }, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem('appName', appName);
    
    // Dispatch custom event to update app name across components
    window.dispatchEvent(new CustomEvent('appNameChanged', { detail: appName }));
    
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight text-text-main">Settings</h1>
        <p className="text-text-muted mt-1">Manage your application preferences.</p>
      </div>

      <div className="glass-panel rounded-[20px] overflow-hidden">
        <div className="p-6 border-b border-border-glass">
          <h2 className="text-[18px] font-serif font-bold tracking-tight text-text-main">General</h2>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="space-y-2">
            <label htmlFor="appName" className="block text-[14px] font-medium text-text-muted">
              Application Name
            </label>
            <p className="text-sm text-text-muted pb-2">
              This name will be displayed in the sidebar and login screen.
            </p>
            <input
              id="appName"
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full max-w-md px-4 py-3 bg-glass border border-border-glass focus:border-primary focus:ring-0 rounded-[12px] text-[14px] text-text-main transition-all outline-none"
              placeholder="e.g. My Store Admin"
              required
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-semibold text-[14px] hover:bg-primary-dark transition-colors"
            >
              <Save size={18} />
              Save Changes
            </button>
            
            {saved && (
              <span className="text-sm text-green-600 font-medium animate-in fade-in slide-in-from-left-2 duration-300">
                Settings saved successfully!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
