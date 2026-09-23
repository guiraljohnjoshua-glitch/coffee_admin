import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { 
  Coffee, 
  Send, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Truck, 
  ShoppingBag, 
  ChevronRight, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Heart, 
  Store, 
  Sliders, 
  ArrowRight,
  RefreshCw,
  Bell,
  MapPin,
  Phone,
  User,
  AlertCircle,
  TrendingUp,
  BarChart3,
  FileText,
  Search,
  DollarSign,
  Activity
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface StoreAnalytics {
  totalOrdersCount: number;
  totalGrossRevenue: number;
  deliveredRevenue: number;
  todayRevenue: number;
  todayOrdersCount: number;
  countsByStatus: {
    new: number;
    pending: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  activeOrdersCount: number;
  avgOrderValue: number;
  fulfillmentRate: number;
  topProducts: { name: string; count: number; total: number }[];
  paymentBreakdown: {
    cod: { count: number; total: number };
    gcash: { count: number; total: number };
  };
  allOrders: Order[];
}

// Markdown-like text renderer for clean financial and audit responses
function FormattedBotText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-1" />;
        }

        const parts = line.split(/(\*\*.*?\*\*)/g);
        const renderedLine = parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={partIdx} className="text-[#E8B688] font-bold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return (
              <em key={partIdx} className="text-[#C2B2A7]">
                {part.slice(1, -1)}
              </em>
            );
          }
          return <span key={partIdx}>{part}</span>;
        });

        const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*');
        const isHeader =
          line.startsWith('📊') ||
          line.startsWith('📈') ||
          line.startsWith('📋') ||
          line.startsWith('🏆') ||
          line.startsWith('💰');

        return (
          <div
            key={lineIdx}
            className={`${isHeader ? 'font-serif font-bold text-sm sm:text-base text-[#F7F4EB] pb-0.5' : ''} ${
              isBullet ? 'pl-2 text-[#EFEBE4] border-l-2 border-[#C68A57]/40 my-0.5' : ''
            }`}
          >
            {renderedLine}
          </div>
        );
      })}
    </div>
  );
}

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'system';
  text: string;
  timestamp: string;
  orderCard?: {
    id: string;
    product: string;
    quantity: number;
    price: number;
    status: OrderStatus;
    customerName: string;
    address: string;
    paymentMethod: string;
  };
  proposalCard?: {
    product: string;
    quantity: number;
    price: number;
    size: string;
    temperature: string;
    sweetness: string;
    milk: string;
  };
  milestoneType?: 'order_placed' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
}

const MENU_SPECIALTIES = [
  {
    name: 'Spanish Latte',
    category: 'Espresso',
    price: 140,
    desc: 'Signature double espresso, sweet condensed milk, velvety fresh milk.',
    tag: 'Best Seller ⭐',
    popularSize: '16oz',
    img: '☕'
  },
  {
    name: 'Caramel Macchiato',
    category: 'Espresso',
    price: 145,
    desc: 'Vanilla syrup, cold or steamed milk, bold espresso, rich caramel drizzle.',
    tag: 'Customer Fave',
    popularSize: '16oz',
    img: '🍮'
  },
  {
    name: 'Sea Salt Latte',
    category: 'Signature',
    price: 150,
    desc: 'Artisan iced latte topped with thick whipped Himalayan sea salt cream.',
    tag: 'Trending 🔥',
    popularSize: '16oz',
    img: '🌊'
  },
  {
    name: 'Cold Brew Reserve',
    category: 'Slow Brew',
    price: 130,
    desc: '18-hour cold steeped Arabica blend, exceptionally smooth & crisp.',
    tag: 'High Caffeine',
    popularSize: '16oz',
    img: '🧊'
  },
  {
    name: 'Butter Croissant',
    category: 'Bakery',
    price: 85,
    desc: 'Freshly baked flaky all-butter French croissant.',
    tag: 'Daily Bake',
    popularSize: '1 pc',
    img: '🥐'
  },
  {
    name: 'Ube Cheese Pandesal',
    category: 'Bakery',
    price: 45,
    desc: 'Soft purple yam bread with sweet ube halaya and savory melted cheddar.',
    tag: 'Filipino Classic',
    popularSize: '1 pc',
    img: '🍠'
  }
];

// Pleasant chime for chatbot order milestones
function playBaristaChime(type: 'placed' | 'milestone' | 'delivered' | 'cancelled') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'delivered') {
      // Triumphant chord
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.3); // G5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.45); // C6
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    } else if (type === 'cancelled') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  } catch (e) {
    // ignore audio policy restrictions
  }
}

