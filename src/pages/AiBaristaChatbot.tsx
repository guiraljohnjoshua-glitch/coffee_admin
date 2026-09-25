import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { 
  Coffee, 
  Send, 
  Sparkles, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  FileText, 
  Search, 
  DollarSign, 
  Activity, 
  Users, 
  UserCheck, 
  LogOut, 
  LogIn, 
  AlertCircle, 
  Store, 
  RefreshCw, 
  ChevronRight, 
  ShieldCheck, 
  Calendar 
} from 'lucide-react';
import {
  StoreAnalytics,
  AttendanceRecord,
  fetchStoreAnalytics,
  recordEmployeeSignIn,
  recordEmployeeSignOut,
  generateAnalystResponse,
} from '../lib/storeIntelligence';

// Markdown-like text renderer for clean financial and shift intelligence responses
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
          line.startsWith('💰') ||
          line.startsWith('👥') ||
          line.startsWith('⏱️');

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
}

export default function AiBaristaChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'bot',
      text: `📈 **Kumusta! Welcome to the Tara Timpla AI Growth & Shift Attendance Analyst** 📊✨

I am your store's dedicated intelligence analyst designed to report on sales growth, daily revenue, and employee work shifts.

*(⚠️ Please note: I am not intended to take coffee orders. All customer orders are crafted directly at the Working Station!)*

Ask me anytime:
• 📈 **"What is our sales growth and revenue today?"** (Day-over-day growth %, today's earnings, gross sales, AOV)
• 👥 **"Who is present and working right now?"** (Employees on active shift & their exact clock-in times)
• ⏱️ **"What time did employees sign in and sign out?"** (Full shift clock-in and clock-out logs)
• 🏆 **"Which drinks are driving the most revenue growth?"** (Top grossing menu items)
• 🏪 **"What is our current Working Station progress?"** (Brewing & delivery pipeline status)

How may I assist your store review today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'growth' | 'attendance' | 'records'>('growth');
  const [recordFilter, setRecordFilter] = useState<'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [recordSearch, setRecordSearch] = useState('');

  // Attendance quick punch states
  const [punchName, setPunchName] = useState('');
  const [punchEmail, setPunchEmail] = useState('');
  const [punchRole, setPunchRole] = useState('Crew Member');
  const [punchLoading, setPunchLoading] = useState(false);
  const [punchFeedback, setPunchFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Periodic fetcher for store analytics and attendance
  const fetchAnalytics = async () => {
    try {
      const data = await fetchStoreAnalytics();
      if (data) {
        setStoreAnalytics(data);
      }
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 6000);
    return () => clearInterval(interval);
  }, []);

  // Quick punch attendance action (Sign In / Sign Out)
  const handleQuickPunch = async (action: 'sign-in' | 'sign-out') => {
    if (!punchEmail.trim()) {
      setPunchFeedback('Please provide an email/username to record shift.');
      return;
    }

    setPunchLoading(true);
    setPunchFeedback(null);

    try {
      if (action === 'sign-in') {
        const result = await recordEmployeeSignIn(
          punchEmail.trim().toLowerCase(),
          punchName.trim() || punchEmail.split('@')[0],
          punchRole
        );
        if (result.success) {
          setPunchFeedback(result.message);
          fetchAnalytics();
        } else {
          setPunchFeedback(result.message || 'Failed to record sign-in');
        }
      } else {
        const result = await recordEmployeeSignOut(punchEmail.trim().toLowerCase());
        if (result.success) {
          setPunchFeedback(result.message);
          fetchAnalytics();
        } else {
          setPunchFeedback(result.message || 'Failed to record sign-out');
        }
      }
    } catch (e: any) {
      setPunchFeedback(e.message || 'Network error');
    } finally {
      setPunchLoading(false);
    }
  };

  // Send message to Gemini AI Growth & Attendance Analyst
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

    // Refresh analytics to ensure most current calculations
    let currentAnalytics = storeAnalytics;
    try {
      currentAnalytics = await fetchStoreAnalytics();
      setStoreAnalytics(currentAnalytics);
    } catch {
      // ignore
    }

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setIsTyping(false);

      if (data.storeAnalytics) {
        setStoreAnalytics(data.storeAnalytics);
      }

      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let replyText = data.reply;

      // Validate that reply adheres to no-order rule
      if (
        !replyText ||
        replyText.toLowerCase().includes('what can i brew') ||
        replyText.toLowerCase().includes('ready to take your order')
      ) {
        replyText = generateAnalystResponse(text, currentAnalytics);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: replyText,
          timestamp: botTime,
        },
      ]);
    } catch (err: any) {
      setIsTyping(false);
      const fallbackText = generateAnalystResponse(text, currentAnalytics);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  // Quick Action Prompts
  const quickActions = [
    { label: '📈 Growth, Sales & Revenue', prompt: 'What is the growth sales and revenue today?' },
    { label: '👥 Who is Present & Working?', prompt: 'Who is present and working right now, and what time did they sign in?' },
    { label: '⏱️ Sign-In & Sign-Out Times', prompt: 'What time did employees sign in and sign out today?' },
    { label: '🏆 Top Revenue Drivers', prompt: 'Which drinks are driving the most revenue growth?' },
    { label: '🏪 Station Pipeline Status', prompt: 'What is the current progress of the store and active brewing station?' },
    { label: '📋 Audit All Records', prompt: 'Please track all the order records and audit logs.' },
  ];

  return (
    <div className="min-h-screen bg-[#1F120C] text-[#F7F4EB] flex flex-col">
      {/* Top Header */}
      <div className="border-b border-[#3D2619] bg-[#2A1810]/90 backdrop-blur-md px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] flex items-center justify-center text-white shadow-md shadow-[#C68A57]/20 border border-[#E8B688]/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-bold text-lg text-[#F7F4EB] tracking-wide">
                Tara Timpla AI Growth & Attendance Analyst
              </h1>
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Store Intelligence
              </span>
            </div>
            <p className="text-xs text-[#A89B93]">
              Sales Growth • Daily Revenue • Employee Sign-In & Sign-Out Shifts • Working Station Sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#E8B688] transition-all text-xs flex items-center gap-1.5"
            title="Refresh Live Metrics"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sync Data</span>
          </button>
        </div>
      </div>

      {/* Live Store Growth & Attendance Pulse Ribbon */}
      <div className="bg-[#1A0E08] border-b border-[#3D2619] px-4 py-2 flex items-center gap-3 overflow-x-auto no-scrollbar shadow-inner text-xs">
        <div className="flex items-center gap-1.5 text-[#E8B688] font-bold text-[11px] uppercase tracking-wider shrink-0 pr-3 border-r border-[#3D2619]">
          <TrendingUp className="w-3.5 h-3.5 text-[#C68A57]" />
          <span>Live Pulse</span>
        </div>

        {/* Growth % Tag */}
        <button
          onClick={() => handleSendMessage('What is our sales growth and revenue today?')}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-emerald-500/50 transition-all text-left group"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Sales Growth (DoD)</span>
            <span className="font-bold text-emerald-400 text-xs leading-tight">
              {(storeAnalytics?.salesGrowthPercent || 0) >= 0 ? '+' : ''}
              {storeAnalytics?.salesGrowthPercent || 0}%
            </span>
          </div>
        </button>

        {/* Today's Revenue */}
        <button
          onClick={() => handleSendMessage("What is today's revenue breakdown?")}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-[#C68A57]/50 transition-all text-left group"
        >
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Today's Revenue</span>
            <span className="font-bold text-[#E8B688] text-xs leading-tight group-hover:text-white">
              ₱{(storeAnalytics?.todayRevenue || 0).toLocaleString()}
            </span>
          </div>
        </button>

        {/* Total Gross Sales */}
        <button
          onClick={() => handleSendMessage('What is our total gross revenue to date?')}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-[#C68A57]/50 transition-all text-left group"
        >
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Total Gross Sales</span>
            <span className="font-bold text-[#F7F4EB] text-xs leading-tight">
              ₱{(storeAnalytics?.totalGrossRevenue || 0).toLocaleString()}
            </span>
          </div>
        </button>

        {/* Present & Working Right Now */}
        <button
          onClick={() => handleSendMessage('Who is present and working right now?')}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-emerald-500/30 hover:border-emerald-400 transition-all text-left group"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <div>
            <span className="text-[10px] text-emerald-400 font-medium block leading-none">Present & Working</span>
            <span className="font-bold text-emerald-300 text-xs leading-tight">
              {storeAnalytics?.attendance?.currentlyWorkingCount || 0} Staff Active
            </span>
          </div>
        </button>

        {/* Completed Shifts Today */}
        <button
          onClick={() => handleSendMessage('What time did employees sign out today?')}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#24150E] hover:bg-[#2F1D13] border border-[#3D2619] hover:border-amber-400/50 transition-all text-left group"
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <div>
            <span className="text-[10px] text-[#A89B93] block leading-none">Completed Shifts</span>
            <span className="font-bold text-amber-300 text-xs leading-tight">
              {storeAnalytics?.attendance?.signedOutCount || 0} Signed Out
            </span>
          </div>
        </button>
      </div>

      {/* Main Grid: Chat Stream (Left) + Analytics & Attendance Panels (Right) */}
      <div className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left / Center: Chat Stream (7 cols) */}
        <div className="lg:col-span-7 flex flex-col h-[calc(100vh-115px)] border-r border-[#3D2619] bg-[#1a0f0a]">
          {/* Informational Guidance Notice: Not Intended for Orders */}
          <div className="bg-[#24150E]/80 border-b border-[#3D2619] px-4 py-2 flex items-center justify-between text-xs text-[#C2B2A7]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C68A57] shrink-0" />
              <span>
                <strong>Analyst Notice:</strong> This AI reports on <strong>Sales Growth, Revenue & Shift Attendance</strong>. It is not intended to take coffee orders.
              </span>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] text-white flex items-center justify-center text-xs shrink-0 shadow-md">
                    📊
                  </div>
                )}

                <div
                  className={`max-w-[88%] p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md ${
                    m.sender === 'customer'
                      ? 'bg-[#C68A57] text-[#2A1A12] font-medium rounded-br-none'
                      : 'bg-[#2A1810] text-[#F7F4EB] border border-[#3D2619] rounded-bl-none'
                  }`}
                >
                  {m.sender === 'bot' ? (
                    <FormattedBotText text={m.text} />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  )}

                  <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-[#A89B93]">
                    <Clock className="w-3 h-3" />
                    <span>{m.timestamp}</span>
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C68A57] to-[#8C4E28] text-white flex items-center justify-center text-xs shrink-0">
                  📊
                </div>
                <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl px-4 py-3 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-[#C68A57] animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#C68A57] animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-[#A89B93] ml-2">Calculating sales growth & employee shift records...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div className="p-3 border-t border-[#3D2619] bg-[#22130C] flex gap-2 overflow-x-auto no-scrollbar">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(action.prompt)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-[#2F1D13] hover:bg-[#3D2619] border border-[#C68A57]/30 hover:border-[#C68A57] text-xs text-[#E8B688] hover:text-white transition-all transform active:scale-95"
              >
                {action.label}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 border-t border-[#3D2619] bg-[#2A1810]">
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
                placeholder="Ask: What is our sales growth and revenue? Or who is present and working?"
                className="flex-1 bg-[#1A0E08] border border-[#3D2619] focus:border-[#C68A57] rounded-xl px-4 py-3 text-xs sm:text-sm text-[#F7F4EB] outline-none placeholder-[#6B5A50]"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                className="p-3 rounded-xl bg-gradient-to-r from-[#C68A57] to-[#B3743E] hover:from-[#B3743E] hover:to-[#9F6230] text-white disabled:opacity-40 shadow-md shadow-[#C68A57]/20 transition-all transform active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right: Intelligence Panels (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[calc(100vh-115px)] bg-[#1A0E08] overflow-y-auto p-4 space-y-4 border-l border-[#3D2619]">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-[#2A1810] p-1 rounded-2xl border border-[#3D2619] text-xs">
            <button
              onClick={() => setSidebarTab('growth')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'growth'
                  ? 'bg-gradient-to-r from-[#C68A57] to-[#B3743E] text-white shadow-md shadow-[#C68A57]/20 font-bold'
                  : 'text-[#A89B93] hover:text-[#F7F4EB] hover:bg-white/5'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Growth & Sales</span>
            </button>

            <button
              onClick={() => setSidebarTab('attendance')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'attendance'
                  ? 'bg-gradient-to-r from-[#C68A57] to-[#B3743E] text-white shadow-md shadow-[#C68A57]/20 font-bold'
                  : 'text-[#A89B93] hover:text-[#F7F4EB] hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Shift Attendance</span>
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
              <span>Orders Audit</span>
            </button>
          </div>

          {/* TAB 1: GROWTH & SALES REVENUE */}
          {sidebarTab === 'growth' && (
            <div className="space-y-4">
              {/* Day-over-Day Growth Spotlight Card */}
              <div className="bg-gradient-to-br from-[#2A1810] to-[#381F13] border border-[#C68A57]/40 rounded-2xl p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#E8B688]">
                      Sales Growth Rate (DoD)
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Live Performance
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <div className="text-3xl font-serif font-bold text-emerald-400">
                      {(storeAnalytics?.salesGrowthPercent || 0) >= 0 ? '+' : ''}
                      {storeAnalytics?.salesGrowthPercent || 0}%
                    </div>
                    <span className="text-[11px] text-[#A89B93]">
                      {(storeAnalytics?.salesGrowthRevenueChange || 0) >= 0 ? '+' : ''}
                      ₱{(storeAnalytics?.salesGrowthRevenueChange || 0).toLocaleString()} net change vs yesterday
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#A89B93] block">Today's Total</span>
                    <span className="text-lg font-bold text-[#F7F4EB]">
                      ₱{(storeAnalytics?.todayRevenue || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-xs">
                  <div className="bg-[#1A0E08] p-2.5 rounded-xl border border-[#3D2619]">
                    <span className="text-[10px] text-[#A89B93] block">Yesterday's Revenue</span>
                    <span className="font-bold text-[#C2B2A7]">
                      ₱{(storeAnalytics?.yesterdayRevenue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-[#1A0E08] p-2.5 rounded-xl border border-[#3D2619]">
                    <span className="text-[10px] text-[#A89B93] block">Avg Order Value (AOV)</span>
                    <span className="font-bold text-[#E8B688]">
                      ₱{storeAnalytics?.avgOrderValue || 0}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleSendMessage('What is our sales growth and revenue breakdown today?')}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-[#C68A57]/30 to-[#8C4E28]/30 hover:from-[#C68A57]/50 hover:to-[#8C4E28]/50 border border-[#C68A57]/40 text-xs font-semibold text-[#E8B688] flex items-center justify-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ask AI for Executive Growth Briefing</span>
                </button>
              </div>

              {/* Total Financial Health */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <DollarSign className="w-4 h-4 text-[#C68A57]" />
                    <span>Store Revenue Metrics</span>
                  </div>
                  <span className="text-[10px] text-[#A89B93]">
                    {storeAnalytics?.totalOrdersCount || 0} Total Orders
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#1A0E08] p-2.5 rounded-xl border border-[#3D2619]">
                    <span className="text-[10px] text-[#A89B93] block">Total Gross Revenue</span>
                    <span className="text-base font-bold text-[#F7F4EB]">
                      ₱{(storeAnalytics?.totalGrossRevenue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-[#1A0E08] p-2.5 rounded-xl border border-[#3D2619]">
                    <span className="text-[10px] text-[#A89B93] block">Delivered (Realized)</span>
                    <span className="text-base font-bold text-emerald-300">
                      ₱{(storeAnalytics?.deliveredRevenue || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Payment Breakdown */}
                <div className="pt-2 border-t border-white/5 space-y-2">
                  <span className="text-[11px] font-bold text-[#E8B688] block">Payment Collections</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-[#1A0E08] border border-[#3D2619]">
                      <span className="text-[10px] text-[#A89B93] block">💵 Cash on Delivery (COD)</span>
                      <span className="font-bold text-[#F7F4EB]">
                        ₱{(storeAnalytics?.paymentBreakdown?.cod?.total || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#A89B93] block">
                        {storeAnalytics?.paymentBreakdown?.cod?.count || 0} orders
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-[#1A0E08] border border-[#3D2619]">
                      <span className="text-[10px] text-[#A89B93] block">📱 GCash Payments</span>
                      <span className="font-bold text-[#F7F4EB]">
                        ₱{(storeAnalytics?.paymentBreakdown?.gcash?.total || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#A89B93] block">
                        {storeAnalytics?.paymentBreakdown?.gcash?.count || 0} orders
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Revenue Driving Products */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#E8B688] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Top Revenue Drivers
                  </span>
                  <span className="text-[10px] text-[#A89B93]">Ranked</span>
                </div>

                <div className="space-y-2">
                  {(storeAnalytics?.topProducts || []).slice(0, 4).map((p, idx) => (
                    <div key={idx} className="bg-[#1A0E08] p-2.5 rounded-xl border border-[#3D2619] flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-[#F7F4EB]">
                          {idx + 1}. {p.name}
                        </span>
                        <span className="text-[10px] text-[#A89B93] block">
                          {p.count} sold
                        </span>
                      </div>
                      <span className="font-bold text-[#E8B688]">
                        ₱{p.total.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEE SHIFT ATTENDANCE TRACKER */}
          {sidebarTab === 'attendance' && (
            <div className="space-y-4">
              {/* Active Present & Working Summary */}
              <div className="bg-[#2A1810] border border-emerald-500/30 rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Present & Working Right Now</span>
                  </div>
                  <span className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    {storeAnalytics?.attendance?.currentlyWorkingCount || 0} Staff Active
                  </span>
                </div>

                <div className="space-y-2">
                  {(storeAnalytics?.attendance?.currentlyWorking || []).length === 0 ? (
                    <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-[#A89B93]">
                      No staff signed in right now. Employees will appear here as soon as they log in or punch in!
                    </div>
                  ) : (
                    (storeAnalytics?.attendance?.currentlyWorking || []).map((emp) => (
                      <div
                        key={emp.id}
                        className="bg-[#1A0E08] border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between text-xs shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold text-xs">
                            {emp.employeeName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[#F7F4EB]">{emp.employeeName}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#C68A57]/20 text-[#E8B688]">
                                {emp.role}
                              </span>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-mono block">
                              🟢 Present & Working
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-[#A89B93] block">Signed In At</span>
                          <span className="text-xs font-bold text-[#E8B688] font-mono">
                            {emp.signInTime ? new Date(emp.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <button
                  onClick={() => handleSendMessage('Who is present and working right now and what time did they sign in?')}
                  className="w-full py-2 rounded-xl bg-[#1A0E08] hover:bg-[#24150E] border border-[#3D2619] hover:border-emerald-500/40 text-xs text-emerald-400 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Ask AI for Live Shift Attendance Report</span>
                </button>
              </div>

              {/* Completed Shifts Today (Signed Out Records) */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Completed Shifts Today (Signed Out)</span>
                  </div>
                  <span className="text-[10px] text-[#A89B93]">
                    {storeAnalytics?.attendance?.signedOutCount || 0} Recorded
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(storeAnalytics?.attendance?.signedOutToday || []).length === 0 ? (
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-[#A89B93]">
                      No signed-out shifts recorded yet today.
                    </div>
                  ) : (
                    (storeAnalytics?.attendance?.signedOutToday || []).map((emp) => (
                      <div
                        key={emp.id}
                        className="bg-[#1A0E08] border border-[#3D2619] rounded-xl p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#F7F4EB]">{emp.employeeName}</span>
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            Signed Out
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#A89B93] pt-0.5">
                          <span>
                            In: <strong className="text-[#E8B688]">{emp.signInTime ? new Date(emp.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</strong>
                          </span>
                          <span>
                            Out: <strong className="text-amber-300">{emp.signOutTime ? new Date(emp.signOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</strong>
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Direct Shift Timeclock Punch Box */}
              <div className="bg-[#2A1810] border border-[#C68A57]/30 rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#E8B688] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#C68A57]" />
                    Employee Shift Punch Console
                  </span>
                  <span className="text-[10px] text-[#A89B93]">Attendance Timeclock</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] text-[#A89B93] block mb-1">Employee Email or Username</label>
                    <input
                      type="text"
                      placeholder="e.g. barista_maria@gmail.com"
                      value={punchEmail}
                      onChange={(e) => setPunchEmail(e.target.value)}
                      className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#A89B93] block mb-1">Display Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Maria Santos"
                        value={punchName}
                        onChange={(e) => setPunchName(e.target.value)}
                        className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#A89B93] block mb-1">Role</label>
                      <select
                        value={punchRole}
                        onChange={(e) => setPunchRole(e.target.value)}
                        className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl px-3 py-2 text-xs text-[#F7F4EB] outline-none focus:border-[#C68A57]"
                      >
                        <option value="Crew Member">Crew Member</option>
                        <option value="Delivery Member">Delivery Member</option>
                        <option value="Store Owner">Store Owner</option>
                      </select>
                    </div>
                  </div>

                  {punchFeedback && (
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-[#E8B688]">
                      {punchFeedback}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={punchLoading}
                      onClick={() => handleQuickPunch('sign-in')}
                      className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all transform active:scale-95 disabled:opacity-50"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Clock In / Sign In</span>
                    </button>

                    <button
                      type="button"
                      disabled={punchLoading}
                      onClick={() => handleQuickPunch('sign-out')}
                      className="py-2.5 rounded-xl bg-amber-700 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-900/30 transition-all transform active:scale-95 disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Clock Out / Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PIPELINE & ORDERS AUDIT */}
          {sidebarTab === 'records' && (
            <div className="space-y-4">
              {/* Search and Filters */}
              <div className="bg-[#2A1810] border border-[#3D2619] rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B688]">
                    <FileText className="w-4 h-4 text-[#C68A57]" />
                    <span>Customer Orders Audit Log</span>
                  </div>
                  <span className="text-[10px] text-[#A89B93]">
                    {storeAnalytics?.totalOrdersCount || 0} orders
                  </span>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#A89B93]" />
                  <input
                    type="text"
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                    placeholder="Search customer, order id, or drink..."
                    className="w-full bg-[#1A0E08] border border-[#3D2619] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F7F4EB] placeholder-[#6B5A50] outline-none focus:border-[#C68A57]"
                  />
                </div>

                {/* Status Filters */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar text-[10px]">
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

              {/* Order List */}
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
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
                          onClick={() => handleSendMessage(`What is the tracking record for order #${order.id.slice(0, 8)} of ${order.customer_name}?`)}
                          className="text-[#C68A57] hover:text-[#E8B688] font-medium hover:underline flex items-center gap-0.5"
                        >
                          <span>Ask AI Audit</span>
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
    </div>
  );
}
