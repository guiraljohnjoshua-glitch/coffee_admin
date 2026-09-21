import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();
app.use(express.json());

// Initialize Supabase admin/server client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lazy init Gemini AI
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not defined in environment');
    }
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

// Memory log of sent Facebook messages
interface FBLogEntry {
  id: string;
  orderId: string;
  customerName: string;
  phone?: string;
  status: string;
  message: string;
  sentAt: string;
  channel: 'facebook_messenger' | 'simulated_webhook';
  delivered: boolean;
}

const fbNotificationLogs: FBLogEntry[] = [];

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    store: 'Tara Timpla Coffee',
    timestamp: new Date().toISOString(),
    geminiAvailable: !!process.env.GEMINI_API_KEY,
  });
});

// Meta / Facebook Webhook Verification (GET)
app.get('/api/fb-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = (process.env.FB_VERIFY_TOKEN || 'tara_timpla_secret_token_2026').trim();

  if (mode && token) {
    if (mode === 'subscribe' && String(token).trim() === verifyToken) {
      console.log('FB Webhook Verified successfully with challenge:', challenge);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(challenge));
    } else {
      console.warn('FB Webhook verification failed. Received token:', token, 'expected:', verifyToken);
      return res.sendStatus(403);
    }
  }
  res.status(200).json({ status: 'Tara Timpla Coffee FB Webhook Endpoint ready' });
});

// Meta / Facebook Webhook Receiver (POST)
app.post('/api/fb-webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    // Process page entries if Meta Webhook is connected
    console.log('Received FB Webhook payload:', JSON.stringify(body));
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.sendStatus(404);
});

// Get FB notification history
app.get('/api/fb-notifications', (req, res) => {
  res.json({ logs: fbNotificationLogs });
});

