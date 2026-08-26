import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../types';
import { Package, TrendingUp, CheckCircle, Clock, DollarSign } from 'lucide-react';

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
  
  const getDrinkPrice = (variant: string) => {
    const v = (variant || '').toLowerCase();
    if (v.includes('classic') || v.includes('americano')) return 30;
    return 49; // Caramel, Spanish, Mocha
  };

  const getOrderTotal = (order: Order) => {
    if (order.total_price != null) return order.total_price;
    return getDrinkPrice(order.product_variant) * (order.quantity || 1);
  };

  const totalItemsSold = orders.filter(o => o.status !== 'cancelled').reduce((acc, curr) => acc + (curr.quantity || 1), 0);
  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((acc, curr) => acc + getOrderTotal(curr), 0);

  const stats = [
    { name: 'Total Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { name: 'Total Orders', value: totalOrders, icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
    { name: 'Pending COD', value: pendingOrders, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
    { name: 'Delivered', value: deliveredOrders, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { name: 'Items Sold', value: totalItemsSold, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-border-glass border-t-primary rounded-full animate-spin"></div>
          <p className="text-text-muted font-medium">Loading statistics...</p>
        </div>
      </div>
    );
  }

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight text-text-main">Overview</h1>
        <p className="text-text-muted mt-1">Here's what's happening with your store today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="glass-panel p-6 rounded-[16px] flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stat.bg}`}>
              <stat.icon className={stat.color} size={24} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-text-muted uppercase tracking-wide mb-1">{stat.name}</p>
              <p className="text-[24px] font-bold text-text-main leading-none">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-[20px] overflow-hidden">
        <div className="p-6 border-b border-border-glass flex justify-between items-center">
          <h2 className="text-[18px] font-serif font-bold tracking-tight text-text-main">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] text-left border-collapse">
            <thead className="font-medium text-text-muted bg-[rgba(0,0,0,0.02)]">
              <tr>
                <th className="px-6 py-3 font-medium">Order ID</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-glass">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                    No recent orders found.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-primary/5 transition-colors">
                    <td className="px-6 py-3 font-medium text-text-main">
                      #{String(order.id).slice(0, 8)}
                    </td>
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-medium text-text-main">{order.customer_name}</p>
                        <p className="text-text-muted text-xs mt-0.5">{order.city}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-medium text-text-main">{order.product_variant}</p>
                      <p className="text-text-muted text-xs mt-0.5">Qty: {order.quantity} • ₱{getOrderTotal(order).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                      {order.payment_method && <p className="text-emerald-600 font-medium text-[11px] mt-0.5 uppercase tracking-wide">{order.payment_method}</p>}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2.5 py-1 rounded-[100px] text-[11px] font-semibold uppercase tracking-wide status-${order.status}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-text-muted">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
