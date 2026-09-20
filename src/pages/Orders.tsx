import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { Search, Filter, MoreHorizontal, X, Package, ShieldCheck, Truck, Users } from 'lucide-react';
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
  const outletContext = useOutletContext<{ employeeRole?: string; isOwner?: boolean; userEmail?: string }>() || {};
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<string>(outletContext.employeeRole || 'Crew Member');
  const [isOwner, setIsOwner] = useState<boolean>(outletContext.isOwner || false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(outletContext.userEmail || null);

  const allStatuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  useEffect(() => {
    fetchOrders();
    detectRole();
  }, []);

  const detectRole = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setCurrentUserEmail(session.user.email);
        if (session.user.email === 'johnjoshuaguiral12@gmail.com') {
          setIsOwner(true);
          setUserRole('Owner');
          return;
        }

        const { data: employeeData } = await supabase
          .from('orders')
          .select('city')
          .eq('product_variant', 'EMPLOYEE_ACCOUNT')
          .eq('customer_name', session.user.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (employeeData?.city) {
          setUserRole(employeeData.city);
        }
      }
    } catch (err) {
      console.error('Error detecting user role:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const validOrders = (data || []).filter((o: Order) => o.product_variant !== 'EMPLOYEE_ACCOUNT');
      setOrders(validOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Determine which statuses the user is allowed to select
  const getAllowedStatuses = (): OrderStatus[] => {
    if (isOwner) {
      return ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    }
    if (userRole === 'Delivery Member') {
      // Delivery can ONLY press delivered and cancelled
      return ['delivered', 'cancelled'];
    }
    if (userRole === 'Crew Member') {
      // Crew CANNOT click delivered only
      return ['pending', 'processing', 'shipped', 'cancelled'];
    }
    return ['pending', 'processing', 'shipped', 'cancelled'];
  };

  const handleStatusUpdate = async (id: string, newStatus: OrderStatus) => {
    // Role-based validation
    if (!isOwner) {
      if (userRole === 'Delivery Member' && !['delivered', 'cancelled'].includes(newStatus)) {
        alert('Delivery members are only authorized to mark orders as Delivered or Cancelled.');
        setEditingStatus(null);
        return;
      }
      if (userRole === 'Crew Member' && newStatus === 'delivered') {
        alert('Crew members cannot mark orders as Delivered. Only Delivery members can deliver orders.');
        setEditingStatus(null);
        return;
      }
    }

    setUpdatingId(id);
    try {
      const userEmail = currentUserEmail;
      
      const updateData: any = { status: newStatus };
      
      // If delivery is resolved, log the delivery member's email
      if ((newStatus === 'delivered' || newStatus === 'cancelled') && userEmail) {
        updateData.email = userEmail;
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      
      const newOrders = orders.map(o => o.id === id ? { ...o, ...updateData } : o);
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

  const allowedStatuses = getAllowedStatuses();

  // Can this user edit this particular order's status?
  const canEditOrderStatus = (status: OrderStatus) => {
    if (isOwner) return true;
    if (userRole === 'Crew Member') {
      // Crew cannot edit already delivered orders because they cannot select or touch delivered
      return status !== 'delivered';
    }
    if (userRole === 'Delivery Member') {
      // Delivery member can update to delivered or cancelled
      return true;
    }
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-text-main">Orders</h1>
            {isOwner ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                <ShieldCheck size={14} /> Owner Access
              </span>
            ) : userRole === 'Delivery Member' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/25">
                <Truck size={14} /> Delivery Member
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 border border-amber-500/25">
                <Users size={14} /> Crew Member
              </span>
            )}
          </div>
          <p className="text-text-muted mt-1 text-sm">
            {userRole === 'Delivery Member' && !isOwner
              ? 'Delivery Permissions: You can mark orders as Delivered or Cancelled.'
              : userRole === 'Crew Member' && !isOwner
              ? 'Crew Permissions: You can manage Pending, Processing, Shipped, and Cancelled orders.'
              : 'Full permissions: Manage all order statuses.'}
          </p>
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
              {allStatuses.map(status => (
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
                {filteredOrders.map((order) => {
                  const isEditable = canEditOrderStatus(order.status);

                  return (
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
                            className="px-2 py-1 bg-glass border border-border-glass rounded-md text-sm outline-none focus:border-primary font-medium"
                            value={order.status}
                            onChange={(e) => handleStatusUpdate(order.id, e.target.value as OrderStatus)}
                            disabled={updatingId === order.id}
                            onBlur={() => setEditingStatus(null)}
                            autoFocus
                          >
                            {/* If current status is not in allowedStatuses, display it as disabled current selection */}
                            {!allowedStatuses.includes(order.status) && (
                              <option value={order.status} disabled>
                                Current: {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                              </option>
                            )}
                            {allowedStatuses.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => {
                              if (isEditable) {
                                setEditingStatus(order.id);
                              } else {
                                alert(
                                  userRole === 'Crew Member' 
                                    ? 'Crew members cannot modify Delivered orders. Only Delivery members or the Owner can manage delivered orders.'
                                    : 'You are not authorized to edit this status.'
                                );
                              }
                            }}
                            className={`px-2.5 py-1 rounded-[100px] text-[11px] font-semibold uppercase tracking-wide status-${order.status} ${isEditable ? 'hover:opacity-80 cursor-pointer' : 'opacity-70 cursor-not-allowed'} transition-opacity`}
                            title={!isEditable ? 'Delivered orders cannot be modified by Crew Members' : 'Click to change status'}
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
                        ) : isEditable ? (
                          <button 
                            onClick={() => setEditingStatus(order.id)}
                            className="p-2 text-text-muted hover:text-text-main hover:bg-black/5 rounded-[8px] transition-colors"
                            title="Update Status"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        ) : (
                          <span className="p-2 text-text-muted/40 text-xs">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