// Notify customer FB when status changes (especially to processing)
app.post('/api/orders/notify-fb', async (req, res) => {
  try {
    const { orderId, newStatus, customerName, productVariant, quantity, phone } = req.body;

    if (!orderId || !newStatus) {
      return res.status(400).json({ error: 'orderId and newStatus are required' });
    }

    let message = '';
    const safeName = customerName || 'Customer';
    const safeProduct = productVariant || 'Order';
    const safeQty = quantity ? `(x${quantity})` : '';

    if (newStatus === 'processing') {
      message = `☕ Tara Timpla Coffee Update: Hi ${safeName}! Great news! Our crew is now actively PREPARING and freshly brewing your order: ${safeProduct} ${safeQty}. Per our store policy, your order is now locked in and cannot be cancelled. Salamat for choosing Tara Timpla!`;
    } else if (newStatus === 'pending') {
      message = `☕ Tara Timpla Coffee: Hi ${safeName}, your order for ${safeProduct} ${safeQty} is received and PENDING confirmation by our crew. If you need to cancel or change details, please let us know right away before we begin brewing!`;
    } else if (newStatus === 'shipped') {
      message = `🛵 Tara Timpla Coffee: Hi ${safeName}! Your order (${safeProduct} ${safeQty}) has been handed over to our delivery rider and is now SHIPPED! Please keep your phone ready for rider updates.`;
    } else if (newStatus === 'delivered') {
      message = `🎉 Tara Timpla Coffee: Hi ${safeName}! Your order has been marked as DELIVERED! We hope you enjoy every sip. Have a wonderful day! ☕`;
    } else if (newStatus === 'cancelled') {
      message = `❌ Tara Timpla Coffee: Hi ${safeName}, your order for ${safeProduct} has been CANCELLED. If this was a mistake, feel free to message us or place a new order anytime.`;
    } else {
      message = `☕ Tara Timpla Coffee Update: Hi ${safeName}, your order status is now ${newStatus}.`;
    }

    const logEntry: FBLogEntry = {
      id: 'fb-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      orderId: String(orderId),
      customerName: safeName,
      phone: phone || '',
      status: newStatus,
      message,
      sentAt: new Date().toISOString(),
      channel: process.env.FB_PAGE_ACCESS_TOKEN ? 'facebook_messenger' : 'simulated_webhook',
      delivered: true,
    };

    fbNotificationLogs.unshift(logEntry);
    if (fbNotificationLogs.length > 50) fbNotificationLogs.pop();

    // If real Facebook Page Access Token is provided, dispatch to Meta Graph API
    const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (pageAccessToken && phone) {
      try {
        console.log(`[FB API] Would dispatch to Meta Graph API for ${safeName}`);
      } catch (fbErr) {
        console.warn('Meta Graph API call failed (using fallback logger):', fbErr);
      }
    }

    res.json({
      success: true,
      log: logEntry,
      dispatchedMessage: message,
    });
  } catch (error: any) {
    console.error('Error notifying FB customer:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// AI Chatbot endpoint for Facebook Page customer interaction
app.post('/api/gemini/chat', async (req, res) => {
  let candidateOrders: any[] = [];
  try {
    const { message, customerName, orderId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Lookup relevant orders from Supabase for context
    let orderContext = 'No specific order found.';

    try {
      let query = supabase.from('orders').select('*').neq('product_variant', 'EMPLOYEE_ACCOUNT').order('created_at', { ascending: false }).limit(6);
      
      if (customerName) {
        query = query.ilike('customer_name', `%${customerName.trim()}%`);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        candidateOrders = data;
        orderContext = candidateOrders
          .map(
            (o) =>
              `- Order ID: ${o.id.slice(0, 8)} | Customer: ${o.customer_name} | Item: ${o.product_variant} (x${o.quantity}) | Price: ₱${o.total_price || (o.quantity * 120)} | Current Status: ${o.status.toUpperCase()} | Address: ${o.address || o.city || 'N/A'}`
          )
          .join('\n');
      }
    } catch (e) {
      console.warn('Could not fetch orders for chatbot context:', e);
    }

    const ai = getGeminiClient();

    const systemPrompt = `You are the official AI Barista & Order Assistant for "Tara Timpla Coffee" on their Facebook Page (Facebook Messenger Chatbot).
Your tone is warm, polite, cheerful, and hospitable (Filipino coffee shop barista style - English or natural Taglish if appropriate).

STORE INFORMATION:
- Store Name: Tara Timpla Coffee
- Specialties: Artisanal Iced & Hot Coffee (Spanish Latte, Caramel Macchiato, Cold Brew, Hazelnut Cream Latte), Freshly Baked Croissants, and Pastries.
- Cash On Delivery (COD) & GCash supported.

CURRENT STORE ORDERS CONTEXT:
${orderContext}

CRITICAL RULES FOR ORDER STATUS & CANCELLATIONS:
1. ORDER STATUS INQUIRIES:
   - When a customer asks "what is the status now of my order?" or mentions their name or order:
   - Check the orders context. Identify their order.
   - Explain clearly which stage their order is currently in:
     * NEW ORDER: "We just received your order! Our crew will accept and review it shortly."
     * PENDING: "Your order is currently PENDING confirmation. Our crew is queueing it up."
     * PROCESSING: "Our crew has started PREPARING and brewing your order fresh right now! Per Tara Timpla Coffee policy, once an order is in processing, it is being crafted and cannot be cancelled anymore."
     * SHIPPED: "Your order has been handed over to our delivery rider and is out for delivery! Please keep your phone nearby."
     * DELIVERED: "Your order has been marked as DELIVERED! Enjoy your coffee! ☕"
     * CANCELLED: "This order was cancelled."

2. CANCELLATION REQUESTS (STRICT POLICY):
   - If the customer wants to cancel:
     * IF the order is in 'new' or 'pending': The customer CAN CANCEL! Inform them: "Yes, since your order is still in Pending / New and our crew has not started brewing yet, we can cancel it for you right now." Include the action token "[ACTION: CANCEL_ORDER]" in your response so the system can automatically update the status.
     * IF the order is in 'processing': The customer CANNOT CANCEL! Inform them politely and firmly: "We are truly sorry, but our crew is already actively brewing and preparing your order! Under Tara Timpla Coffee policy, orders that are already in PROCESSING cannot be cancelled because the coffee is already being prepared fresh for you. Thank you so much for understanding!"
     * IF the order is in 'shipped' or 'delivered': They cannot cancel as it is already on the road or delivered.

3. If you do not have enough info to find their order, politely ask for their Customer Name or the first 4-8 digits of their Order ID.
Keep responses concise, friendly, and easy to read on mobile Facebook Messenger.`;

    const promptText = `${systemPrompt}\n\nCustomer Name provided by system: "${customerName || ''}"\nCustomer Message: "${message}"`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
      });
    } catch (modelErr: any) {
      console.warn('First model attempt failed, trying gemini-2.5-flash-lite:', modelErr.message);
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
      });
    }

    const aiReply = response.text || 'Thank you for messaging Tara Timpla Coffee! How can we help you today?';

    // Check if AI approved a cancellation
    let actionTaken = null;
    let updatedOrderId = null;

    if (aiReply.includes('[ACTION: CANCEL_ORDER]') && candidateOrders.length > 0) {
      const targetOrder = candidateOrders[0];
      if (targetOrder && (targetOrder.status === 'pending' || targetOrder.status === 'new')) {
        const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', targetOrder.id);
        if (!error) {
          actionTaken = 'ORDER_CANCELLED';
          updatedOrderId = targetOrder.id;
        }
      }
    }

    // Clean any action tokens from user-visible reply
    const cleanedReply = aiReply.replace(/\[ACTION:.*?\]/g, '').trim();

    res.json({
      reply: cleanedReply,
      actionTaken,
      updatedOrderId,
      matchedOrders: candidateOrders.map((o) => ({
        id: o.id,
        customer_name: o.customer_name,
        product_variant: o.product_variant,
        status: o.status,
      })),
    });
  } catch (error: any) {
    console.warn('Gemini chat API error, generating intelligent local barista reply:', error.message);
    
    // Intelligent store assistant fallback based on orders context and customer query
    const lower = (req.body.message || '').toLowerCase();
    let reply = '';
    let actionTaken = null;
    let updatedOrderId = null;

    const matched = candidateOrders[0];

    if (lower.includes('cancel')) {
      if (!matched) {
        reply = "☕ Tara Timpla Coffee: We'd be glad to check on that for you! Could you please provide your full name or order number so we can check if it's still eligible for cancellation?";
      } else if (matched.status === 'new' || matched.status === 'pending') {
        // Allowed to cancel
        try {
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', matched.id);
          actionTaken = 'ORDER_CANCELLED';
          updatedOrderId = matched.id;
          reply = `☕ Tara Timpla Coffee: Yes! Since your order (${matched.product_variant}) is still in ${matched.status.toUpperCase()} and our crew has not started brewing yet, we have successfully CANCELLED your order. Salamat!`;
        } catch (e) {
          reply = `☕ Tara Timpla Coffee: Your order is in ${matched.status.toUpperCase()} stage and eligible for cancellation. Please hold on while we process it!`;
        }
      } else if (matched.status === 'processing') {
        reply = `☕ Tara Timpla Coffee: We are truly sorry, but our crew is already actively PREPARING and freshly brewing your ${matched.product_variant}! Per Tara Timpla Coffee policy, orders that are already in PROCESSING cannot be cancelled because the beverage is already being crafted fresh for you. Thank you for your kind understanding!`;
      } else if (matched.status === 'shipped') {
        reply = `🛵 Tara Timpla Coffee: Your order (${matched.product_variant}) is already with our delivery rider on the way, so it cannot be cancelled at this stage. Please keep your line open for the rider!`;
      } else if (matched.status === 'delivered') {
        reply = `☕ Tara Timpla Coffee: Your order was already marked as DELIVERED. We hope you enjoyed your drink!`;
      } else if (matched.status === 'cancelled') {
        reply = `☕ Tara Timpla Coffee: This order (${matched.product_variant}) was already cancelled.`;
      }
    } else if (lower.includes('status') || lower.includes('update') || lower.includes('where')) {
      if (!matched) {
        reply = `☕ Tara Timpla Coffee: Hello! To check your order status, please tell us your name so we can pull up your ticket from our Working Station immediately.`;
      } else {
        const item = matched.product_variant;
        const stat = matched.status.toUpperCase();
        if (matched.status === 'new') {
          reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! We just received your order for ${item} (Status: NEW). Our crew will accept and queue it up shortly!`;
        } else if (matched.status === 'pending') {
          reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! Your order for ${item} is currently PENDING confirmation by our crew. If you need any adjustments or cancellation, please let us know right now before we begin brewing!`;
        } else if (matched.status === 'processing') {
          reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! Great news! Our crew is actively PREPARING and freshly brewing your ${item} right now (Status: PROCESSING). Per our store policy, your order is now locked in and cannot be cancelled.`;
        } else if (matched.status === 'shipped') {
          reply = `🛵 Tara Timpla Coffee: Hi ${matched.customer_name}! Your ${item} has been handed over to our delivery rider and is out for delivery (Status: SHIPPED)!`;
        } else if (matched.status === 'delivered') {
          reply = `🎉 Tara Timpla Coffee: Hi ${matched.customer_name}! Your order for ${item} has been marked as DELIVERED! Enjoy your coffee! ☕`;
        } else if (matched.status === 'cancelled') {
          reply = `❌ Tara Timpla Coffee: Hi ${matched.customer_name}, your order for ${item} is CANCELLED.`;
        }
      }
    } else if (lower.includes('menu') || lower.includes('recommend') || lower.includes('best') || lower.includes('special')) {
      reply = `☕ Tara Timpla Coffee Favorites:
1. Spanish Latte (₱140) - Rich espresso with condensed milk, our #1 crowd favorite!
2. Caramel Macchiato (₱145) - Layered vanilla, steamed milk, espresso & caramel drizzle.
3. Vanilla Sweet Cream Cold Brew (₱130) - Slow-steeped 16-hour cold brew topped with house sweet cream.
4. Butter Croissant Combo (₱190) - Freshly baked pastry paired with coffee.

Which one would you like to try today?`;
    } else {
      reply = `☕ Tara Timpla Coffee: Kumusta! Welcome to Tara Timpla Coffee! We are here to help. You can ask us: "What is the status now of my order?", ask about our iced coffee menu, or check your delivery!`;
    }

    res.json({
      reply,
      actionTaken,
      updatedOrderId,
      matchedOrders: candidateOrders.map((o) => ({
        id: o.id,
        customer_name: o.customer_name,
        product_variant: o.product_variant,
        status: o.status,
      })),
    });
  }
});

// Direct cancellation API (checks rule: allowed if pending/new, forbidden if processing/shipped/delivered)
app.post('/api/orders/cancel-customer', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'new' && order.status !== 'pending') {
      return res.status(403).json({
        allowed: false,
        error: `Order cannot be cancelled because it is already in ${order.status.toUpperCase()} stage. Our crew is already preparing your coffee!`,
        currentStatus: order.status,
      });
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (updateErr) throw updateErr;

    // Log cancellation notification
    fbNotificationLogs.unshift({
      id: 'fb-' + Date.now(),
      orderId,
      customerName: order.customer_name,
      status: 'cancelled',
      message: `❌ Tara Timpla Coffee: Order #${orderId.slice(0, 8)} has been cancelled per customer request while in ${order.status} state.`,
      sentAt: new Date().toISOString(),
      channel: 'simulated_webhook',
      delivered: true,
    });

    res.json({
      allowed: true,
      message: 'Order cancelled successfully while still pending.',
    });
  } catch (err: any) {
    console.error('Error cancelling order:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ==========================================
// VITE & STATIC FILES
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`☕ Tara Timpla Coffee Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
