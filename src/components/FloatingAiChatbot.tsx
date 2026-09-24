import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { 
  Coffee, 
  Send, 
  Sparkles, 
  X, 
  MessageSquare, 
  ChevronDown, 
  CheckCircle, 
  Truck, 
  Clock, 
  Bell, 
  User, 
  ShoppingBag,
  Volume2,
  VolumeX,
  AlertCircle
} from 'lucide-react';

interface FloatingMessage {
  id: string;
  sender: 'bot' | 'customer';
  text: string;
  timestamp: string;
  milestone?: OrderStatus;
}

export default function FloatingAiChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [messages, setMessages] = useState<FloatingMessage[]>([
    {
      id: 'f-init',
      sender: 'bot',
      text: '📈 Kumusta! I am the Tara Timpla AI Growth & Staff Attendance Analyst.\n\nI answer:\n• 💰 What is our sales growth and revenue today?\n• 👥 Who is present and working right now?\n• ⏱️ What time did employees sign in and sign out?\n\n*(Note: I am not intended for taking coffee orders — orders are crafted at the Working Station!)*',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [customerName, setCustomerName] = useState('Joshua');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Listen to realtime order changes for tracked order
  useEffect(() => {
    if (!trackedOrder?.id) return;

    const channel = supabase
      .channel(`floating-tracker-${trackedOrder.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${trackedOrder.id}`,
        },
        (payload) => {
          if (payload.new) {
            handleStatusUpdate(payload.new as Order);
          }
        }
      )
      .subscribe();

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('id', trackedOrder.id)
          .single();

        if (data && data.status !== trackedOrder.status) {
          handleStatusUpdate(data as Order);
        }
      } catch (e) {
        // silent
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [trackedOrder?.id, trackedOrder?.status]);

  const handleStatusUpdate = (updated: Order) => {
    if (updated.status === trackedOrder?.status) return;

    setTrackedOrder(updated);
    if (!isOpen) setHasUnread(true);

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = updated.customer_name || customerName || 'Valued Customer';
    const shortId = updated.id.slice(0, 8);
    const item = updated.product_variant;

    let text = '';
    if (updated.status === 'pending') {
      text = `📋 Order #${shortId} is now PENDING in our barista queue!`;
    } else if (updated.status === 'processing') {
      text = `☕ Great news! Our crew just began freshly brewing your ${item} at the Working Station! (Status: Processing - Locked in).`;
    } else if (updated.status === 'shipped') {
      text = `🛵 Out for Delivery! Handed over to rider for delivery to ${updated.address || 'your address'}.`;
    } else if (updated.status === 'delivered') {
      text = `🎉 YOUR ORDER HAS BEEN DELIVERED! ☕✨\n\nThank you so much, ${name}, for choosing Tara Timpla Coffee! We hope every sip brings warmth and joy today. Salamat po! ❤️`;
    } else if (updated.status === 'cancelled') {
      text = `❌ Order #${shortId} has been cancelled. If you need assistance or a refund, please message us anytime!`;
    }

    if (text) {
      setMessages((prev) => [
        ...prev,
        {
          id: `status-${Date.now()}`,
          sender: 'bot',
          text,
          timestamp: time,
          milestone: updated.status,
        },
      ]);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const userMsg: FloatingMessage = {
      id: `u-${Date.now()}`,
      sender: 'customer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          customerName,
          orderId: trackedOrder?.id,
        }),
      });

      const data = await res.json();
      setIsTyping(false);

      if (data.actionTaken === 'ORDER_CREATED' && data.createdOrder) {
        setTrackedOrder(data.createdOrder as Order);
      }
      if (data.actionTaken === 'ORDER_CANCELLED' && trackedOrder) {
        setTrackedOrder({ ...trackedOrder, status: 'cancelled' });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: data.reply || 'Tara Timpla Coffee is happy to help! What else can I brew for you?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `b-err-${Date.now()}`,
          sender: 'bot',
          text: '☕ Kumusta po! I am ready to take your order or check your delivery status.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="mb-3 w-[360px] sm:w-[390px] h-[520px] bg-[#22130C] border border-[#C68A57]/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Top Bar */}
          <div className="bg-gradient-to-r from-[#2A1810] to-[#3D2316] border-b border-[#3D2619] p-3.5 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#F7F4EB] font-serif flex items-center gap-1.5">
                  <span>AI Growth & Attendance</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </h4>
                <p className="text-[10px] text-[#A89B93]">Sales Growth & Shift Intelligence</p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[#A89B93] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Active order quick ticker */}
          {trackedOrder && (
            <div className="bg-[#1A0E08] px-3 py-1.5 border-b border-white/5 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-[#E8B688] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>Order #{trackedOrder.id.slice(0, 8)}</span>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#C68A57]/20 text-[#E8B688] border border-[#C68A57]/30">
                {trackedOrder.status}
              </span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#1A0F0A]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2 ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-lg bg-[#C68A57] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    ☕
                  </div>
                )}
                <div
                  className={`max-w-[82%] p-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-line shadow-sm ${
                    m.sender === 'customer'
                      ? 'bg-[#C68A57] text-white rounded-br-none'
                      : m.milestone === 'delivered'
                      ? 'bg-emerald-950/90 text-emerald-100 border border-emerald-500/40 rounded-bl-none font-medium'
                      : m.milestone === 'cancelled'
                      ? 'bg-red-950/90 text-red-100 border border-red-500/40 rounded-bl-none'
                      : m.milestone === 'processing'
                      ? 'bg-purple-950/90 text-purple-100 border border-purple-500/40 rounded-bl-none'
                      : 'bg-[#2A1810] text-[#F7F4EB] border border-[#3D2619] rounded-bl-none'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 justify-start items-center">
                <div className="w-6 h-6 rounded-lg bg-[#C68A57] text-white flex items-center justify-center text-[10px] shrink-0">
                  ☕
                </div>
                <div className="bg-[#2A1810] border border-[#3D2619] rounded-xl px-3 py-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C68A57] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick chips */}
          <div className="p-2 border-t border-[#3D2619] bg-[#22130C] flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => {
                setInputText('What is the growth sales and revenue today?');
              }}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30"
            >
              📈 Growth & Revenue
            </button>
            <button
              onClick={() => {
                setInputText('Who is present and working right now?');
              }}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30"
            >
              👥 Who is Working?
            </button>
            <button
              onClick={() => {
                setInputText('What time did employees sign in and sign out?');
              }}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30"
            >
              ⏱️ Shift Times
            </button>
            <button
              onClick={() => {
                setInputText('What are our top revenue drivers?');
              }}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30"
            >
              🏆 Top Drivers
            </button>
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="p-2.5 border-t border-[#3D2619] bg-[#2A1810] flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask about sales growth, revenue, or employee shifts..."
              className="flex-1 bg-[#1A0E08] border border-[#3D2619] focus:border-[#C68A57] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none placeholder-[#6B5A50]"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="p-2 rounded-xl bg-[#C68A57] text-white disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setHasUnread(false);
        }}
        className="relative group p-4 rounded-full bg-gradient-to-r from-[#C68A57] to-[#8C4E28] text-white shadow-2xl hover:scale-105 active:scale-95 transition-all border-2 border-[#E8B688]/40 flex items-center justify-center"
      >
        <Coffee className="w-6 h-6 group-hover:rotate-12 transition-transform" />
        
        {/* Unread indicator */}
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#1F120C] flex items-center justify-center text-[9px] font-bold text-white animate-bounce">
            !
          </span>
        )}

        <span className="sr-only">Open Tara Timpla AI Barista Chat</span>
      </button>
    </div>
  );
}
