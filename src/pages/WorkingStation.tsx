import { useState, useEffect, useRef, FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { 
  Coffee, 
  Clock, 
  ArrowRight, 
  CheckCircle, 
  XCircle, 
  Truck, 
  Bell, 
  BellOff, 
  Plus, 
  Search, 
  Sparkles,
  Send,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Volume2
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface PipelineColumn {
  id: OrderStatus;
  title: string;
  subtitle: string;
  badgeClass: string;
  icon: any;
}

const COLUMNS: PipelineColumn[] = [
  { 
    id: 'new', 
    title: 'New Order', 
    subtitle: 'Awaiting Crew acceptance', 
    badgeClass: 'bg-blue-500/15 text-blue-800 border-blue-300',
    icon: Bell 
  },
  { 
    id: 'pending', 
    title: 'Pending', 
    subtitle: 'Queued at station', 
    badgeClass: 'bg-amber-500/15 text-amber-900 border-amber-300',
    icon: Clock 
  },
  { 
    id: 'processing', 
    title: 'Processing', 
    subtitle: 'Brewing & preparing (Customer Notified)', 
    badgeClass: 'bg-purple-500/15 text-purple-900 border-purple-300',
    icon: Coffee 
  },
  { 
    id: 'shipped', 
    title: 'Shipped', 
    subtitle: 'With Delivery Rider', 
    badgeClass: 'bg-indigo-500/15 text-indigo-900 border-indigo-300',
    icon: Truck 
  },
  { 
    id: 'delivered', 
    title: 'Delivered', 
    subtitle: 'Successfully completed', 
    badgeClass: 'bg-emerald-500/15 text-emerald-900 border-emerald-300',
    icon: CheckCircle 
  },
  { 
    id: 'cancelled', 
    title: 'Cancelled', 
    subtitle: 'Voided or cancelled', 
    badgeClass: 'bg-red-500/15 text-red-900 border-red-300',
    icon: XCircle 
  },
];

// Play a pleasant chime for new orders using Web Audio API
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    osc2.frequency.setValueAtTime(880, now + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.15);
    osc1.stop(now + 0.7);
    osc2.stop(now + 0.7);
  } catch (e) {
    console.log('Audio chime not allowed yet by user gesture');
  }
}

