import React, { useState, useEffect, useRef } from 'react';
import { 
  Coffee, 
  Send, 
  Sparkles, 
  X, 
  TrendingUp,
  Users,
  Clock,
  Award
} from 'lucide-react';
import { 
  fetchStoreAnalytics, 
  generateAnalystResponse, 
  StoreAnalytics 
} from '../lib/storeIntelligence';

interface FloatingMessage {
  id: string;
  sender: 'bot' | 'customer';
  text: string;
  timestamp: string;
}

export default function FloatingAiChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);

  const [messages, setMessages] = useState<FloatingMessage[]>([
    {
      id: 'f-init',
      sender: 'bot',
      text: `📈 **Kumusta! Tara Timpla AI Growth & Shift Attendance Analyst** 📊✨

I answer your questions on:
• 💰 **Sales growth & daily revenue** (DoD growth %, today's earnings, gross revenue, AOV)
• 👥 **Employee attendance** (Who is present & working, sign-in & sign-out times)

*(⚠️ Notice: I am not intended to take coffee orders. Customer orders are crafted directly at the Working Station!)*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load live analytics periodically
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const data = await fetchStoreAnalytics();
        if (mounted && data) {
          setAnalytics(data);
        }
      } catch {
        // silent
      }
    };

    loadData();
    const interval = setInterval(loadData, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const text = (customText || inputText).trim();
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

    // Refresh analytics in background for fresh calculations
    let currentAnalytics = analytics;
    try {
      currentAnalytics = await fetchStoreAnalytics();
      setAnalytics(currentAnalytics);
    } catch {
      // ignore
    }

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setIsTyping(false);

      let botReply = data.reply;
      // Double check reply: if reply contains ordering phrase or empty, use verified analyst engine
      if (
        !botReply ||
        botReply.toLowerCase().includes('what can i brew') ||
        botReply.toLowerCase().includes('ready to take your order')
      ) {
        botReply = generateAnalystResponse(text, currentAnalytics);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: botReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      // Seamlessly fallback on Vercel or offline to client-side Store Intelligence engine
      setIsTyping(false);
      const fallbackReply = generateAnalystResponse(text, currentAnalytics);

      setMessages((prev) => [
        ...prev,
        {
          id: `b-fb-${Date.now()}`,
          sender: 'bot',
          text: fallbackReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="mb-3 w-[360px] sm:w-[400px] h-[540px] bg-[#22130C] border border-[#C68A57]/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Top Bar */}
          <div className="bg-gradient-to-r from-[#2A1810] to-[#3D2316] border-b border-[#3D2619] p-3 px-4 flex items-center justify-between">
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

          {/* Quick Metrics Bar */}
          <div className="bg-[#1A0E08] px-3 py-1.5 border-b border-white/5 flex items-center justify-between text-[11px] text-[#A89B93]">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>Today: <strong className="text-emerald-400">₱{(analytics?.todayRevenue || 0).toLocaleString()}</strong></span>
              <span className="text-[10px] text-[#C68A57]">({analytics?.salesGrowthRate !== undefined && analytics.salesGrowthRate >= 0 ? '+' : ''}{analytics?.salesGrowthRate || 0}%)</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-[#E8B688]" />
              <span><strong className="text-[#F7F4EB]">{analytics?.attendance?.currentlyWorkingCount || 0}</strong> On Shift</span>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#1A0F0A]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2 ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-lg bg-[#C68A57] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    📊
                  </div>
                )}
                <div
                  className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-line shadow-sm ${
                    m.sender === 'customer'
                      ? 'bg-[#C68A57] text-white rounded-br-none'
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
                  📊
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

          {/* Quick Action Chips */}
          <div className="p-2 border-t border-[#3D2619] bg-[#22130C] flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleSend(undefined, 'What is the growth sales and revenue today?')}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30 flex items-center gap-1"
            >
              <TrendingUp className="w-2.5 h-2.5" />
              <span>Growth & Revenue</span>
            </button>
            <button
              onClick={() => handleSend(undefined, 'Who is present and working right now?')}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30 flex items-center gap-1"
            >
              <Users className="w-2.5 h-2.5" />
              <span>Who is Working?</span>
            </button>
            <button
              onClick={() => handleSend(undefined, 'What time did employees sign in and sign out today?')}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30 flex items-center gap-1"
            >
              <Clock className="w-2.5 h-2.5" />
              <span>Shift Times</span>
            </button>
            <button
              onClick={() => handleSend(undefined, 'Which drinks are driving the most revenue growth?')}
              className="shrink-0 px-2 py-1 rounded-lg bg-[#2F1D13] hover:bg-[#3D2619] text-[10px] text-[#E8B688] border border-[#C68A57]/30 flex items-center gap-1"
            >
              <Award className="w-2.5 h-2.5" />
              <span>Top Drivers</span>
            </button>
          </div>

          {/* Message Input */}
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
              className="p-2 rounded-xl bg-[#C68A57] text-white disabled:opacity-40 hover:bg-[#B57A47] transition-colors"
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
        <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
        
        {/* Unread indicator */}
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#1F120C] flex items-center justify-center text-[9px] font-bold text-white animate-bounce">
            !
          </span>
        )}

        <span className="sr-only">Open Tara Timpla AI Growth & Attendance Chat</span>
      </button>
    </div>
  );
}
