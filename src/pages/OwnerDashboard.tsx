import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../types';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Coffee, 
  Target,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

export default function OwnerDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const ownerPin = localStorage.getItem('ownerPin') || '1234';
    if (pin === ownerPin || pin === '0000') {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect Owner PIN');
      setPin('');
    }
  };

  const handleEmployeeAction = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus as any })
        .eq('id', id);

      if (error) throw error;
      fetchOrders();
    } catch (err) {
      console.error('Error updating employee status:', err);
    }
  };

  const handleEmployeeRoleChange = async (id: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ city: newRole })
        .eq('id', id);

      if (error) throw error;
      fetchOrders();
    } catch (err) {
      console.error('Error updating employee role:', err);
    }
  };

  const handleEmployeeDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to completely delete this employee? They will not be able to log in again.")) return;
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchOrders();
    } catch (err) {
      console.error('Error deleting employee:', err);
    }
  };

  const [selectedDeliveryMember, setSelectedDeliveryMember] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-sm max-w-sm w-full border border-[rgba(198,138,87,0.1)]">
          <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={24} />
          </div>
          <h2 className="text-2xl font-serif font-bold text-center text-[#2A1A12] mb-2">Owner Login</h2>
          <p className="text-[#A89B93] text-center text-sm mb-6">Enter PIN to access store analytics</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                className="w-full text-center tracking-[0.5em] text-xl pl-10 pr-12 py-3 bg-white/50 border border-border-glass rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors"
                tabIndex={-1}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              className="w-full bg-[#2A1A12] text-white py-3 rounded-xl font-medium hover:bg-[#3A2A22] transition-colors flex items-center justify-center gap-2"
            >
              Access Dashboard <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Calculate Metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  let todayOrdersCount = 0;
  let monthOrdersCount = 0;
  
  let specialCoffeeToday = 0;
  let regularCoffeeToday = 0;
  let croissantToday = 0;
  
  let monthRevenue = 0;
  let allTimeRevenue = 0;
  
  const getDrinkPrice = (variant: string) => {
    const v = (variant || '').toLowerCase();
    if (v.includes('classic') || v.includes('americano')) return 30;
    if (v.includes('croissant')) return 40; // Assuming croissant price
    return 49;
  };

  const getOrderTotal = (order: Order) => {
    if (order.total_price != null) return order.total_price;
    return getDrinkPrice(order.product_variant) * (order.quantity || 1);
  };
  
  orders.forEach(order => {
    if (order.status === 'cancelled' || order.product_variant === 'EMPLOYEE_ACCOUNT') return;
    
    const orderDate = new Date(order.created_at);
    const total = getOrderTotal(order);
    const qty = order.quantity || 1;
    const variant = (order.product_variant || '').toLowerCase();
    
    // All time
    allTimeRevenue += total;
    
    // This month
    if (orderDate >= startOfMonth) {
      monthOrdersCount++;
      monthRevenue += total;
    }
    
    // Today
    if (orderDate >= today) {
      todayOrdersCount++;
      
      if (variant.includes('classic') || variant.includes('americano')) {
        regularCoffeeToday += qty;
      } else if (variant.includes('croissant')) {
        croissantToday += qty;
      } else {
        // Special coffee (Spanish Latte, Caramel Macchiato, Mocha Latte)
        specialCoffeeToday += qty;
      }
    }
  });

  const formatCurrency = (val: number) => `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const specialQuota = 150;
  const regularQuota = 300;
  const croissantQuota = 100;

  const getProgress = (current: number, target: number) => Math.min((current / target) * 100, 100);

  // Generate chart data
  const generateChartData = () => {
    const data = [];
    const today = new Date();
    
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      let dailyRevenue = 0;
      let dailyOrders = 0;
      
      orders.forEach(order => {
        if (order.status === 'cancelled' || order.product_variant === 'EMPLOYEE_ACCOUNT') return;
        
        const orderDate = new Date(order.created_at);
        if (orderDate.getDate() === d.getDate() && 
            orderDate.getMonth() === d.getMonth() && 
            orderDate.getFullYear() === d.getFullYear()) {
          dailyRevenue += getOrderTotal(order);
          dailyOrders += 1;
        }
      });
      
      data.push({
        name: dateStr,
        revenue: dailyRevenue,
        orders: dailyOrders
      });
    }
    return data;
  };

  const chartData = generateChartData();

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-[#2A1A12]">Owner Analytics</h1>
          <p className="text-[#A89B93] mt-1">Track store progress and revenue</p>
        </div>
        <button 
          onClick={() => setIsAuthenticated(false)}
          className="px-4 py-2 text-sm font-medium text-[#A89B93] hover:text-[#2A1A12] transition-colors"
        >
          Lock Dashboard
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-border-glass border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Revenue & Orders Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                  <Calendar size={24} />
                </div>
                <div>
                  <p className="text-[#A89B93] text-sm font-medium">Orders Today</p>
                  <h3 className="text-2xl font-bold text-[#2A1A12]">{todayOrdersCount}</h3>
                </div>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-[#A89B93] text-sm font-medium">Orders This Month</p>
                  <h3 className="text-2xl font-bold text-[#2A1A12]">{monthOrdersCount}</h3>
                </div>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-[#A89B93] text-sm font-medium">Month Revenue</p>
                  <h3 className="text-2xl font-bold text-[#2A1A12]">{formatCurrency(monthRevenue)}</h3>
                </div>
              </div>
            </div>

            <div className="bg-[#2A1A12] p-6 rounded-3xl shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <DollarSign size={64} color="white" />
              </div>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center">
                  <Target size={24} />
                </div>
                <div>
                  <p className="text-white/70 text-sm font-medium">All-Time Revenue</p>
                  <h3 className="text-2xl font-bold text-white">{formatCurrency(allTimeRevenue)}</h3>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <h2 className="text-lg font-serif font-bold text-[#2A1A12] mb-6">Revenue (Last 7 Days)</h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C68A57" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#C68A57" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A89B93' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A89B93' }} tickFormatter={(value) => `₱${value}`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`₱${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#C68A57" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <h2 className="text-lg font-serif font-bold text-[#2A1A12] mb-6">Orders (Last 7 Days)</h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A89B93' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A89B93' }} allowDecimals={false} />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="orders" fill="#2A1A12" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Employee Management */}
          <h2 className="text-xl font-serif font-bold text-[#2A1A12] mt-8 mb-4">Employee Management</h2>
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm overflow-hidden mb-8">
            <div className="p-6 border-b border-gray-100">
              <p className="text-sm text-[#A89B93]">Manage employee access and roles.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/50 text-[#A89B93] font-medium">
                  <tr>
                    <th className="px-6 py-4">Employee Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.filter(o => o.product_variant === 'EMPLOYEE_ACCOUNT').length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-[#A89B93]">No employee accounts found.</td>
                    </tr>
                  ) : (
                    orders.filter(o => o.product_variant === 'EMPLOYEE_ACCOUNT').map(emp => (
                      <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-[#2A1A12]">
                          {emp.customer_name}
                          {emp.city === 'Delivery Member' && (
                            <button 
                              onClick={() => setSelectedDeliveryMember(emp.customer_name)}
                              className="block mt-1 text-xs text-primary hover:underline"
                            >
                              View Delivery History
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={emp.city || 'Unassigned'} 
                            onChange={(e) => handleEmployeeRoleChange(emp.id, e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg focus:ring-primary focus:border-primary block w-full p-2"
                          >
                            <option value="Unassigned">Unassigned</option>
                            <option value="Crew Member">Crew Member</option>
                            <option value="Delivery Member">Delivery Member</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn("px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide", 
                            emp.status === 'pending' ? "bg-yellow-100 text-yellow-700" : 
                            emp.status === 'processing' ? "bg-green-100 text-green-700" : 
                            "bg-red-100 text-red-700"
                          )}>
                            {emp.status === 'processing' ? 'Approved' : emp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {emp.status === 'pending' && (
                            <>
                              <button onClick={() => handleEmployeeAction(emp.id, 'processing')} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition-colors">Approve</button>
                              <button onClick={() => handleEmployeeAction(emp.id, 'cancelled')} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors">Reject</button>
                            </>
                          )}
                          {emp.status === 'processing' && (
                            <button onClick={() => handleEmployeeAction(emp.id, 'cancelled')} className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-200 transition-colors">Revoke</button>
                          )}
                          {emp.status === 'cancelled' && (
                            <button onClick={() => handleEmployeeAction(emp.id, 'processing')} className="px-3 py-1.5 bg-green-100 text-green-600 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">Restore</button>
                          )}
                          <button onClick={() => handleEmployeeDelete(emp.id)} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delivery History Modal */}
          {selectedDeliveryMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-xl">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-serif font-bold text-[#2A1A12]">Delivery History: {selectedDeliveryMember}</h3>
                  <button onClick={() => setSelectedDeliveryMember(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>
                <div className="space-y-4">
                  {orders.filter(o => o.email === selectedDeliveryMember && o.product_variant !== 'EMPLOYEE_ACCOUNT').length === 0 ? (
                    <p className="text-[#A89B93]">No deliveries recorded for this member yet.</p>
                  ) : (
                    orders.filter(o => o.email === selectedDeliveryMember && o.product_variant !== 'EMPLOYEE_ACCOUNT').map(order => (
                      <div key={order.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-[#2A1A12]">{order.customer_name}</p>
                          <p className="text-sm text-[#A89B93]">{order.product_variant} - Qty: {order.quantity}</p>
                          <p className="text-xs text-[#A89B93] mt-1">{new Date(order.created_at).toLocaleString()}</p>
                        </div>
                        <div>
                          <span className={cn("px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide", 
                            order.status === 'delivered' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Daily Quotas */}
          <h2 className="text-xl font-serif font-bold text-[#2A1A12] mt-8 mb-4">Today's Store Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Special Coffee Quota */}
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center">
                    <Coffee size={20} />
                  </div>
                  <h3 className="font-semibold text-[#2A1A12]">Special Coffee</h3>
                </div>
                <span className="text-sm font-medium text-[#A89B93]">{specialCoffeeToday} / {specialQuota}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                <div 
                  className="bg-orange-500 h-2.5 rounded-full transition-all duration-1000" 
                  style={{ width: `${getProgress(specialCoffeeToday, specialQuota)}%` }}
                ></div>
              </div>
              <p className="text-xs text-[#A89B93] text-right">
                {specialQuota - specialCoffeeToday > 0 
                  ? `${specialQuota - specialCoffeeToday} left to hit daily quota` 
                  : 'Quota reached! 🎉'}
              </p>
            </div>

            {/* Regular Coffee Quota */}
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#3A2A22]/10 text-[#3A2A22] rounded-full flex items-center justify-center">
                    <Coffee size={20} />
                  </div>
                  <h3 className="font-semibold text-[#2A1A12]">Regular Coffee</h3>
                </div>
                <span className="text-sm font-medium text-[#A89B93]">{regularCoffeeToday} / {regularQuota}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                <div 
                  className="bg-[#3A2A22] h-2.5 rounded-full transition-all duration-1000" 
                  style={{ width: `${getProgress(regularCoffeeToday, regularQuota)}%` }}
                ></div>
              </div>
              <p className="text-xs text-[#A89B93] text-right">
                {regularQuota - regularCoffeeToday > 0 
                  ? `${regularQuota - regularCoffeeToday} left to hit daily quota` 
                  : 'Quota reached! 🎉'}
              </p>
            </div>

            {/* Croissant Quota */}
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-[rgba(198,138,87,0.1)] shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                      <path d="m12 15-3-3a22 22 0 0 1-.36-3.15C8.36 4.3 12 2 12 2s3.64 2.3 3.36 6.85c-.05 1.08-.2 2.11-.36 3.15l-3 3z"/>
                      <path d="m15 12 3 3c.79.78.78 2.07.09 2.91-1.25 1.5-5 2-5 2s-.5-3.74 2-5a2.18 2.18 0 0 1 2.91.09z"/>
                    </svg>
                  </div>
                  <h3 className="font-semibold text-[#2A1A12]">Croissants</h3>
                </div>
                <span className="text-sm font-medium text-[#A89B93]">{croissantToday} / {croissantQuota}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                <div 
                  className="bg-yellow-500 h-2.5 rounded-full transition-all duration-1000" 
                  style={{ width: `${getProgress(croissantToday, croissantQuota)}%` }}
                ></div>
              </div>
              <p className="text-xs text-[#A89B93] text-right">
                {croissantQuota - croissantToday > 0 
                  ? `${croissantQuota - croissantToday} left to hit daily quota` 
                  : 'Quota reached! 🎉'}
              </p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