export default function AiBaristaChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'bot',
      text: '☕ Kumusta! Maligayang pagdating sa Tara Timpla Coffee! I am your AI Barista & Order Assistant.\n\nI can answer any questions about our specialty beans, customizations, and flavors — or help you choose your drink, close the deal, and place your order directly right here!\n\nWhat are you craving today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [customerName, setCustomerName] = useState('Joshua');
  const [customerPhone, setCustomerPhone] = useState('09178901234');
  const [customerAddress, setCustomerAddress] = useState('Unit 402, Acacia Residences, Makati');
  const [isTyping, setIsTyping] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Active tracked order
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [previousStatus, setPreviousStatus] = useState<OrderStatus | null>(null);

  // Store intelligence & tracked records state
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'coffee' | 'sales' | 'records'>('coffee');
  const [recordFilter, setRecordFilter] = useState<'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [recordSearch, setRecordSearch] = useState('');

  // Order deal closure builder modal / state
  const [selectedProduct, setSelectedProduct] = useState('Spanish Latte');
  const [selectedSize, setSelectedSize] = useState<'16oz' | '22oz'>('16oz');
  const [selectedTemp, setSelectedTemp] = useState<'Iced' | 'Hot'>('Iced');
  const [selectedSweetness, setSelectedSweetness] = useState('50%');
  const [selectedMilk, setSelectedMilk] = useState('Fresh Milk');
  const [extraShot, setExtraShot] = useState(false);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'GCash'>('COD');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSimulator, setShowSimulator] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeOrderIdRef = useRef<string | null>(null);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Keep ref in sync
  useEffect(() => {
    activeOrderIdRef.current = activeOrder ? activeOrder.id : null;
  }, [activeOrder]);

  // Periodic fetcher for store analytics and progress
  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/store/analytics');
      const data = await res.json();
      if (data.success && data.analytics) {
        setStoreAnalytics(data.analytics);
      }
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 8000);
    return () => clearInterval(interval);
  }, []);

  // Listen for realtime changes on the active order from the Working Station
  useEffect(() => {
    if (!activeOrder?.id) return;

    console.log('[AI Chatbot] Subscribing to live updates for order:', activeOrder.id);

    const channel = supabase
      .channel(`order-tracker-${activeOrder.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${activeOrder.id}`,
        },
        (payload) => {
          console.log('[AI Chatbot] Live Working Station Order Update:', payload);
          if (payload.new) {
            handleLiveStatusTransition(payload.new as Order);
          }
        }
      )
      .subscribe();

    // High frequency polling fallback (every 3 seconds) to ensure customer is instantly notified
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('id', activeOrder.id)
          .single();

        if (data && data.status !== activeOrder.status) {
          handleLiveStatusTransition(data as Order);
        }
      } catch (err) {
        // silent fallback
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [activeOrder?.id, activeOrder?.status]);

  // When order moves through the pipeline, inject the AI Barista notification message
  const handleLiveStatusTransition = (updated: Order) => {
    if (updated.status === previousStatus && updated.status === activeOrder?.status) return;

    setActiveOrder(updated);
    setPreviousStatus(updated.status);

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = updated.customer_name || customerName || 'Valued Customer';
    const shortId = updated.id.slice(0, 8);
    const item = updated.product_variant;

    let notificationText = '';
    let milestoneType: ChatMessage['milestoneType'] = 'pending';

    if (updated.status === 'pending') {
      milestoneType = 'pending';
      notificationText = `📋 **Order Queued!**\nHi ${name}! Your order #${shortId} (${item}) has been confirmed and queued up in our Working Station. Our crew is preparing the espresso station!`;
      if (soundEnabled) playBaristaChime('milestone');
    } else if (updated.status === 'processing') {
      milestoneType = 'processing';
      notificationText = `☕ **Brewing in Progress!**\nBarista update from our Working Station: We just began freshly grinding the beans and steaming milk for your **${item}**! ✨\n\n*Store Policy Reminder:* Your drink is now in active craft and locked in! It won't be long now before that fresh aroma is in your hands!`;
      if (soundEnabled) playBaristaChime('milestone');
    } else if (updated.status === 'shipped') {
      milestoneType = 'shipped';
      notificationText = `🛵 **Out for Delivery!**\nYour drink is sealed, packed, and handed over to our delivery rider! The rider is en route to **${updated.address || 'your delivery address'}**.\n\nPlease keep your phone reachable at **${updated.phone}** for the rider's arrival!`;
      if (soundEnabled) playBaristaChime('milestone');
    } else if (updated.status === 'delivered') {
      milestoneType = 'delivered';
      notificationText = `🎉 **YOUR ORDER HAS BEEN DELIVERED!** ☕✨\n\n**Thank you so much, ${name}, for ordering with Tara Timpla Coffee!** We truly appreciate your support. We hope every sip brings you warmth, joy, and that perfect coffee bliss today.\n\nEnjoy your timpla, stay caffeinated, and we can't wait to brew for you again soon! Have a blessed day! ❤️`;
      if (soundEnabled) playBaristaChime('delivered');
    } else if (updated.status === 'cancelled') {
      milestoneType = 'cancelled';
      notificationText = `❌ **Order Status: Cancelled**\nYour order #${shortId} has been marked as CANCELLED.\n\nThank you for considering Tara Timpla Coffee! If this was cancelled by mistake or you need assistance with a new order or refund, please reply right here anytime and our barista will help you out. Salamat!`;
      if (soundEnabled) playBaristaChime('cancelled');
    }

    if (notificationText) {
      setMessages((prev) => [
        ...prev,
        {
          id: `status-${updated.status}-${Date.now()}`,
          sender: 'bot',
          text: notificationText,
          timestamp: time,
          milestoneType,
          orderCard: {
            id: updated.id,
            product: updated.product_variant,
            quantity: updated.quantity,
            price: updated.total_price || 140,
            status: updated.status,
            customerName: updated.customer_name,
            address: updated.address,
            paymentMethod: updated.payment_method || 'COD',
          },
        },
      ]);
    }
  };

  // Calculate current customized drink price
  const calculateDrinkPrice = () => {
    const base = MENU_SPECIALTIES.find((m) => m.name === selectedProduct)?.price || 140;
    const sizeAdd = selectedSize === '22oz' ? 25 : 0;
    const milkAdd = selectedMilk === 'Oat Milk' || selectedMilk === 'Almond Milk' ? 30 : 0;
    const shotAdd = extraShot ? 30 : 0;
    return (base + sizeAdd + milkAdd + shotAdd) * orderQuantity;
  };

  // Send message to Gemini AI Barista
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'customer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          customerName,
          orderId: activeOrder?.id,
          activeOrderPhone: customerPhone,
        }),
      });

      const data = await response.json();
      setIsTyping(false);

      if (data.storeAnalytics) {
        setStoreAnalytics(data.storeAnalytics);
      }

      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // If the AI closed the deal and created an order in the database
      if (data.actionTaken === 'ORDER_CREATED' && data.createdOrder) {
        const newOrder = data.createdOrder as Order;
        setActiveOrder(newOrder);
        setPreviousStatus(newOrder.status);
        if (soundEnabled) playBaristaChime('placed');

        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: 'bot',
            text: data.reply,
            timestamp: botTime,
            milestoneType: 'order_placed',
            orderCard: {
              id: newOrder.id,
              product: newOrder.product_variant,
              quantity: newOrder.quantity,
              price: newOrder.total_price || 140,
              status: newOrder.status,
              customerName: newOrder.customer_name,
              address: newOrder.address,
              paymentMethod: newOrder.payment_method || 'COD',
            },
          },
        ]);
        return;
      }

      // If the AI processed a cancellation
      if (data.actionTaken === 'ORDER_CANCELLED') {
        if (activeOrder) {
          setActiveOrder({ ...activeOrder, status: 'cancelled' });
        }
        if (soundEnabled) playBaristaChime('cancelled');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: data.reply || 'Tara Timpla Coffee is delighted to serve you! How else can I help you today?',
          timestamp: botTime,
        },
      ]);
    } catch (err: any) {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text: `☕ Tara Timpla AI Barista: Kumusta po! I can definitely help you with our handcrafted drinks or check your order. What would you like to order today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  // Direct deal closure via interactive UI button
  const handleConfirmDirectOrder = async () => {
    if (!customerName.trim() || !customerAddress.trim()) {
      alert('Please fill in your name and delivery address so our barista can deliver your coffee!');
      return;
    }

    setIsPlacingOrder(true);
    const totalPrice = calculateDrinkPrice();
    const productVariant = `${selectedProduct} (${selectedSize}, ${selectedTemp}, ${selectedSweetness} Sweetness, ${selectedMilk}${extraShot ? ', +Extra Shot' : ''})`;

    try {
      const res = await fetch('/api/ai-chat/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          phone: customerPhone.trim(),
          address: customerAddress.trim(),
          landmarked: 'Placed via Website AI Barista Chatbot',
          product_variant: productVariant,
          quantity: orderQuantity,
          total_price: totalPrice,
          payment_method: paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order');

      const created = data.order as Order;
      setActiveOrder(created);
      setPreviousStatus(created.status);
      setShowOrderModal(false);
      if (soundEnabled) playBaristaChime('placed');

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Add customer message and bot confirmation
      setMessages((prev) => [
        ...prev,
        {
          id: `cust-${Date.now()}`,
          sender: 'customer',
          text: `☕ I'd like to place an order: ${orderQuantity}x ${productVariant} to ${customerAddress}. Payment: ${paymentMethod}. Total: ₱${totalPrice}.`,
          timestamp: time,
        },
        {
          id: `bot-conf-${Date.now()}`,
          sender: 'bot',
          text: `✨ **DEAL CLOSED! Order #${created.id.slice(0, 8)} Placed Successfully!**\n\nSalamat ${customerName}! Your order has been dispatched directly into our barista team's **Working Station**. You can watch your drink move from queue to brewing, out for delivery, and to your door right here in this chat! ☕🎉`,
          timestamp: time,
          milestoneType: 'order_placed',
          orderCard: {
            id: created.id,
            product: created.product_variant,
            quantity: created.quantity,
            price: created.total_price || totalPrice,
            status: created.status,
            customerName: created.customer_name,
            address: created.address,
            paymentMethod: created.payment_method || 'COD',
          },
        },
      ]);
    } catch (err: any) {
      alert('Error placing order: ' + err.message);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Helper for quick test simulator: simulates moving order in Working Station
  const handleSimulateStatusChange = async (targetStatus: OrderStatus) => {
    if (!activeOrder) return;
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: targetStatus })
        .eq('id', activeOrder.id);

      if (error) throw error;
    } catch (e: any) {
      console.warn('Simulation update:', e.message);
    }
  };

  // Quick Action Chips
  const quickActions = [
    { label: "📊 How's sales going?", prompt: "How's the sales going today and what is our revenue?" },
    { label: '📈 Store Progress', prompt: 'What is the current progress of the store and our active pipeline?' },
    { label: '📋 Track All Records', prompt: 'Please track all the records and show recent order transactions.' },
    { label: '🏆 Best Sellers', prompt: 'What are our top 3 best-selling specialty drinks?' },
    { label: '☕ Order Spanish Latte', prompt: 'I would like to order an Iced Spanish Latte please!' },
    { label: '🔍 Check My Order', prompt: 'What is the current status of my order?' },
  ];

  return (
    <div className="min-h-screen bg-[#1F120C] text-[#F7F4EB] flex flex-col">
      {/* Top Header */}
      <div className="border-b border-[#3D2619] bg-[#2A1810]/90 backdrop-blur-md px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] flex items-center justify-center text-white shadow-md shadow-[#C68A57]/20 border border-[#E8B688]/30">
            <Coffee className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-bold text-lg text-[#F7F4EB] tracking-wide">
                Tara Timpla AI Barista
              </h1>
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live on Website
              </span>
            </div>
            <p className="text-xs text-[#A89B93]">
              Ask sales & progress • Track all records • Close deals & order coffee • Working Station sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-all text-xs flex items-center gap-1.5 ${
              soundEnabled
                ? 'border-[#C68A57]/50 bg-[#C68A57]/20 text-[#E8B688]'
                : 'border-white/10 bg-white/5 text-white/40'
            }`}
            title={soundEnabled ? 'Chime sound enabled' : 'Chime sound muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound ON' : 'Muted'}</span>
          </button>

          <button
            onClick={() => setShowOrderModal(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#C68A57] to-[#B3743E] hover:from-[#B3743E] hover:to-[#9F6230] text-white font-medium text-xs shadow-md shadow-[#C68A57]/30 flex items-center gap-1.5 transition-all transform active:scale-95"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Order Coffee Now</span>
          </button>
        </div>
      </div>

      {/* Live Store Sales & Progress Pulse Ribbon */}
      <div className="bg-[#1A0E08] border-b border-[#3D2619] px-4 py-2 flex items-center gap-3 overflow-x-auto no-scrollbar shadow-inner text-xs">
        <div className="flex items-center gap-1.5 text-[#E8B688] font-bold text-[11px] uppercase tracking-wider shrink-0 pr-3 border-r border-[#3D2619]">
          <TrendingUp className="w-3.5 h-3.5 text-[#C68A57]" />
          <span>Live Pulse</span>
        </div>

        <button
          onClick={() => handleSendMessage("How's the sales going today and what is our revenue?")}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-[#C68A57]/50 transition-all text-left group"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Today's Sales</span>
            <span className="font-bold text-[#E8B688] text-xs leading-tight group-hover:text-white">
              ₱{(storeAnalytics?.todayRevenue || 0).toLocaleString()}
            </span>
          </div>
        </button>

        <button
          onClick={() => handleSendMessage("What is our total gross store revenue to date?")}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-[#C68A57]/50 transition-all text-left group"
        >
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Total Gross Sales</span>
            <span className="font-bold text-[#F7F4EB] text-xs leading-tight">
              ₱{(storeAnalytics?.totalGrossRevenue || 0).toLocaleString()}
            </span>
          </div>
        </button>

        <button
          onClick={() => handleSendMessage("What is the current progress of the store and how many are brewing?")}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-purple-400/50 transition-all text-left group"
        >
          <div className="w-2 h-2 rounded-full bg-purple-400" />
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Brewing (Station)</span>
            <span className="font-bold text-purple-300 text-xs leading-tight">
              {storeAnalytics?.countsByStatus?.processing || 0} in craft
            </span>
          </div>
        </button>

        <button
          onClick={() => handleSendMessage("How many orders are currently out with riders on delivery?")}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-blue-400/50 transition-all text-left group"
        >
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">On Delivery</span>
            <span className="font-bold text-blue-300 text-xs leading-tight">
              {storeAnalytics?.countsByStatus?.shipped || 0} with riders
            </span>
          </div>
        </button>

        <button
          onClick={() => handleSendMessage("Please track all the records and list all customer orders.")}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-[#C68A57]/50 transition-all text-left group sm:ml-auto"
        >
          <FileText className="w-3.5 h-3.5 text-[#C68A57]" />
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Tracked Records</span>
            <span className="font-bold text-[#E8B688] text-xs leading-tight">
              {storeAnalytics?.totalOrdersCount || 0} orders
            </span>
          </div>
        </button>
      </div>

      {/* Main Grid: Chat + Active Order Pipeline Radar */}
      <div className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left / Center: Chat Stream (8 cols) */}
        <div className="lg:col-span-8 flex flex-col h-[calc(100vh-65px)] border-r border-[#3D2619] bg-[#1a0f0a]">
          {/* Active Order Live Tracker Banner (if customer has an active order) */}
          {activeOrder && (
            <div className="bg-gradient-to-r from-[#2F1D13] via-[#3B2215] to-[#2F1D13] border-b border-[#C68A57]/30 p-3.5 px-4 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#E8B688]">
                    Active Tracked Order #{activeOrder.id.slice(0, 8)}
                  </span>
                </div>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                    activeOrder.status === 'delivered'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : activeOrder.status === 'processing'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse'
                      : activeOrder.status === 'shipped'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : activeOrder.status === 'cancelled'
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {activeOrder.status === 'processing' ? '☕ Brewing (Processing)' : activeOrder.status}
                </span>
              </div>

              {/* Progress Milestones */}
              <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-medium pt-1">
                {[
                  { key: 'new', label: '1. Received', icon: Clock },
                  { key: 'pending', label: '2. Queued', icon: Bell },
                  { key: 'processing', label: '3. Brewing', icon: Coffee },
                  { key: 'shipped', label: '4. On Delivery', icon: Truck },
                  { key: 'delivered', label: '5. Delivered', icon: CheckCircle },
                ].map((step, idx) => {
                  const statusOrder = ['new', 'pending', 'processing', 'shipped', 'delivered'];
                  const currentIndex = statusOrder.indexOf(activeOrder.status);
                  const stepIndex = statusOrder.indexOf(step.key);
                  const isPassed = currentIndex >= stepIndex && activeOrder.status !== 'cancelled';
                  const isCurrent = activeOrder.status === step.key;

                  return (
                    <div
                      key={step.key}
                      className={`p-1.5 rounded-lg border transition-all ${
                        isCurrent
                          ? 'bg-[#C68A57] text-white border-[#E8B688] font-bold shadow-md shadow-[#C68A57]/30 scale-[1.03]'
                          : isPassed
                          ? 'bg-[#C68A57]/20 text-[#E8B688] border-[#C68A57]/40'
                          : 'bg-black/20 text-[#6B5A50] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-center mb-0.5">
                        <step.icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">{step.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Status note */}
              <div className="mt-2 text-[11px] text-[#C2B2A7] flex items-center justify-between">
                <span>{activeOrder.product_variant}</span>
                <span className="font-semibold text-[#E8B688]">₱{activeOrder.total_price || 140}</span>
              </div>
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender !== 'customer' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md border border-[#E8B688]/30">
                    <Coffee className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[75%] space-y-2`}>
                  {/* Speech Bubble */}
                  <div
                    className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-md ${
                      msg.sender === 'customer'
                        ? 'bg-gradient-to-r from-[#C68A57] to-[#B3743E] text-white rounded-br-none whitespace-pre-line'
                        : msg.milestoneType === 'delivered'
                        ? 'bg-emerald-950/80 text-emerald-100 border border-emerald-500/40 rounded-bl-none'
                        : msg.milestoneType === 'cancelled'
                        ? 'bg-red-950/80 text-red-100 border border-red-500/40 rounded-bl-none'
                        : msg.milestoneType === 'processing'
                        ? 'bg-purple-950/80 text-purple-100 border border-purple-500/40 rounded-bl-none'
                        : 'bg-[#2A1810] text-[#F7F4EB] border border-[#3D2619] rounded-bl-none'
                    }`}
                  >
                    {msg.sender === 'customer' ? msg.text : <FormattedBotText text={msg.text} />}
                  </div>

                  {/* Order Receipt Card if order is embedded in this message */}
                  {msg.orderCard && (
                    <div className="bg-[#1A0E08] border border-[#C68A57]/40 rounded-2xl p-3.5 shadow-lg space-y-2.5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E8B688]">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Order Receipt #{msg.orderCard.id.slice(0, 8)}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#C68A57]/20 text-[#E8B688] border border-[#C68A57]/30">
                          {msg.orderCard.status}
                        </span>
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="flex justify-between text-[#F7F4EB] font-medium">
                          <span>{msg.orderCard.product}</span>
                          <span className="text-[#E8B688] font-bold">₱{msg.orderCard.price}</span>
                        </div>
                        <div className="text-[#A89B93] flex items-center gap-1 text-[11px]">
                          <User className="w-3 h-3" />
                          <span>{msg.orderCard.customerName}</span>
                        </div>
                        <div className="text-[#A89B93] flex items-center gap-1 text-[11px]">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{msg.orderCard.address}</span>
                        </div>
                      </div>

                      {/* Store Policy footer badge */}
                      <div className="text-[10px] bg-black/30 rounded-lg p-2 text-[#A89B93] border border-white/5 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Cancellations allowed in Pending. Once in Brewing (Processing), drink is locked in.</span>
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-[#6B5A50] px-1">
                    {msg.timestamp}
                  </div>
                </div>

                {msg.sender === 'customer' && (
                  <div className="w-8 h-8 rounded-xl bg-[#3D2619] flex items-center justify-center text-[#C68A57] shrink-0 mt-0.5 border border-white/10">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 justify-start items-center">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] flex items-center justify-center text-white shrink-0 shadow-md">
                  <Coffee className="w-4 h-4" />
                </div>
                <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-1.5 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-[#A89B93] ml-2">Tara Timpla Barista is typing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Suggestion Chips */}
          <div className="px-4 py-2 border-t border-[#3D2619]/60 bg-[#22130C]/80 overflow-x-auto flex gap-2 no-scrollbar">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(action.prompt)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-[#2F1D13] hover:bg-[#3D2619] text-xs text-[#E8B688] border border-[#C68A57]/30 hover:border-[#C68A57] transition-all transform active:scale-95"
              >
                {action.label}
              </button>
            ))}
          </div>

          {/* Message Input Box */}
          <div className="p-3.5 border-t border-[#3D2619] bg-[#2A1810]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask barista, customize your drink, or say 'I want to order Spanish Latte'..."
                className="flex-1 bg-[#1A0E08] border border-[#3D2619] focus:border-[#C68A57] focus:ring-1 focus:ring-[#C68A57] rounded-xl px-4 py-3 text-sm text-[#F7F4EB] placeholder-[#6B5A50] outline-none transition-all"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                className="p-3 rounded-xl bg-gradient-to-r from-[#C68A57] to-[#B3743E] hover:from-[#B3743E] hover:to-[#9F6230] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95 shadow-md shadow-[#C68A57]/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Sidebar: 3-in-1 Power Hub (Barista / Sales & Progress / Tracked Records) (4 cols) */}
        <div className="lg:col-span-4 h-[calc(100vh-105px)] overflow-y-auto bg-[#22130C] p-3.5 space-y-3.5">
          {/* 3-Tab Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#1A0E08] rounded-2xl border border-[#3D2619] text-xs font-semibold shadow-inner">
            <button
              onClick={() => setSidebarTab('coffee')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'coffee'
                  ? 'bg-gradient-to-r from-[#C68A57] to-[#B3743E] text-white shadow-md shadow-[#C68A57]/20 font-bold'
                  : 'text-[#A89B93] hover:text-[#F7F4EB] hover:bg-white/5'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Barista</span>
            </button>

            <button
              onClick={() => setSidebarTab('sales')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'sales'
                  ? 'bg-gradient-to-r from-[#C68A57] to-[#B3743E] text-white shadow-md shadow-[#C68A57]/20 font-bold'
                  : 'text-[#A89B93] hover:text-[#F7F4EB] hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Sales & Progress</span>
            </button>

            <button
              onClick={() => setSidebarTab('records')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'records'
                  ? 'bg-gradient-to-r from-[#C68A57] to-[#B3743E] text-white shadow-md shadow-[#C68A57]/20 font-bold'
                  : 'text-[#A89B93] hover:text-[#F7F4EB] hover:bg-white/5'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>All Records</span>
            </button>
          </div>

          {/* TAB 1: COFFEE BAR & ORDER SIMULATOR */}
          {sidebarTab === 'coffee' && (
            <div className="space-y-3.5">
              {/* Customer Profile & Address Card */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#E8B688] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#C68A57]" />
                    Customer Delivery Profile
                  </span>
                  <span className="text-[10px] text-[#A89B93]">Synced to Chat</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] text-[#A89B93] block mb-1">Your Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-lg px-2.5 py-1.5 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#A89B93] block mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-lg px-2.5 py-1.5 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#A89B93] block mb-1">Delivery Address</label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-lg px-2.5 py-1.5 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                    />
                  </div>
                </div>
              </div>

              {/* Working Station Real-time Simulator Panel */}
              <div className="bg-[#2A1810] border border-[#C68A57]/30 rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <Store className="w-4 h-4 text-[#C68A57]" />
                    <span>Working Station Live Simulator</span>
                  </div>
                  <button
                    onClick={() => setShowSimulator(!showSimulator)}
                    className="text-[10px] text-[#A89B93] hover:text-[#E8B688]"
                  >
                    {showSimulator ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                {showSimulator && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-[#A89B93] leading-relaxed">
                      Test the real-time order alerts! When your barista or rider moves the order status in the store, the AI Chatbot automatically sends live updates & the thank you note:
                    </p>

                    {activeOrder ? (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          onClick={() => handleSimulateStatusChange('pending')}
                          className="px-2 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition-all"
                        >
                          Move to Pending
                        </button>
                        <button
                          onClick={() => handleSimulateStatusChange('processing')}
                          className="px-2 py-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[11px] font-medium transition-all"
                        >
                          ☕ Barista Brewing
                        </button>
                        <button
                          onClick={() => handleSimulateStatusChange('shipped')}
                          className="px-2 py-2 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-[11px] font-medium transition-all"
                        >
                          🛵 Out for Delivery
                        </button>
                        <button
                          onClick={() => handleSimulateStatusChange('delivered')}
                          className="px-2 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all"
                        >
                          🎉 Delivered & Thank You
                        </button>
                        <button
                          onClick={() => handleSimulateStatusChange('cancelled')}
                          className="col-span-2 px-2 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-[11px] font-medium transition-all"
                        >
                          ❌ Cancel Order & Send Message
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-[#A89B93]">
                        Place an order or ask the AI to order coffee to enable the real-time simulator controls!
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Menu Catalog (Click to Order) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#E8B688]">
                    Popular Menu Items
                  </h2>
                  <span className="text-[10px] text-[#A89B93]">Click to Order</span>
                </div>

                <div className="space-y-2">
                  {MENU_SPECIALTIES.map((item) => (
                    <div
                      key={item.name}
                      onClick={() => {
                        setSelectedProduct(item.name);
                        setShowOrderModal(true);
                      }}
                      className="bg-[#2A1810] hover:bg-[#331E14] border border-[#3D2619] hover:border-[#C68A57]/60 rounded-xl p-3 cursor-pointer transition-all transform active:scale-[0.99] flex items-center justify-between shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl group-hover:scale-110 transition-transform">
                          {item.img}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#F7F4EB]">{item.name}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#C68A57]/20 text-[#E8B688] border border-[#C68A57]/30">
                              {item.tag}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#A89B93] line-clamp-1">{item.desc}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-[#E8B688]">₱{item.price}</div>
                        <div className="text-[10px] text-[#C68A57] flex items-center gap-0.5 justify-end group-hover:underline">
                          <span>Order</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE SALES & WORKING STATION PROGRESS */}
          {sidebarTab === 'sales' && (
            <div className="space-y-3.5">
              {/* Financial Snapshot Cards */}
              <div className="bg-[#2A1810] border border-[#C68A57]/30 rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <TrendingUp className="w-4 h-4 text-[#C68A57]" />
                    <span>Real-Time Sales Performance</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Live Supabase
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#1A0E08] border border-[#3D2619] rounded-xl p-3">
                    <span className="text-[10px] text-[#A89B93] block">Today's Revenue</span>
                    <span className="text-base font-bold text-[#E8B688]">
                      ₱{(storeAnalytics?.todayRevenue || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">
                      {storeAnalytics?.todayOrdersCount || 0} order(s) today
                    </span>
                  </div>

                  <div className="bg-[#1A0E08] border border-[#3D2619] rounded-xl p-3">
                    <span className="text-[10px] text-[#A89B93] block">Total Gross Sales</span>
                    <span className="text-base font-bold text-[#F7F4EB]">
                      ₱{(storeAnalytics?.totalGrossRevenue || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[#A89B93] block mt-0.5">
                      {storeAnalytics?.totalOrdersCount || 0} all-time records
                    </span>
                  </div>

                  <div className="bg-[#1A0E08] border border-[#3D2619] rounded-xl p-3">
                    <span className="text-[10px] text-[#A89B93] block">Delivered (Realized)</span>
                    <span className="text-base font-bold text-emerald-300">
                      ₱{(storeAnalytics?.deliveredRevenue || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[#A89B93] block mt-0.5">
                      {storeAnalytics?.countsByStatus?.delivered || 0} delivered orders
                    </span>
                  </div>

                  <div className="bg-[#1A0E08] border border-[#3D2619] rounded-xl p-3">
                    <span className="text-[10px] text-[#A89B93] block">Avg Order Value (AOV)</span>
                    <span className="text-base font-bold text-[#E8B688]">
                      ₱{storeAnalytics?.avgOrderValue || 0}
                    </span>
                    <span className="text-[10px] text-purple-300 block mt-0.5">
                      Fulfillment: {storeAnalytics?.fulfillmentRate || 100}%
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleSendMessage("How's the sales going today and what is our revenue breakdown?")}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-[#C68A57]/30 to-[#8C4E28]/30 hover:from-[#C68A57]/50 hover:to-[#8C4E28]/50 border border-[#C68A57]/40 text-xs font-semibold text-[#E8B688] flex items-center justify-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ask AI for Executive Sales Report</span>
                </button>
              </div>

              {/* Working Station Live Pipeline Counters */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <Store className="w-4 h-4 text-[#C68A57]" />
                    <span>Working Station Pipeline Stages</span>
                  </div>
                  <span className="text-[10px] text-[#A89B93]">
                    {storeAnalytics?.activeOrdersCount || 0} active in queue
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A0E08] border border-purple-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                      <span>☕ Actively Brewing (Processing)</span>
                    </div>
                    <span className="font-bold text-purple-300">
                      {storeAnalytics?.countsByStatus?.processing || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A0E08] border border-blue-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span>🛵 Out for Delivery (Shipped)</span>
                    </div>
                    <span className="font-bold text-blue-300">
                      {storeAnalytics?.countsByStatus?.shipped || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A0E08] border border-amber-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>⏳ In Queue (Pending / New)</span>
                    </div>
                    <span className="font-bold text-amber-300">
                      {(storeAnalytics?.countsByStatus?.pending || 0) + (storeAnalytics?.countsByStatus?.new || 0)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A0E08] border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>🎉 Delivered & Completed</span>
                    </div>
                    <span className="font-bold text-emerald-300">
                      {storeAnalytics?.countsByStatus?.delivered || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A0E08] border border-red-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <span>❌ Cancelled</span>
                    </div>
                    <span className="font-bold text-red-300">
                      {storeAnalytics?.countsByStatus?.cancelled || 0}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleSendMessage("What is the current progress of the store and our active pipeline?")}
                  className="w-full py-2 rounded-xl bg-[#1A0E08] hover:bg-[#24150E] border border-[#3D2619] hover:border-[#C68A57]/40 text-xs text-[#A89B93] hover:text-[#E8B688] flex items-center justify-center gap-1.5 transition-all"
                >
                  <Activity className="w-3.5 h-3.5 text-[#C68A57]" />
                  <span>Ask AI for Store Progress Summary</span>
                </button>
              </div>

              {/* Top Selling Products Leaderboard */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Top Selling Items</span>
                  </div>
                  <span className="text-[10px] text-[#A89B93]">By Volume & Revenue</span>
                </div>

                <div className="space-y-2">
                  {(storeAnalytics?.topProducts || []).slice(0, 4).map((item, idx) => (
                    <div key={idx} className="bg-[#1A0E08] p-2.5 rounded-xl border border-[#3D2619] space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[#F7F4EB] truncate">
                          {idx + 1}. {item.name}
                        </span>
                        <span className="text-[#E8B688] font-bold">₱{item.total.toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-[#A89B93] flex justify-between">
                        <span>{item.count} units sold</span>
                        <span className="text-emerald-400">Demand High</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRACK ALL RECORDS (AUDIT LOG & LOOKUP) */}
          {sidebarTab === 'records' && (
            <div className="space-y-3.5">
              {/* Search & Filter Header */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-3.5 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <FileText className="w-4 h-4 text-[#C68A57]" />
                    <span>Tracked Order Records ({storeAnalytics?.totalOrdersCount || 0})</span>
                  </div>
                  <button
                    onClick={fetchAnalytics}
                    className="p-1 rounded-lg text-[#A89B93] hover:text-[#E8B688]"
                    title="Refresh records"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A89B93]" />
                  <input
                    type="text"
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                    placeholder="Search by customer name or Order ID..."
                    className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F7F4EB] placeholder-[#6B5A50] outline-none focus:border-[#C68A57]"
                  />
                </div>

                {/* Status Filter Chips */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar text-[10px] pt-0.5">
                  {(['all', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setRecordFilter(filter)}
                      className={`px-2.5 py-1 rounded-lg font-medium capitalize shrink-0 transition-all ${
                        recordFilter === filter
                          ? 'bg-[#C68A57] text-white'
                          : 'bg-[#1A0E08] text-[#A89B93] hover:text-white border border-[#3D2619]'
                      }`}
                    >
                      {filter === 'processing' ? 'Brewing' : filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Records List */}
              <div className="space-y-2 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
                {(storeAnalytics?.allOrders || [])
                  .filter((order) => {
                    if (recordFilter !== 'all' && order.status !== recordFilter) return false;
                    if (!recordSearch) return true;
                    const q = recordSearch.toLowerCase();
                    return (
                      (order.customer_name || '').toLowerCase().includes(q) ||
                      (order.id || '').toLowerCase().includes(q) ||
                      (order.product_variant || '').toLowerCase().includes(q)
                    );
                  })
                  .map((order) => (
                    <div
                      key={order.id}
                      className="bg-[#2A1810] border border-[#3D2619] hover:border-[#C68A57]/60 rounded-xl p-3 shadow-sm transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-[#A89B93]">
                          #{order.id.slice(0, 8)}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            order.status === 'delivered'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : order.status === 'processing'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse'
                              : order.status === 'shipped'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : order.status === 'cancelled'
                              ? 'bg-red-500/20 text-red-300 border-red-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {order.status === 'processing' ? '☕ Brewing' : order.status}
                        </span>
                      </div>

                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-bold text-[#F7F4EB] truncate pr-2">
                          {order.customer_name}
                        </span>
                        <span className="text-xs font-bold text-[#E8B688] shrink-0">
                          ₱{order.total_price || 140}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#C2B2A7]">
                        {order.product_variant} {order.quantity > 1 ? `(x${order.quantity})` : ''}
                      </div>

                      <div className="text-[10px] text-[#A89B93] flex justify-between items-center pt-1 border-t border-white/5">
                        <span>{order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}</span>
                        <button
                          onClick={() => handleSendMessage(`What is the status and tracking history for order #${order.id.slice(0, 8)} of ${order.customer_name}?`)}
                          className="text-[#C68A57] hover:text-[#E8B688] font-medium hover:underline flex items-center gap-0.5"
                        >
                          <span>Ask AI to Track</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                {(!storeAnalytics?.allOrders || storeAnalytics.allOrders.length === 0) && (
                  <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-[#A89B93]">
                    No order records found in database.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Deal Closer & Order Customizer */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#2A1810] border border-[#C68A57]/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#C68A57]/20 text-[#E8B688] flex items-center justify-center">
                  <Coffee className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-[#F7F4EB]">
                    Customize & Close Deal
                  </h3>
                  <p className="text-xs text-[#A89B93]">Tara Timpla Handcrafted Coffee</p>
                </div>
              </div>
              <button
                onClick={() => setShowOrderModal(false)}
                className="p-1 rounded-lg text-[#A89B93] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Product Selector */}
            <div>
              <label className="text-xs font-semibold text-[#E8B688] block mb-1.5">
                Select Coffee or Pastry
              </label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2.5 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
              >
                {MENU_SPECIALTIES.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} (Base ₱{m.price})
                  </option>
                ))}
              </select>
            </div>

            {/* Customization Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#A89B93] block mb-1.5">Size</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSize('16oz')}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                      selectedSize === '16oz'
                        ? 'bg-[#C68A57] text-white border-[#E8B688]'
                        : 'bg-[#1A0E08] text-[#A89B93] border-[#3D2619]'
                    }`}
                  >
                    16oz Regular
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSize('22oz')}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                      selectedSize === '22oz'
                        ? 'bg-[#C68A57] text-white border-[#E8B688]'
                        : 'bg-[#1A0E08] text-[#A89B93] border-[#3D2619]'
                    }`}
                  >
                    22oz (+₱25)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#A89B93] block mb-1.5">Temperature</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTemp('Iced')}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                      selectedTemp === 'Iced'
                        ? 'bg-[#C68A57] text-white border-[#E8B688]'
                        : 'bg-[#1A0E08] text-[#A89B93] border-[#3D2619]'
                    }`}
                  >
                    🧊 Iced
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTemp('Hot')}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                      selectedTemp === 'Hot'
                        ? 'bg-[#C68A57] text-white border-[#E8B688]'
                        : 'bg-[#1A0E08] text-[#A89B93] border-[#3D2619]'
                    }`}
                  >
                    ☕ Hot
                  </button>
                </div>
              </div>
            </div>

            {/* Sweetness & Milk */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#A89B93] block mb-1.5">Sweetness</label>
                <select
                  value={selectedSweetness}
                  onChange={(e) => setSelectedSweetness(e.target.value)}
                  className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                >
                  <option value="0%">0% (Unsweetened)</option>
                  <option value="25%">25% (Less Sweet)</option>
                  <option value="50%">50% (Recommended Timpla)</option>
                  <option value="75%">75% (Sweet)</option>
                  <option value="100%">100% (Extra Sweet)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#A89B93] block mb-1.5">Milk Choice</label>
                <select
                  value={selectedMilk}
                  onChange={(e) => setSelectedMilk(e.target.value)}
                  className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                >
                  <option value="Fresh Milk">Fresh Whole Milk (Included)</option>
                  <option value="Oat Milk">Oat Milk (+₱30)</option>
                  <option value="Almond Milk">Almond Milk (+₱30)</option>
                </select>
              </div>
            </div>

            {/* Extra Shot & Quantity */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#1A0E08] border border-[#3D2619]">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F7F4EB]">
                <input
                  type="checkbox"
                  checked={extraShot}
                  onChange={(e) => setExtraShot(e.target.checked)}
                  className="w-4 h-4 rounded text-[#C68A57] focus:ring-[#C68A57]"
                />
                <span>Add Extra Espresso Shot (+₱30)</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#A89B93]">Qty:</span>
                <button
                  type="button"
                  onClick={() => setOrderQuantity(Math.max(1, orderQuantity - 1))}
                  className="w-6 h-6 rounded bg-[#2A1810] text-[#F7F4EB] font-bold text-xs"
                >
                  -
                </button>
                <span className="text-xs font-bold text-[#E8B688] w-4 text-center">{orderQuantity}</span>
                <button
                  type="button"
                  onClick={() => setOrderQuantity(orderQuantity + 1)}
                  className="w-6 h-6 rounded bg-[#2A1810] text-[#F7F4EB] font-bold text-xs"
                >
                  +
                </button>
              </div>
            </div>

            {/* Delivery Info */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <span className="text-xs font-semibold text-[#E8B688] block">Delivery & Payment</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Your Full Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none"
                />
                <input
                  type="text"
                  placeholder="Mobile Phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="Complete Address (Street, Barangay, City, Landmark)"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('COD')}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                    paymentMethod === 'COD'
                      ? 'bg-[#C68A57] text-white border-[#E8B688]'
                      : 'bg-[#1A0E08] text-[#A89B93] border-[#3D2619]'
                  }`}
                >
                  💵 Cash on Delivery (COD)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('GCash')}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                    paymentMethod === 'GCash'
                      ? 'bg-[#C68A57] text-white border-[#E8B688]'
                      : 'bg-[#1A0E08] text-[#A89B93] border-[#3D2619]'
                  }`}
                >
                  📱 GCash Payment
                </button>
              </div>
            </div>

            {/* Total & Confirm Button */}
            <div className="border-t border-white/10 pt-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#A89B93] block">Total Order Amount</span>
                <span className="text-xl font-bold text-[#E8B688]">₱{calculateDrinkPrice()}</span>
              </div>

              <button
                type="button"
                onClick={handleConfirmDirectOrder}
                disabled={isPlacingOrder}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#C68A57] to-[#B3743E] hover:from-[#B3743E] hover:to-[#9F6230] text-white font-bold text-sm shadow-xl shadow-[#C68A57]/30 transition-all transform active:scale-95 flex items-center gap-2"
              >
                {isPlacingOrder ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Booking Order...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>Confirm & Send to Working Station</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
