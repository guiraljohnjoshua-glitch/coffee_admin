import { useState, useEffect, FormEvent } from 'react';
import { Save, Lock } from 'lucide-react';

export default function Settings() {
  const [appName, setAppName] = useState('');
  const [saved, setSaved] = useState(false);
  
  // Pin states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaved, setPinSaved] = useState(false);

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

  const handlePinSave = (e: FormEvent) => {
    e.preventDefault();
    const storedPin = localStorage.getItem('ownerPin') || '1234';
    
    if (currentPin !== storedPin) {
      setPinError('Current PIN is incorrect');
      return;
    }
    if (newPin.length < 4) {
      setPinError('New PIN must be at least 4 characters');
      return;
    }
    
    localStorage.setItem('ownerPin', newPin);
    setPinError('');
    setPinSaved(true);
    setCurrentPin('');
    setNewPin('');
    setTimeout(() => setPinSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl pb-12">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight text-text-main">Settings</h1>
        <p className="text-text-muted mt-1">Manage your application preferences.</p>
      </div>

      {/* General Settings */}
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

      {/* Owner PIN Settings */}
      <div className="glass-panel rounded-[20px] overflow-hidden">
        <div className="p-6 border-b border-border-glass">
          <h2 className="text-[18px] font-serif font-bold tracking-tight text-text-main flex items-center gap-2">
            <Lock size={18} className="text-primary" />
            Owner Portal PIN
          </h2>
        </div>
        
        <form onSubmit={handlePinSave} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-[14px] font-medium text-text-muted">
                Current PIN
              </label>
              <input
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                className="w-full max-w-md px-4 py-3 bg-glass border border-border-glass focus:border-primary focus:ring-0 rounded-[12px] text-[14px] text-text-main transition-all outline-none"
                placeholder="Enter current PIN"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[14px] font-medium text-text-muted">
                New PIN
              </label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full max-w-md px-4 py-3 bg-glass border border-border-glass focus:border-primary focus:ring-0 rounded-[12px] text-[14px] text-text-main transition-all outline-none"
                placeholder="Enter new PIN"
                required
              />
            </div>
            {pinError && <p className="text-red-500 text-sm">{pinError}</p>}
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-[#2A1A12] text-white rounded-full font-semibold text-[14px] hover:bg-[#3A2A22] transition-colors"
            >
              <Save size={18} />
              Update PIN
            </button>
            
            {pinSaved && (
              <span className="text-sm text-green-600 font-medium animate-in fade-in slide-in-from-left-2 duration-300">
                PIN updated successfully!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
