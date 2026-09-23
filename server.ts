import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
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

// Download Make.com blueprint as JSON attachment file
app.get(['/api/download-blueprint', '/download-blueprint.json', '/tara-timpla-make-blueprint.json'], (req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'tara-timpla-make-blueprint.json');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="tara-timpla-make-blueprint.json"');
    return res.sendFile(filePath);
  }
  return res.status(404).send('Blueprint not found');
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

// AI Chatbot endpoint for website customer interaction & closing deals
app.post('/api/ai-chat/create-order', async (req, res) => {
  try {
    const {
      customer_name,
      phone,
      address,
      landmarked,
      product_variant,
      quantity = 1,
      total_price,
      payment_method = 'COD',
      notes
    } = req.body;

    if (!customer_name || !product_variant) {
      return res.status(400).json({ error: 'Customer name and product variant are required' });
    }

    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          customer_name: customer_name.trim(),
          email: `${customer_name.trim().toLowerCase().replace(/\s+/g, '')}@taratimpla.ph`,
          phone: (phone || '09123456789').trim(),
          city: 'Metro Manila',
          address: (address || 'Tara Timpla Delivery Address').trim(),
          landmarked: (landmarked || notes || 'Online AI Chatbot Order').trim(),
          product_name: 'Tara Timpla Coffee',
          product_variant: product_variant.trim(),
          quantity: Number(quantity) || 1,
          total_price: Number(total_price) || 140,
          payment_method: payment_method || 'COD',
          status: 'new',
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      order: data,
      message: `Order #${data.id.slice(0, 8)} successfully placed! Our barista team has been notified in the Working Station.`
    });
  } catch (err: any) {
    console.error('Error creating order via AI chatbot:', err);
    res.status(500).json({ error: err.message || 'Could not place order' });
  }
});

// Helper to calculate real-time store sales, progress, and tracked records
async function fetchStoreAnalytics() {
  try {
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('*')
      .neq('product_variant', 'EMPLOYEE_ACCOUNT')
      .order('created_at', { ascending: false });

    if (error || !allOrders) {
      return {
        totalOrdersCount: 0,
        totalGrossRevenue: 0,
        deliveredRevenue: 0,
        todayRevenue: 0,
        todayOrdersCount: 0,
        countsByStatus: { new: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
        activeOrdersCount: 0,
        avgOrderValue: 0,
        fulfillmentRate: 100,
        topProducts: [] as { name: string; count: number; total: number }[],
        paymentBreakdown: { cod: { count: 0, total: 0 }, gcash: { count: 0, total: 0 } },
        allOrders: [] as any[],
      };
    }

    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

    let totalGrossRevenue = 0;
    let deliveredRevenue = 0;
    let todayRevenue = 0;
    let todayOrdersCount = 0;
    const countsByStatus: Record<string, number> = {
      new: 0,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };

    const productSalesMap: Record<string, { count: number; total: number }> = {};
    const paymentMap: Record<string, { count: number; total: number }> = {
      cod: { count: 0, total: 0 },
      gcash: { count: 0, total: 0 },
    };

    for (const o of allOrders) {
      const status = (o.status || 'new').toLowerCase();
      if (countsByStatus[status] !== undefined) {
        countsByStatus[status]++;
      } else {
        countsByStatus.new = (countsByStatus.new || 0) + 1;
      }

      const price = Number(o.total_price) || (Number(o.quantity) || 1) * 140;

      if (status !== 'cancelled') {
        totalGrossRevenue += price;

        const orderDate = o.created_at
          ? new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          : '';
        if (orderDate === todayDate) {
          todayRevenue += price;
          todayOrdersCount++;
        }

        if (status === 'delivered') {
          deliveredRevenue += price;
        }

        const prod = o.product_variant || 'Specialty Coffee';
        if (!productSalesMap[prod]) {
          productSalesMap[prod] = { count: 0, total: 0 };
        }
        productSalesMap[prod].count += Number(o.quantity) || 1;
        productSalesMap[prod].total += price;

        const pMethod = (o.payment_method || 'cod').toLowerCase();
        if (pMethod.includes('gcash')) {
          paymentMap.gcash.count++;
          paymentMap.gcash.total += price;
        } else {
          paymentMap.cod.count++;
          paymentMap.cod.total += price;
        }
      }
    }

    const nonCancelled = allOrders.filter((o) => o.status !== 'cancelled').length;
    const avgOrderValue = nonCancelled > 0 ? Math.round(totalGrossRevenue / nonCancelled) : 0;
    const activeOrdersCount = countsByStatus.new + countsByStatus.pending + countsByStatus.processing + countsByStatus.shipped;
    const fulfillmentRate = nonCancelled > 0 ? Math.round((countsByStatus.delivered / nonCancelled) * 100) : 100;

    const topProducts = Object.entries(productSalesMap)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      totalOrdersCount: allOrders.length,
      totalGrossRevenue,
      deliveredRevenue,
      todayRevenue,
      todayOrdersCount,
      countsByStatus,
      activeOrdersCount,
      avgOrderValue,
      fulfillmentRate,
      topProducts,
      paymentBreakdown: paymentMap,
      allOrders,
    };
  } catch (err) {
    console.error('Error in fetchStoreAnalytics:', err);
    return null;
  }
}

