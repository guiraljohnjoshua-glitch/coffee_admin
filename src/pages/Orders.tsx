import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { Search, Filter, MoreHorizontal, X, Package } from 'lucide-react';
import { format } from 'date-fns';

const ExpandableText = ({ text, className, prefix = "" }: { text: string | undefined | null, className?: string, prefix?: string }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <span
      onClick={() => setExpanded(!expanded)}
      className={`cursor-pointer hover:opacity-80 transition-all block ${className} ${expanded ? 'whitespace-normal break-words max-w-xs md:max-w-md' : 'truncate max-w-[150px] sm:max-w-[200px]'}`}
      title={prefix + text}
    >
      {prefix}{text}
    </span>
  );
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

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

  const handleStatusUpdate = async (id: string, newStatus: OrderStatus) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      const newOrders = orders.map(o => o.id === id ? { ...o, status: newStatus } : o);
      setOrders(newOrders);
      setEditingStatus(null);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const getDrinkPrice = (variant: string) => {
    const v = (variant || '').toLowerCase();
    if (v.includes('classic') || v.includes('americano')) return 30;
    return 49;
  };

  const getOrderTotal = (order: Order) => {
    if (order.total_price != null) return order.total_price;
    return getDrinkPrice(order.product_variant) * (order.quantity || 1);
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      order.id?.toString().toLowerCase().includes(search.toLowerCase()) ||
      order.city?.toLowerCase().includes(search.toLowerCase()) ||
      order.phone?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-text-main">Orders</h1>
          <p className="text-text-muted mt-1">Manage and track your cash-on-delivery shipments.</p>
        </div>
      </div>

      <div className="glass-panel rounded-[20px] overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border-glass flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Search customers or order ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-glass border border-border-glass focus:border-primary focus:ring-0 rounded-full text-[14px] text-text-main transition-all outline-none backdrop-blur-[10px]"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={18} className="text-text-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
              className="w-full sm:w-auto px-4 py-2.5 bg-glass border border-border-glass focus:border-primary focus:ring-0 rounded-full text-[14px] text-text-main transition-all outline-none appearance-none cursor-pointer backdrop-blur-[10px]"
            >
              <option value="all">All Statuses</option>
              {statuses.map(status => (
                <option key={status} value={status} className="capitalize">{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="w-8 h-8 border-4 border-border-glass border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col h-64 items-center justify-center text-text-muted">
              <Package size={48} className="mb-4 text-border-glass" />
              <p>No orders found matching your criteria.</p>
            </div>
          ) : (
            <table className="w-full text-[13px] text-left whitespace-nowrap border-collapse">
              <thead className="font-medium text-text-muted bg-[rgba(0,0,0,0.02)]">
                <tr>
                  <th className="px-6 py-3 font-medium">Order ID</th>
                  <th className="px-6 py-3 font-medium">Customer Details</th>
                  <th className="px-6 py-3 font-medium">Address</th>
                  <th className="px-6 py-3 font-medium">Product</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-glass">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-primary/5 transition-colors">
                    <td className="px-6 py-3">
                      <span className="font-medium text-text-main px-2 py-1 rounded-[6px] text-xs">
                        #{String(order.id).slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <ExpandableText text={order.customer_name} className="font-medium text-text-main" />
                        <ExpandableText text={order.phone} className="text-text-muted text-xs mt-0.5" />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <ExpandableText text={order.city} className="font-medium text-text-main" />
                        <ExpandableText text={order.address} className="text-text-muted text-xs mt-0.5" />
                        <ExpandableText text={order.landmarked} prefix="Landmark: " className="text-[#A66E41] font-medium text-[11px] mt-1" />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-text-main">{order.product_variant}</span>
                        <span className="text-text-muted text-xs mt-0.5">Qty: {order.quantity} • ₱{getOrderTotal(order).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        {order.payment_method && <span className="text-emerald-600 font-medium text-[11px] mt-0.5 uppercase tracking-wide">{order.payment_method}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-text-muted text-xs">
                      {format(new Date(order.created_at), 'MMM dd, yyyy')}
                      <br />
                      {format(new Date(order.created_at), 'h:mm a')}
                    </td>
                    <td className="px-6 py-3">
                      {editingStatus === order.id ? (
                        <select
                          className="px-2 py-1 bg-glass border border-border-glass rounded-md text-sm outline-none focus:border-primary"
                          value={order.status}
                          onChange={(e) => handleStatusUpdate(order.id, e.target.value as OrderStatus)}
                          disabled={updatingId === order.id}
                          onBlur={() => setEditingStatus(null)}
                          autoFocus
                        >
                          {statuses.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingStatus(order.id)}
                          className={`px-2.5 py-1 rounded-[100px] text-[11px] font-semibold uppercase tracking-wide status-${order.status} hover:opacity-80 transition-opacity`}
                        >
                          {updatingId === order.id ? 'Updating...' : order.status}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {editingStatus === order.id ? (
                        <button 
                          onClick={() => setEditingStatus(null)}
                          className="p-2 text-text-muted hover:text-text-main hover:bg-black/5 rounded-[8px] transition-colors"
                        >
                          <X size={16} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => setEditingStatus(order.id)}
                          className="p-2 text-text-muted hover:text-text-main hover:bg-black/5 rounded-[8px] transition-colors"
                          title="Update Status"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