export default function WorkingStation() {
  const outletContext = useOutletContext<{ employeeRole?: string; isOwner?: boolean; userEmail?: string }>() || {};
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState<number | null>(null);
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Quick New Order Modal
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newVariant, setNewVariant] = useState('Spanish Latte');
  const [newQuantity, setNewQuantity] = useState(1);
  const [newAddress, setNewAddress] = useState('');
  const [newLandmark, setNewLandmark] = useState('');
  const [newPrice, setNewPrice] = useState('140');
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Role detection from context
  const userRole = outletContext.employeeRole || 'Crew Member';
  const isOwner = outletContext.isOwner || false;

  const previousOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchOrders(true);

    // Setup Supabase Realtime channel for instant pipeline reactivity
    const channel = supabase
      .channel('station-pipeline-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[Pipeline Realtime Update]', payload);
          fetchOrders(false);
        }
      )
      .subscribe();

    // High frequency polling fallback (every 3.5s) to guarantee updates
    const interval = setInterval(() => {
      fetchOrders(false);
    }, 3500);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [soundEnabled]);

  const fetchOrders = async (isFirstLoad = false) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .neq('product_variant', 'EMPLOYEE_ACCOUNT')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Detect newly arrived orders
        const currentIds = new Set(data.map((o) => o.id));
        if (!isFirstLoad && previousOrderIdsRef.current.size > 0) {
          const incomingOrders = data.filter((o) => !previousOrderIdsRef.current.has(o.id));
          if (incomingOrders.length > 0) {
            const first = incomingOrders[0];
            const bannerText = `🔔 New Order Received: ${first.customer_name} ordered ${first.product_variant}!`;
            setNotificationBanner(bannerText);
            if (soundEnabled) playChime();
            setTimeout(() => setNotificationBanner(null), 6000);
          }
        }
        previousOrderIdsRef.current = currentIds;
        setOrders(data as Order[]);
      }
    } catch (err) {
      console.error('Error fetching pipeline orders:', err);
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  };

  // Automated notification to customer's Facebook when status changes
  const notifyCustomerFB = async (order: Order, newStatus: OrderStatus) => {
    try {
      const res = await fetch('/api/orders/notify-fb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          newStatus,
          customerName: order.customer_name,
          productVariant: order.product_variant,
          quantity: order.quantity,
          phone: order.phone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotificationBanner(`💬 Real-time AI Chatbot Alert Dispatched to ${order.customer_name}: Order now in ${newStatus.toUpperCase()}!`);
        setTimeout(() => setNotificationBanner(null), 5000);
      }
    } catch (e) {
      console.warn('Could not post to /api/orders/notify-fb:', e);
    }
  };

  // Status transition handler with role enforcement
  const handleMoveOrder = async (order: Order, newStatus: OrderStatus) => {
    // Role validation
    if (!isOwner) {
      if (userRole === 'Crew Member') {
        if (newStatus === 'delivered') {
          alert('Crew members cannot mark orders as Delivered. Only Delivery riders or the Owner can deliver orders.');
          return;
        }
      }
      if (userRole === 'Delivery Member') {
        if (newStatus !== 'delivered' && newStatus !== 'cancelled') {
          alert('Delivery members are only authorized to mark orders as Delivered or Cancelled.');
          return;
        }
      }
    }

    setUpdatingId(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', order.id);

      if (error) throw error;

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
      );

      // Automated customer FB notification
      await notifyCustomerFB(order, newStatus);
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateQuickOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      alert('Please enter a customer name');
      return;
    }

    setCreatingOrder(true);
    try {
      const parsedPrice = parseFloat(newPrice) || 140;
      const { data, error } = await supabase
        .from('orders')
        .insert([
          {
            customer_name: newCustomerName.trim(),
            email: 'walkin@taratimpla.ph',
            phone: newPhone.trim() || '09123456789',
            city: 'Local Area',
            address: newAddress.trim() || 'Tara Timpla Counter / Local Delivery',
            landmarked: newLandmark.trim() || 'Near counter',
            product_name: 'Tara Timpla Coffee',
            product_variant: newVariant,
            quantity: newQuantity,
            total_price: parsedPrice,
            payment_method: 'COD',
            status: 'new', // starts in new order column!
          },
        ])
        .select();

      if (error) throw error;

      setShowNewOrderModal(false);
      setNewCustomerName('');
      setNewPhone('');
      setNewAddress('');
      setNewLandmark('');
      if (soundEnabled) playChime();
      fetchOrders();
    } catch (err: any) {
      alert('Error creating order: ' + err.message);
    } finally {
      setCreatingOrder(false);
    }
  };

  // Filter orders by search
  const filteredOrders = orders.filter((order) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      order.customer_name?.toLowerCase().includes(s) ||
      order.product_variant?.toLowerCase().includes(s) ||
      order.phone?.toLowerCase().includes(s) ||
      order.city?.toLowerCase().includes(s)
    );
  });

  // Calculate order price helper
  const getOrderTotal = (order: Order) => {
    if (order.total_price) return Number(order.total_price);
    const qty = order.quantity || 1;
    return qty * 135;
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Real-time Notification Banner */}
      {notificationBanner && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-3 rounded-2xl shadow-md flex items-center justify-between animate-pulse transition-all">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-500 text-white rounded-xl">
              <Sparkles size={18} />
            </span>
            <p className="font-semibold text-sm">{notificationBanner}</p>
          </div>
          <button
            onClick={() => setNotificationBanner(null)}
            className="text-amber-800 hover:text-black text-xs font-semibold px-2.5 py-1 bg-white rounded-lg border border-amber-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-[#C68A57]/15 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C68A57]/20 text-[#C68A57] flex items-center justify-center shadow-inner">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#2A1A12] tracking-tight">
                Working Station Pipeline
              </h1>
              <p className="text-xs sm:text-sm text-[#A89B93]">
                Real-time kitchen & delivery dispatch pipeline for Tara Timpla Coffee.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-semibold border border-amber-200">
              Role: {userRole}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-semibold border border-emerald-200 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Sync Active
            </span>
            <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 font-semibold border border-purple-200 flex items-center gap-1">
              <Send size={12} /> Auto FB Messenger: On
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Audio Chime Toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playChime();
            }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              soundEnabled
                ? 'bg-amber-500/15 text-amber-900 border-amber-300'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}
            title="Toggle audible chime when a new order arrives"
          >
            {soundEnabled ? <Volume2 size={15} /> : <BellOff size={15} />}
            {soundEnabled ? 'Chime ON' : 'Chime Muted'}
          </button>

          {/* Quick Refresh */}
          <button
            onClick={() => fetchOrders(false)}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
            title="Refresh now"
          >
            <RotateCcw size={16} />
          </button>

          {/* Add New Order Button */}
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="px-4 py-2.5 rounded-xl bg-[#C68A57] hover:bg-[#B57A47] text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus size={16} />
            + New Station Order
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Filter pipeline by customer, drink, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white/80 border border-[#C68A57]/20 rounded-xl text-sm outline-none focus:border-[#C68A57] focus:ring-1 focus:ring-[#C68A57] text-[#2A1A12]"
        />
      </div>

      {/* 6-Column Pipeline Layout */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="w-10 h-10 border-4 border-[#C68A57] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {COLUMNS.map((col) => {
            const columnOrders = filteredOrders.filter((o) => {
              // Normalize status
              if (col.id === 'new') {
                return o.status === 'new';
              }
              return o.status === col.id;
            });

            const Icon = col.icon;

            return (
              <div
                key={col.id}
                className="bg-white/70 backdrop-blur-md rounded-2xl border border-[rgba(198,138,87,0.18)] shadow-sm flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-1.5 rounded-lg border ${col.badgeClass}`}>
                      <Icon size={15} />
                    </span>
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#2A1A12]">
                        -{col.title}-
                      </h2>
                      <p className="text-[10px] text-[#A89B93] leading-tight">
                        {col.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-bold text-xs flex items-center justify-center">
                    {columnOrders.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                  {columnOrders.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[#A89B93]/70 italic border border-dashed border-gray-200 rounded-xl bg-gray-50/40">
                      No orders
                    </div>
                  ) : (
                    columnOrders.map((order) => {
                      const isUpdating = updatingId === order.id;

                      return (
                        <div
                          key={order.id}
                          className="bg-white p-3 rounded-xl border border-gray-100 shadow-xs hover:shadow-md transition-all relative flex flex-col justify-between group"
                        >
                          {/* Order Header */}
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <span className="text-[10px] font-mono text-gray-400">
                                #{order.id.slice(0, 8)}
                              </span>
                              <span className="text-[10px] text-[#A89B93]">
                                {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                              </span>
                            </div>

                            {/* Customer Name & Order Details */}
                            <div className="mt-1">
                              <p className="text-xs text-gray-500 font-medium">name:</p>
                              <h3 className="font-bold text-sm text-[#2A1A12] leading-snug">
                                {order.customer_name}
                              </h3>
                            </div>

                            <div className="mt-1.5 p-2 rounded-lg bg-amber-50/60 border border-amber-100/80">
                              <p className="text-[10px] text-amber-800 font-semibold uppercase tracking-wide">
                                order:
                              </p>
                              <p className="font-bold text-xs text-[#2A1A12] mt-0.5">
                                {order.product_variant}
                              </p>
                              <div className="flex items-center justify-between text-[11px] text-amber-900 font-medium mt-1">
                                <span>Qty: {order.quantity}</span>
                                <span>₱{getOrderTotal(order).toLocaleString()}</span>
                              </div>
                            </div>

                            {/* Contact / Delivery notes */}
                            <div className="mt-2 text-[11px] text-gray-600 space-y-0.5">
                              {order.phone && (
                                <p className="truncate">📞 {order.phone}</p>
                              )}
                              {order.landmarked && (
                                <p className="text-[#A66E41] font-medium truncate">
                                  📍 {order.landmarked}
                                </p>
                              )}
                              {order.address && (
                                <p className="text-gray-400 text-[10px] truncate" title={order.address}>
                                  {order.address}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Controls by Column & Role */}
                          <div className="mt-3 pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                            {/* NEW ORDER COLUMN ACTIONS */}
                            {col.id === 'new' && (
                              <div className="flex gap-1">
                                <button
                                  disabled={isUpdating}
                                  onClick={() => handleMoveOrder(order, 'pending')}
                                  className="flex-1 py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-colors"
                                >
                                  {isUpdating ? '...' : (
                                    <>
                                      <span>Accept to Pending</span>
                                      <ArrowRight size={12} />
                                    </>
                                  )}
                                </button>
                                <button
                                  disabled={isUpdating}
                                  onClick={() => handleMoveOrder(order, 'cancelled')}
                                  className="py-1.5 px-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-[11px] font-medium"
                                  title="Cancel"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            {/* PENDING COLUMN ACTIONS */}
                            {col.id === 'pending' && (
                              <div className="flex flex-col gap-1">
                                <button
                                  disabled={isUpdating}
                                  onClick={() => handleMoveOrder(order, 'processing')}
                                  className="w-full py-1.5 px-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-semibold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-colors"
                                  title="Moves to Processing and automatically sends FB update to customer!"
                                >
                                  {isUpdating ? '...' : (
                                    <>
                                      <Coffee size={12} />
                                      <span>Start Processing (Notify FB)</span>
                                    </>
                                  )}
                                </button>
                                <div className="flex gap-1">
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => handleMoveOrder(order, 'new')}
                                    className="flex-1 py-1 px-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-[10px]"
                                  >
                                    Back to New
                                  </button>
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => handleMoveOrder(order, 'cancelled')}
                                    className="py-1 px-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* PROCESSING COLUMN ACTIONS */}
                            {col.id === 'processing' && (
                              <div className="flex flex-col gap-1">
                                <button
                                  disabled={isUpdating}
                                  onClick={() => handleMoveOrder(order, 'shipped')}
                                  className="w-full py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-colors"
                                >
                                  {isUpdating ? '...' : (
                                    <>
                                      <Truck size={12} />
                                      <span>Pass to Rider (Shipped)</span>
                                    </>
                                  )}
                                </button>
                                <div className="text-[10px] text-purple-900 bg-purple-50 p-1 rounded font-medium text-center">
                                  🔒 Customer cannot cancel now
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => handleMoveOrder(order, 'pending')}
                                    className="flex-1 py-1 px-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-[10px]"
                                  >
                                    Back to Pending
                                  </button>
                                  {(isOwner || userRole === 'Crew Member') && (
                                    <button
                                      disabled={isUpdating}
                                      onClick={() => {
                                        if (confirm('Customer cannot cancel, but as staff do you wish to void/cancel this order?')) {
                                          handleMoveOrder(order, 'cancelled');
                                        }
                                      }}
                                      className="py-1 px-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-[10px]"
                                    >
                                      Void
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* SHIPPED COLUMN ACTIONS */}
                            {col.id === 'shipped' && (
                              <div className="flex flex-col gap-1">
                                {userRole === 'Crew Member' && !isOwner ? (
                                  <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] text-center font-medium">
                                    🚴 Handed to Rider. Waiting for Delivery member to deliver.
                                  </div>
                                ) : (
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => handleMoveOrder(order, 'delivered')}
                                    className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-colors"
                                  >
                                    {isUpdating ? '...' : (
                                      <>
                                        <CheckCircle size={12} />
                                        <span>Mark Delivered</span>
                                      </>
                                    )}
                                  </button>
                                )}

                                <div className="flex gap-1">
                                  {(userRole === 'Delivery Member' || isOwner) && (
                                    <button
                                      disabled={isUpdating}
                                      onClick={() => handleMoveOrder(order, 'cancelled')}
                                      className="flex-1 py-1 px-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-[10px] font-medium"
                                    >
                                      Failed / Cancel
                                    </button>
                                  )}
                                  {(userRole === 'Crew Member' || isOwner) && (
                                    <button
                                      disabled={isUpdating}
                                      onClick={() => handleMoveOrder(order, 'processing')}
                                      className="py-1 px-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-[10px]"
                                    >
                                      Return to Kitchen
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* DELIVERED COLUMN ACTIONS */}
                            {col.id === 'delivered' && (
                              <div className="text-center py-1">
                                <span className="inline-flex items-center gap-1 text-emerald-800 text-[11px] font-bold">
                                  <CheckCircle size={13} /> Completed
                                </span>
                                {isOwner && (
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => handleMoveOrder(order, 'shipped')}
                                    className="block mx-auto mt-1 text-[10px] text-gray-400 hover:text-gray-700 underline"
                                  >
                                    Revert to Shipped
                                  </button>
                                )}
                              </div>
                            )}

                            {/* CANCELLED COLUMN ACTIONS */}
                            {col.id === 'cancelled' && (
                              <div className="text-center py-1">
                                <span className="inline-flex items-center gap-1 text-red-700 text-[11px] font-bold">
                                  <XCircle size={13} /> Cancelled
                                </span>
                                {(isOwner || userRole === 'Crew Member') && (
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => handleMoveOrder(order, 'pending')}
                                    className="block mx-auto mt-1 text-[10px] text-amber-700 hover:underline"
                                  >
                                    Restore to Pending
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Station Order Modal */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#C68A57]/20 text-[#C68A57] rounded-xl">
                  <Coffee size={18} />
                </div>
                <h3 className="text-lg font-serif font-bold text-[#2A1A12]">
                  New Station Order
                </h3>
              </div>
              <button
                onClick={() => setShowNewOrderModal(false)}
                className="text-gray-400 hover:text-gray-700 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuickOrder} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Maria Santos"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#C68A57] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Drink / Order Variant *
                </label>
                <select
                  value={newVariant}
                  onChange={(e) => {
                    setNewVariant(e.target.value);
                    if (e.target.value.includes('Spanish Latte')) setNewPrice('140');
                    else if (e.target.value.includes('Caramel')) setNewPrice('145');
                    else if (e.target.value.includes('Cold Brew')) setNewPrice('130');
                    else setNewPrice('120');
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#C68A57] outline-none font-medium"
                >
                  <option value="Spanish Latte">Spanish Latte (₱140)</option>
                  <option value="Caramel Macchiato">Caramel Macchiato (₱145)</option>
                  <option value="Hazelnut Cream Latte">Hazelnut Cream Latte (₱150)</option>
                  <option value="Vanilla Sweet Cream Cold Brew">Vanilla Sweet Cream Cold Brew (₱130)</option>
                  <option value="Americano">Americano (₱110)</option>
                  <option value="Butter Croissant Combo">Butter Croissant Combo (₱190)</option>
                  <option value="Dark Mocha Latte">Dark Mocha Latte (₱145)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#C68A57] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Total (₱)
                  </label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#C68A57] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., 09171234567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#C68A57] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Delivery Address / Landmark
                </label>
                <input
                  type="text"
                  placeholder="Address or landmark"
                  value={newLandmark}
                  onChange={(e) => setNewLandmark(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#C68A57] outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingOrder}
                  className="flex-1 py-2.5 rounded-xl bg-[#C68A57] hover:bg-[#B57A47] text-white font-semibold text-xs shadow-md transition-all"
                >
                  {creatingOrder ? 'Placing...' : 'Send to Pipeline (-New Order-)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