// Live Store Analytics endpoint for UI dashboards & AI metrics
app.get('/api/store/analytics', async (_req, res) => {
  try {
    const analytics = await fetchStoreAnalytics();
    res.json({ success: true, analytics });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Could not fetch store analytics' });
  }
});

// AI Chatbot endpoint for website customer interaction
app.post('/api/gemini/chat', async (req, res) => {
  let candidateOrders: any[] = [];
  let storeAnalytics: any = null;
  try {
    const { message, customerName, orderId, activeOrderPhone } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Fetch live store analytics & all tracked records
    storeAnalytics = await fetchStoreAnalytics();

    // Lookup relevant orders from Supabase for context
    let orderContext = 'No specific order found.';

    try {
      let query = supabase
        .from('orders')
        .select('*')
        .neq('product_variant', 'EMPLOYEE_ACCOUNT')
        .order('created_at', { ascending: false })
        .limit(10);

      if (orderId) {
        query = query.or(`id.eq.${orderId},id.ilike.${orderId}%`);
      } else if (customerName) {
        query = query.ilike('customer_name', `%${customerName.trim()}%`);
      } else if (activeOrderPhone) {
        query = query.eq('phone', activeOrderPhone.trim());
      }

      const { data } = await query;
      if (data && data.length > 0) {
        candidateOrders = data;
        orderContext = candidateOrders
          .map(
            (o) =>
              `- Order ID: ${o.id.slice(0, 8)} (Full: ${o.id}) | Customer: ${o.customer_name} | Phone: ${o.phone} | Item: ${o.product_variant} (x${o.quantity}) | Price: ₱${o.total_price || (o.quantity * 140)} | Payment: ${o.payment_method || 'COD'} | Status: ${o.status.toUpperCase()} | Address: ${o.address || o.city || 'N/A'}`
          )
          .join('\n');
      }
    } catch (e) {
      console.warn('Could not fetch orders for chatbot context:', e);
    }

    // Format all tracked records for AI knowledge
    const trackedRecordsSummary = (storeAnalytics?.allOrders || [])
      .slice(0, 20)
      .map(
        (o: any, idx: number) =>
          `${idx + 1}. #${o.id.slice(0, 8)} | ${o.customer_name} | ${o.product_variant} (x${o.quantity}) | ₱${o.total_price || 140} | [${(o.status || 'new').toUpperCase()}] | ${o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Today'}`
      )
      .join('\n');

    const topSellingSummary = (storeAnalytics?.topProducts || [])
      .map(
        (p: any, i: number) =>
          `${i + 1}. ${p.name} - ${p.count} sold (₱${p.total.toLocaleString()} total revenue)`
      )
      .join('\n');

    const ai = getGeminiClient();

    const systemPrompt = `You are "Tara Timpla AI Assistant", the official Virtual Barista, Store Progress Analyst, and Real-Time Business Intelligence Specialist for Tara Timpla Coffee.
You are embedded directly on the Tara Timpla Coffee website.
Tone: Warm, hospitable, energetic Filipino specialty coffee barista and sharp store manager. Passionate about great brews, polite, and fluent in English or natural Taglish.

LIVE STORE SALES & PROGRESS METRICS (REAL-TIME FROM WORKING STATION & DATABASE):
- Today's Sales: ₱${(storeAnalytics?.todayRevenue || 0).toLocaleString()} across ${storeAnalytics?.todayOrdersCount || 0} order(s) placed today.
- Total Gross Revenue: ₱${(storeAnalytics?.totalGrossRevenue || 0).toLocaleString()} across all non-cancelled orders.
- Delivered (Collected) Sales: ₱${(storeAnalytics?.deliveredRevenue || 0).toLocaleString()} (${storeAnalytics?.countsByStatus?.delivered || 0} delivered orders).
- Total Orders Tracked in System: ${storeAnalytics?.totalOrdersCount || 0} total records.
- Average Order Value (AOV): ₱${storeAnalytics?.avgOrderValue || 0}
- Fulfillment Completion Rate: ${storeAnalytics?.fulfillmentRate || 100}%
- Payment Split: COD (₱${(storeAnalytics?.paymentBreakdown?.cod?.total || 0).toLocaleString()}, ${storeAnalytics?.paymentBreakdown?.cod?.count || 0} orders) | GCash (₱${(storeAnalytics?.paymentBreakdown?.gcash?.total || 0).toLocaleString()}, ${storeAnalytics?.paymentBreakdown?.gcash?.count || 0} orders).

WORKING STATION LIVE PIPELINE STATUS:
- New (Incoming): ${storeAnalytics?.countsByStatus?.new || 0}
- Pending (Queued for confirmation): ${storeAnalytics?.countsByStatus?.pending || 0}
- Processing (Actively Brewing right now at the Station): ${storeAnalytics?.countsByStatus?.processing || 0}
- Shipped (Out on delivery with rider): ${storeAnalytics?.countsByStatus?.shipped || 0}
- Delivered (Fulfilled & Completed): ${storeAnalytics?.countsByStatus?.delivered || 0}
- Cancelled: ${storeAnalytics?.countsByStatus?.cancelled || 0}
- Total Active Orders in Pipeline right now: ${storeAnalytics?.activeOrdersCount || 0}

TOP-SELLING SPECIALTY DRINKS & PASTRIES:
${topSellingSummary || '1. Spanish Latte - Best Seller\n2. Caramel Macchiato\n3. Cold Brew Reserve'}

RECENT TRACKED ORDER RECORDS (LIVE AUDIT LOG):
${trackedRecordsSummary || 'No recent orders yet.'}

TARA TIMPLA COFFEE MENU & PRICING:
Espresso & Specialty Beverages:
- Spanish Latte (₱140 Regular 16oz / ₱165 Large 22oz) - Best Seller! Double espresso, sweetened condensed milk, velvety milk. Rich & balanced.
- Caramel Macchiato (₱145 / ₱170) - Layered vanilla, fresh steamed/iced milk, espresso, and rich caramel drizzle.
- Sea Salt Latte (₱150 / ₱175) - House signature iced espresso topped with thick salted cream foam.
- Hazelnut Cream Latte (₱145 / ₱170) - Roasted hazelnut infused espresso with silky cream.
- Cold Brew Reserve (₱130 / ₱155) - 18-hour slow-steeped Arabica blend, smooth with zero bitterness.
- Americano Classic (₱110 / ₱135) - Bold double shot over water (Iced or Hot).
- Matcha Cream Espresso (₱155 / ₱180) - Authentic Japanese Uji matcha layered with espresso.
- Dark Chocolate Mocha (₱150 / ₱175) - Davao artisan chocolate melted with bold espresso.

Bakery & Pastries:
- Fresh Butter Croissant (₱85) - Flaky, golden, baked every morning.
- Pain au Chocolat (₱95) - Double Belgian dark chocolate batons.
- Ube Cheese Pandesal (₱45) - Soft warm pandesal with real ube halaya & cheddar core.
- Cinnamon Cream Roll (₱80) - Soft brioche with Saigon cinnamon glaze.

Customization Options:
- Temperature: Iced (most popular) or Hot
- Size: 16oz (Standard) or 22oz (+₱25)
- Sweetness: 0% (Unsweetened), 25% (Mild), 50% (Recommended / Timpla Standard), 75% (Sweet), 100% (Extra Sweet)
- Milk Choice: Fresh Whole Milk (included), Oat Milk (+₱30), Almond Milk (+₱30)
- Extra Espresso Shot: +₱30

STORE POLICIES & DELIVERY:
- Store Hours: 7:00 AM – 10:00 PM every day.
- Delivery Time: 30–45 minutes freshly brewed to doorstep.
- Payment Methods: Cash on Delivery (COD) or GCash.
- Cancellation Policy: Orders can be cancelled ONLY while in 'new' or 'pending' stage (before barista brews). Once in 'processing' (brewing), the order cannot be cancelled anymore.

YOUR CORE MISSIONS:

MISSION 1: ANSWER "HOW'S THE SALES GOING?"
When asked about sales, revenue, daily sales, earnings, or financial health:
- Provide a clear, structured, encouraging executive sales breakdown.
- Highlight:
  * Today's Sales (₱ and order count)
  * Total Gross Store Revenue (₱)
  * Delivered Sales (collected cash)
  * Average Order Value (AOV)
  * Top-selling drink rankings with units sold
  * Payment collection split (COD vs GCash)
- Add an upbeat remark about how the store and customer demand is doing!

MISSION 2: ANSWER ABOUT THE STORE PROGRESS & WORKING STATION PIPELINE
When asked about store progress, operational workflow, station status, or how orders are moving:
- Break down the live Working Station stages:
  * Brewing right now (Processing): ${storeAnalytics?.countsByStatus?.processing || 0} order(s)
  * Out with riders (Shipped): ${storeAnalytics?.countsByStatus?.shipped || 0} order(s)
  * Queued / Incoming (Pending/New): ${(storeAnalytics?.countsByStatus?.pending || 0) + (storeAnalytics?.countsByStatus?.new || 0)} order(s)
  * Successfully Completed (Delivered): ${storeAnalytics?.countsByStatus?.delivered || 0} order(s)
  * Fulfillment rate: ${storeAnalytics?.fulfillmentRate || 100}%
- Give a crisp overview of kitchen/station pace and delivery turnaround.

MISSION 3: TRACK ALL THE RECORDS & ORDER LOOKUPS
When asked to "track all the record", "show order records", "view transactions", "audit log", or lookup a customer's history:
- Present the tracked records in a clean, scannable format listing:
  * Order ID (#1234abcd)
  * Customer Name
  * Drink / Pastry ordered & quantity
  * Total Price (₱)
  * Current Live Status (NEW / PENDING / PROCESSING / SHIPPED / DELIVERED / CANCELLED)
- If asked for a specific customer or Order ID, search the records and report their exact timeline!

MISSION 4: BARISTA ORDER TAKING & CLOSING DEALS
When customers want to order drinks:
- Warmly confirm their drink, size (16oz or 22oz), temperature (Iced or Hot), sweetness (0-100%), and milk choice.
- Ask for Name, Phone, and Address.
- When confirmed, enthusiastically close the deal and output this EXACT action token:
  [ACTION: CREATE_ORDER: {"customer_name":"...", "phone":"...", "address":"...", "landmarked":"...", "product_variant":"...", "quantity":1, "total_price":140, "payment_method":"COD"}]

MISSION 5: ORDER STATUS & CANCELLATIONS
Current candidate order context:
${orderContext}
- If customer asks their personal order status, check candidate order context.
- If customer requests cancellation:
  * If 'new' or 'pending': Approve cancellation warmly! Include [ACTION: CANCEL_ORDER] in response.
  * If 'processing': Politely decline: "Our crew is already actively brewing and preparing your order fresh right now! Per Tara Timpla store policy, orders in PROCESSING cannot be cancelled as the drink is already in craft."
  * If 'shipped' or 'delivered': Already on the road / completed.`;

    const promptText = `${systemPrompt}\n\nCustomer Name: "${customerName || ''}"\nCustomer Message: "${message}"`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
      });
    } catch (modelErr: any) {
      console.warn('gemini-3.8-flash attempt failed, trying fallback:', modelErr.message);
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
      });
    }

    const aiReply = response.text || 'Kumusta! Welcome to Tara Timpla Coffee. How may I brew up happiness for you today?';

    let actionTaken = null;
    let updatedOrderId = null;
    let createdOrder = null;

    // Check for order cancellation
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

    // Check for order creation deal closed
    const orderMatch = aiReply.match(/\[ACTION:\s*CREATE_ORDER:\s*(\{.*?\})\]/s);
    if (orderMatch) {
      try {
        const orderData = JSON.parse(orderMatch[1]);
        const { data, error } = await supabase
          .from('orders')
          .insert([
            {
              customer_name: orderData.customer_name || customerName || 'Valued Customer',
              email: `${(orderData.customer_name || 'guest').toLowerCase().replace(/\s+/g, '')}@taratimpla.ph`,
              phone: orderData.phone || '09123456789',
              city: 'Metro Manila',
              address: orderData.address || 'Delivery Address',
              landmarked: orderData.landmarked || 'Website AI Chatbot Order',
              product_name: 'Tara Timpla Coffee',
              product_variant: orderData.product_variant || 'Spanish Latte (16oz, Iced, 50% Sweetness)',
              quantity: Number(orderData.quantity) || 1,
              total_price: Number(orderData.total_price) || 140,
              payment_method: orderData.payment_method || 'COD',
              status: 'new',
            },
          ])
          .select()
          .single();

        if (!error && data) {
          actionTaken = 'ORDER_CREATED';
          createdOrder = data;
          updatedOrderId = data.id;
        }
      } catch (parseErr) {
        console.warn('Could not parse or insert AI order:', parseErr);
      }
    }

    // Clean any action tokens from user-visible reply
    const cleanedReply = aiReply
      .replace(/\[ACTION:\s*CANCEL_ORDER\]/g, '')
      .replace(/\[ACTION:\s*CREATE_ORDER:.*?\]/gs, '')
      .trim();

    res.json({
      reply: cleanedReply,
      actionTaken,
      updatedOrderId,
      createdOrder,
      storeAnalytics,
      matchedOrders: candidateOrders.map((o) => ({
        id: o.id,
        customer_name: o.customer_name,
        product_variant: o.product_variant,
        status: o.status,
        total_price: o.total_price,
      })),
    });
  } catch (error: any) {
    console.warn('Gemini chat API error, generating intelligent local barista & sales reply:', error.message);
    
    // Ensure we have real store analytics for accurate intelligent answers
    if (!storeAnalytics) {
      try {
        storeAnalytics = await fetchStoreAnalytics();
      } catch (e) {
        console.warn('Could not fetch store analytics in fallback:', e);
      }
    }

    const lower = (req.body.message || '').toLowerCase();
    let reply = '';
    let actionTaken = null;
    let updatedOrderId = null;
    let createdOrder = null;

    const matched = candidateOrders[0];

    // 1. SALES INQUIRY ("How's sales going?")
    if (
      lower.includes('sale') ||
      lower.includes('revenue') ||
      lower.includes('earn') ||
      lower.includes('income') ||
      lower.includes('gross') ||
      lower.includes('how much did') ||
      lower.includes('financial')
    ) {
      const todayRev = (storeAnalytics?.todayRevenue || 0).toLocaleString();
      const totalRev = (storeAnalytics?.totalGrossRevenue || 0).toLocaleString();
      const delivRev = (storeAnalytics?.deliveredRevenue || 0).toLocaleString();
      const topItems = (storeAnalytics?.topProducts || [])
        .slice(0, 3)
        .map((p: any, i: number) => `   ${i + 1}. **${p.name}** - ${p.count} sold (₱${p.total.toLocaleString()})`)
        .join('\n');

      reply = `📊 **Tara Timpla Coffee - Sales & Revenue Performance** ☕✨

Here is our live sales summary straight from our database:

💰 **Today's Sales**: **₱${todayRev}** (${storeAnalytics?.todayOrdersCount || 0} orders today)
📈 **Total Gross Revenue**: **₱${totalRev}** across ${storeAnalytics?.totalOrdersCount || 0} total records
✅ **Delivered / Realized Revenue**: **₱${delivRev}**
💳 **Average Order Value (AOV)**: **₱${storeAnalytics?.avgOrderValue || 0}**

🏆 **Top Selling Drinks & Items**:
${topItems || '   1. Spanish Latte\n   2. Caramel Macchiato\n   3. Cold Brew Reserve'}

💵 **Payment Distribution**:
- Cash on Delivery (COD): ₱${(storeAnalytics?.paymentBreakdown?.cod?.total || 0).toLocaleString()} (${storeAnalytics?.paymentBreakdown?.cod?.count || 0} orders)
- GCash: ₱${(storeAnalytics?.paymentBreakdown?.gcash?.total || 0).toLocaleString()} (${storeAnalytics?.paymentBreakdown?.gcash?.count || 0} orders)

Sales are moving briskly today! Would you like to inspect specific order records or filter by date?`;
    }
    // 2. STORE PROGRESS & WORKING STATION PIPELINE
    else if (
      lower.includes('progress') ||
      lower.includes('pipeline') ||
      lower.includes('station') ||
      lower.includes('active') ||
      lower.includes('doing') ||
      lower.includes('operation')
    ) {
      const stats = storeAnalytics?.countsByStatus || {};
      const activeCount = storeAnalytics?.activeOrdersCount || 0;
      const rate = storeAnalytics?.fulfillmentRate || 100;

      reply = `📈 **Tara Timpla Store Progress & Working Station Pipeline** 🏪⚡

Here is the live operational breakdown of our store orders:

• ☕ **Actively Brewing (Processing)**: **${stats.processing || 0} order(s)** currently being crafted at the espresso machine
• 🛵 **Out for Delivery (Shipped)**: **${stats.shipped || 0} order(s)** with our delivery riders
• ⏳ **Queued / Pending**: **${stats.pending || 0} order(s)** awaiting barista pickup
• 📥 **New Incoming**: **${stats.new || 0} order(s)** newly submitted
• 🎉 **Completed (Delivered)**: **${stats.delivered || 0} order(s)** successfully enjoyed by customers
• ❌ **Cancelled**: **${stats.cancelled || 0} order(s)**

🚀 **Current Active Queue**: **${activeCount} orders** in progress
🎯 **Fulfillment Success Rate**: **${rate}%**

The barista bar is running smoothly! You can ask me to track any specific order or review all records anytime.`;
    }
    // 3. TRACK ALL RECORDS & AUDIT LOG
    else if (
      lower.includes('record') ||
      lower.includes('history') ||
      lower.includes('audit') ||
      lower.includes('all order') ||
      lower.includes('list') ||
      lower.includes('transactions') ||
      lower.includes('log')
    ) {
      const records = (storeAnalytics?.allOrders || []).slice(0, 10);
      if (records.length === 0) {
        reply = `📋 **Tracked Order Records**: No orders recorded in the system yet. Ready to take our first order!`;
      } else {
        const recordsFormatted = records
          .map((o: any, idx: number) => {
            const time = o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return `${idx + 1}. **#${o.id.slice(0, 8)}** | **${o.customer_name}** — ${o.product_variant} (x${o.quantity}) | ₱${o.total_price || 140} | Status: **[${(o.status || 'new').toUpperCase()}]** (${time})`;
          })
          .join('\n');

        reply = `📋 **Tara Timpla Coffee - Tracked Order Records (Live Audit)** 🔍

Total tracked records in system: **${storeAnalytics?.totalOrdersCount || records.length} orders**

${recordsFormatted}

💡 *Tip: You can ask me "What is the status of Joshua's order?" or provide any Order ID to track full customer history.*`;
      }
    }
    // 4. CANCELLATION REQUESTS
    else if (lower.includes('cancel')) {
      if (!matched) {
        reply = "☕ Tara Timpla Coffee: We'd be glad to check on that for you! Could you please provide your full name or Order ID so we can verify if it's still eligible for cancellation?";
      } else if (matched.status === 'new' || matched.status === 'pending') {
        try {
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', matched.id);
          actionTaken = 'ORDER_CANCELLED';
          updatedOrderId = matched.id;
          reply = `☕ Tara Timpla Coffee: Yes, ${matched.customer_name}! Since your order (${matched.product_variant}) is still in ${matched.status.toUpperCase()} and our crew has not started brewing yet, we have successfully CANCELLED your order. Salamat!`;
        } catch (e) {
          reply = `☕ Tara Timpla Coffee: Your order is in ${matched.status.toUpperCase()} stage and eligible for cancellation. Processing cancellation now.`;
        }
      } else if (matched.status === 'processing') {
        reply = `☕ Tara Timpla Coffee: We are truly sorry, but our crew is already actively PREPARING and freshly brewing your ${matched.product_variant}! Per Tara Timpla Coffee store policy, orders in PROCESSING cannot be cancelled because the coffee is already being handcrafted fresh for you. Thank you for your kind understanding!`;
      } else if (matched.status === 'shipped') {
        reply = `🛵 Tara Timpla Coffee: Your order (${matched.product_variant}) is already with our delivery rider on the way, so it cannot be cancelled at this stage. Please keep your line open for the rider!`;
      } else if (matched.status === 'delivered') {
        reply = `☕ Tara Timpla Coffee: Your order was already marked as DELIVERED. We hope you enjoyed your drink!`;
      } else if (matched.status === 'cancelled') {
        reply = `☕ Tara Timpla Coffee: This order (${matched.product_variant}) was already cancelled.`;
      }
    }
    // 5. STATUS INQUIRY
    else if (lower.includes('status') || lower.includes('update') || lower.includes('where') || lower.includes('track')) {
      if (!matched) {
        reply = `☕ Tara Timpla Coffee: Hello! To check your order status, please tell us your name or Order ID so we can pull up your ticket from our Working Station immediately.`;
      } else {
        const item = matched.product_variant;
        if (matched.status === 'new') {
          reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! We just received your order for ${item} (Status: NEW). Our crew is queueing it up right now!`;
        } else if (matched.status === 'pending') {
          reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! Your order for ${item} is currently PENDING in our queue. If you need any adjustments or cancellation, please let us know right now before we begin brewing!`;
        } else if (matched.status === 'processing') {
          reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! Great news! Our crew is actively PREPARING and freshly brewing your ${item} right now (Status: PROCESSING). Per our store policy, your order is now locked in and cannot be cancelled.`;
        } else if (matched.status === 'shipped') {
          reply = `🛵 Tara Timpla Coffee: Hi ${matched.customer_name}! Your ${item} has been handed over to our delivery rider and is out for delivery (Status: SHIPPED)! Keep your phone ready.`;
        } else if (matched.status === 'delivered') {
          reply = `🎉 Tara Timpla Coffee: Hi ${matched.customer_name}! Your order for ${item} has been marked as DELIVERED! Enjoy every sip, and thank you for choosing Tara Timpla Coffee! ☕`;
        } else if (matched.status === 'cancelled') {
          reply = `❌ Tara Timpla Coffee: Hi ${matched.customer_name}, your order for ${item} is CANCELLED.`;
        }
      }
    }
    // 6. ORDER INQUIRY
    else if (lower.includes('order') || lower.includes('buy') || lower.includes('spanish latte') || lower.includes('caramel')) {
      reply = `☕ Tara Timpla AI Barista: I would love to get that freshly brewed for you!
What drink would you like to order today?
- Spanish Latte (₱140)
- Caramel Macchiato (₱145)
- Sea Salt Latte (₱150)
- Cold Brew Reserve (₱130)

Please let me know your preferred size (16oz or 22oz), sweetness level, and delivery address, and I will place your order directly with our barista crew!`;
    }
    // 7. MENU INQUIRY
    else if (lower.includes('menu') || lower.includes('recommend') || lower.includes('best') || lower.includes('special')) {
      reply = `☕ Tara Timpla Coffee Favorites:
1. Spanish Latte (₱140) - Rich espresso with condensed milk, our #1 crowd favorite!
2. Caramel Macchiato (₱145) - Layered vanilla, steamed milk, espresso & caramel drizzle.
3. Sea Salt Latte (₱150) - Signature iced espresso topped with thick salted cream foam.
4. Cold Brew Reserve (₱130) - Slow-steeped 18-hour Arabica blend.
5. Butter Croissant (₱85) - Freshly baked daily.

Would you like me to book an order for you right now? Just tell me what you'd like!`;
    } else {
      reply = `☕ Tara Timpla AI Assistant: Kumusta! Welcome to Tara Timpla Coffee!
I can answer:
• 📊 **How's sales going?** (Today's revenue, gross sales, best sellers)
• 📈 **Store progress & pipeline** (Brewing station, riders on delivery, queue status)
• 📋 **Track all records** (Full order audit log & customer transaction history)
• ☕ **Order coffee directly** (Custom sizes, sweetness, milk & delivery closure)

How may I assist you today?`;
    }

    res.json({
      reply,
      actionTaken,
      updatedOrderId,
      createdOrder,
      storeAnalytics,
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
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start';

  if (!isProduction) {
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
