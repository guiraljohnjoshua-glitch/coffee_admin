import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, FBNotificationLog } from '../types';
import { 
  Bot, 
  Send, 
  Sparkles, 
  MessageSquare, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Coffee, 
  Truck, 
  Copy, 
  ExternalLink, 
  Settings, 
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Check,
  Share2,
  Workflow
} from 'lucide-react';
import { format } from 'date-fns';
import { MakeBlueprintSection } from '../components/MakeBlueprintSection';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot';
  text: string;
  timestamp: string;
  actionTaken?: string | null;
  statusBadge?: string;
}

export default function FacebookBot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'bot',
      text: '☕ Kumusta! Welcome to Tara Timpla Coffee on Facebook Messenger! I am your AI Barista assistant. You can ask me: "What is the status now of my order?", ask about our iced coffee menu, or request order assistance.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Active orders list for quick reference
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Automated notification outbox
  const [outboxLogs, setOutboxLogs] = useState<FBNotificationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // FB Settings
  const [pageId, setPageId] = useState(localStorage.getItem('tt_fb_page_id') || 'tara.timpla.coffee');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [activeTab, setActiveTab] = useState<'blueprint' | 'simulator'>('blueprint');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRecentOrders();
    fetchOutboxLogs();

    const interval = setInterval(() => {
      fetchOutboxLogs();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const fetchRecentOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .neq('product_variant', 'EMPLOYEE_ACCOUNT')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        setRecentOrders(data as Order[]);
        if (!selectedOrder && data.length > 0) {
          setSelectedOrder(data[0] as Order);
          setCustomerNameInput(data[0].customer_name);
        }
      }
    } catch (e) {
      console.error('Error fetching recent orders:', e);
    }
  };

  const fetchOutboxLogs = async () => {
    try {
      const res = await fetch('/api/fb-notifications');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) {
          setOutboxLogs(data.logs);
        }
      }
    } catch (e) {
      // Ignore background network error
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: 'customer',
      text: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query.trim(),
          customerName: customerNameInput.trim() || undefined,
          orderId: selectedOrder?.id,
        }),
      });

      const data = await res.json();
      const botReply = data.reply || data.fallbackReply || 'Thank you for reaching out to Tara Timpla Coffee!';

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        sender: 'bot',
        text: botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionTaken: data.actionTaken,
      };

      setMessages((prev) => [...prev, botMsg]);

      // If order was cancelled via AI action, refresh
      if (data.actionTaken === 'ORDER_CANCELLED') {
        fetchRecentOrders();
        fetchOutboxLogs();
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'bot',
          text: 'Hi! We are actively checking our station orders. Please mention your full name so our crew can assist you!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Test trigger automated message
  const handleTestTrigger = async (status: 'processing' | 'shipped' | 'delivered') => {
    if (!selectedOrder) {
      alert('Please select an order from the list first');
      return;
    }

    try {
      const res = await fetch('/api/orders/notify-fb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          newStatus: status,
          customerName: selectedOrder.customer_name,
          productVariant: selectedOrder.product_variant,
          quantity: selectedOrder.quantity,
          phone: selectedOrder.phone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchOutboxLogs();
        // Add to chat as well
        setMessages((prev) => [
          ...prev,
          {
            id: 'auto-' + Date.now(),
            sender: 'bot',
            text: data.dispatchedMessage,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            statusBadge: status.toUpperCase(),
          },
        ]);
      }
    } catch (e: any) {
      alert('Error triggering notification: ' + e.message);
    }
  };

  const webhookUrl = `${window.location.origin}/api/fb-webhook`;
  const verifyToken = 'tara_timpla_secret_token_2026';

  const copyToClipboard = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-[#C68A57]/15 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#2A1A12] tracking-tight">
                Tara Timpla Coffee FB Page AI
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Messenger Bot
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#A89B93] mt-0.5">
              Automated status updates on Processing + Customer Messenger AI for order inquiries and cancellation checks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-semibold text-xs flex items-center gap-1.5 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            AI Barista Ready (Gemini)
          </span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl max-w-md border border-gray-200">
        <button
          onClick={() => setActiveTab('blueprint')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'blueprint'
              ? 'bg-purple-800 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Workflow size={14} />
          Make.com &amp; Google Sheets
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'simulator'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <MessageSquare size={14} />
          Messenger Simulator &amp; Outbox
        </button>
      </div>

      {activeTab === 'blueprint' ? (
        <MakeBlueprintSection apiBaseUrl={`${window.location.origin}/api/gemini/chat`} />
      ) : (
        <>
          {/* Rules Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm text-amber-900">
                Tara Timpla Coffee Strict Policy Enforced by AI:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800/90 font-medium">
                <li>
                  <strong>Pending / New Order:</strong> The customer <strong>CAN CANCEL</strong> via chat. The AI will void it and update the Working Station pipeline immediately.
                </li>
                <li>
                  <strong>Processing (Brewing/Crafting):</strong> When crew moves order to Processing, the customer receives an automatic FB message. Per store rules, the customer <strong>CANNOT CANCEL</strong> once in process.
                </li>
                <li>
                  <strong>Shipped & Delivered:</strong> Handed to delivery rider or finished. Cancellations are strictly locked.
                </li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Facebook Messenger Simulator (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-[#C68A57]/15 shadow-sm overflow-hidden flex flex-col h-[640px]">
          {/* Messenger Chat Header */}
          <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white text-blue-700 flex items-center justify-center font-bold font-serif text-lg shadow-inner">
                ☕
              </div>
              <div>
                <h2 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                  Tara Timpla Coffee
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </h2>
                <p className="text-[11px] text-blue-100 opacity-90">
                  Typically replies instantly • AI Barista
                </p>
              </div>
            </div>

            {/* Current Customer Context Selector */}
            <div className="text-right">
              <label className="text-[10px] uppercase font-semibold text-blue-200 block">
                Simulated Customer:
              </label>
              <input
                type="text"
                placeholder="Type customer name..."
                value={customerNameInput}
                onChange={(e) => setCustomerNameInput(e.target.value)}
                className="px-2 py-1 bg-white/20 text-white text-xs rounded-lg placeholder:text-blue-200 outline-none border border-white/30 text-right font-medium max-w-[150px]"
              />
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto text-[11px] text-gray-700">
            <span className="font-semibold text-gray-500 whitespace-nowrap text-[10px] uppercase">
              Quick Ask:
            </span>
            <button
              onClick={() => handleSendMessage(`Hi! What is the status now of my order for ${customerNameInput || 'me'}?`)}
              className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 rounded-full whitespace-nowrap transition-all shadow-2xs font-medium"
            >
              🔍 "What is the status now of my order?"
            </button>
            <button
              onClick={() => handleSendMessage(`Can I please cancel my order for ${customerNameInput || 'me'}?`)}
              className="px-2.5 py-1 bg-white border border-gray-200 hover:border-red-500 hover:text-red-600 rounded-full whitespace-nowrap transition-all shadow-2xs font-medium"
            >
              ❌ "Can I cancel my order?"
            </button>
            <button
              onClick={() => handleSendMessage("What are your best-selling coffee drinks?")}
              className="px-2.5 py-1 bg-white border border-gray-200 hover:border-amber-500 hover:text-amber-700 rounded-full whitespace-nowrap transition-all shadow-2xs font-medium"
            >
              ☕ "Best-selling drinks?"
            </button>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#F7F8FA]">
            {messages.map((msg) => {
              const isBot = msg.sender === 'bot';

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isBot ? 'justify-start' : 'justify-end'}`}
                >
                  {isBot && (
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shrink-0 font-serif">
                      ☕
                    </div>
                  )}

                  <div className={`max-w-[82%] sm:max-w-[75%] space-y-1`}>
                    <div
                      className={`p-3.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-xs ${
                        isBot
                          ? 'bg-white text-gray-800 border border-gray-100 rounded-bl-xs'
                          : 'bg-blue-600 text-white rounded-br-xs font-medium'
                      }`}
                    >
                      {msg.statusBadge && (
                        <span className="inline-block mb-1.5 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px] tracking-wide">
                          🔔 AUTO NOTIFICATION: {msg.statusBadge}
                        </span>
                      )}
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {msg.actionTaken === 'ORDER_CANCELLED' && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold text-xs flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          <span>Status Updated: Order successfully cancelled while pending!</span>
                        </div>
                      )}
                    </div>
                    <p
                      className={`text-[10px] text-gray-400 px-1 ${
                        isBot ? 'text-left' : 'text-right'
                      }`}
                    >
                      {msg.timestamp}
                    </p>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                  ☕
                </div>
                <div className="p-3 bg-white rounded-2xl border border-gray-100 shadow-xs flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] font-medium ml-1">Tara Timpla AI is checking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask Tara Timpla AI about order status, cancellation, or menu..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-100/80 focus:bg-white rounded-full text-xs sm:text-sm outline-none border border-transparent focus:border-blue-500 transition-all text-gray-800"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-sm shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Automated Outbox & FB Page Setup (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Automated FB Outbox Log */}
          <div className="bg-white rounded-3xl border border-[#C68A57]/15 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-800 rounded-xl">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#2A1A12]">
                    Automated FB Messenger Outbox
                  </h3>
                  <p className="text-[11px] text-[#A89B93]">
                    Messages triggered automatically on status change
                  </p>
                </div>
              </div>
              <button
                onClick={fetchOutboxLogs}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                title="Refresh log"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Quick Test Action Button */}
            {selectedOrder && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-700">Selected Order:</span>
                  <span className="font-bold text-purple-800">
                    {selectedOrder.customer_name} ({selectedOrder.product_variant})
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleTestTrigger('processing')}
                    className="flex-1 py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-semibold transition-colors shadow-2xs"
                  >
                    Send "Processing" FB Msg
                  </button>
                  <button
                    onClick={() => handleTestTrigger('shipped')}
                    className="py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-semibold transition-colors"
                  >
                    Send "Shipped"
                  </button>
                </div>
              </div>
            )}

            {/* Outbox List */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {outboxLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400 border border-dashed rounded-xl">
                  No automated notifications dispatched yet.<br />
                  Move an order to <strong>Processing</strong> on the Working Station!
                </div>
              ) : (
                outboxLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-gray-50/80 hover:bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1 transition-all"
                  >
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-bold text-[#2A1A12] flex items-center gap-1">
                        <span>👤 {log.customerName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            log.status === 'processing'
                              ? 'bg-purple-100 text-purple-800'
                              : log.status === 'shipped'
                              ? 'bg-indigo-100 text-indigo-800'
                              : log.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.status}
                        </span>
                      </span>
                      <span className="text-gray-400 text-[10px]">
                        {format(new Date(log.sentAt), 'h:mm:ss a')}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-snug bg-white p-2 rounded-lg border border-gray-100 font-sans text-[11px]">
                      "{log.message}"
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Facebook Page Connection Details */}
          <div className="bg-white rounded-3xl border border-[#C68A57]/15 shadow-sm p-5 space-y-3.5">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                <Settings size={16} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2A1A12]">
                  Facebook Page Integration Settings
                </h3>
                <p className="text-[11px] text-[#A89B93]">
                  Connect your Tara Timpla Coffee Facebook Page
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Facebook Page Name / Username:
                </label>
                <input
                  type="text"
                  value={pageId}
                  onChange={(e) => {
                    setPageId(e.target.value);
                    localStorage.setItem('tt_fb_page_id', e.target.value);
                  }}
                  placeholder="e.g., tara.timpla.coffee"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-semibold text-gray-600">
                    Webhook Callback URL (Meta Developers):
                  </label>
                  <button
                    onClick={() => copyToClipboard(webhookUrl, 'url')}
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Copy size={11} /> {copiedWebhook ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-xs text-gray-600 font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-semibold text-gray-600">
                    Webhook Verify Token:
                  </label>
                  <button
                    onClick={() => copyToClipboard(verifyToken, 'token')}
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Copy size={11} /> {copiedToken ? 'Copied!' : 'Copy Token'}
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={verifyToken}
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-xs text-gray-600 font-mono"
                />
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                <strong>How to hook into Facebook Messenger:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-0.5">
                  <li>Go to <strong>developers.facebook.com</strong> &rarr; Your App &rarr; Messenger.</li>
                  <li>Paste the <strong>Webhook Callback URL</strong> and <strong>Verify Token</strong> above.</li>
                  <li>Subscribe to <code>messages</code> and <code>messaging_postbacks</code>.</li>
                  <li>Now customer inquiries on your Tara Timpla Coffee FB Page will connect directly to this AI barista!</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )}
</div>
  );
}
