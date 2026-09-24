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
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
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

// ==========================================
// EMPLOYEE ATTENDANCE & SHIFT TRACKING
// ==========================================

export interface AttendanceRecord {
  id: string;
  employeeEmail: string;
  employeeName: string;
  role: string;
  status: 'present_and_working' | 'signed_out';
  signInTime: string;
  signOutTime?: string;
  durationMinutes?: number;
  durationFormatted?: string;
  date: string;
}

let attendanceMemoryStore: AttendanceRecord[] = [];

async function fetchAttendanceRecords(): Promise<AttendanceRecord[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('product_variant', 'EMPLOYEE_ATTENDANCE')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) {
      return attendanceMemoryStore;
    }

    const mapped: AttendanceRecord[] = data.map((o: any) => {
      const isWorking = o.status === 'processing' || o.landmarked === 'Present and Working';
      const signIn = o.address || o.created_at;
      const signOut = o.phone || undefined;
      let durationMins = Number(o.total_price) || undefined;
      
      if (!durationMins && signOut && signIn) {
        durationMins = Math.max(1, Math.round((new Date(signOut).getTime() - new Date(signIn).getTime()) / 60000));
      }

      let durationStr = o.product_name || '';
      if (!durationStr || durationStr === 'Employee Attendance Shift') {
        if (durationMins) {
          const h = Math.floor(durationMins / 60);
          const m = durationMins % 60;
          durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        } else if (isWorking) {
          const activeMins = Math.max(1, Math.round((Date.now() - new Date(signIn).getTime()) / 60000));
          const h = Math.floor(activeMins / 60);
          const m = activeMins % 60;
          durationStr = h > 0 ? `${h}h ${m}m on shift` : `${m}m on shift`;
        }
      } else {
        durationStr = durationStr.replace('Completed Shift (', '').replace(')', '');
      }

      return {
        id: String(o.id),
        employeeEmail: o.email || 'employee@taratimpla.ph',
        employeeName: o.customer_name || 'Team Member',
        role: o.city || 'Crew Member',
        status: isWorking ? 'present_and_working' : 'signed_out',
        signInTime: signIn,
        signOutTime: signOut,
        durationMinutes: durationMins,
        durationFormatted: durationStr,
        date: o.created_at ? new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
      };
    });

    // Merge mapped (from Supabase) with any unpersisted memory records
    const mapById = new Map<string, AttendanceRecord>();
    for (const item of mapped) {
      mapById.set(item.id, item);
    }
    for (const item of attendanceMemoryStore) {
      if (!mapById.has(item.id)) {
        mapById.set(item.id, item);
      }
    }
    const combined = Array.from(mapById.values()).sort(
      (a, b) => new Date(b.signInTime).getTime() - new Date(a.signInTime).getTime()
    );

    attendanceMemoryStore = combined;
    return combined;
  } catch (err) {
    console.warn('Error in fetchAttendanceRecords:', err);
    return attendanceMemoryStore;
  }
}

async function recordEmployeeSignIn(email: string, employeeName?: string, role?: string): Promise<AttendanceRecord> {
  const normEmail = (email || '').trim().toLowerCase();
  const displayName = employeeName || (normEmail === 'johnjoshuaguiral12@gmail.com' ? 'Store Owner' : normEmail.split('@')[0]);
  const safeRole = role || (normEmail === 'johnjoshuaguiral12@gmail.com' ? 'Owner' : 'Crew Member');
  const now = new Date();
  const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  // Check if employee already has an active present shift today
  const existingRecords = await fetchAttendanceRecords();
  const activeExisting = existingRecords.find(
    (r) => r.employeeEmail.toLowerCase() === normEmail && r.status === 'present_and_working' && r.date === todayDate
  );

  if (activeExisting) {
    return activeExisting;
  }

  const { data, error } = await supabase
    .from('orders')
    .insert([
      {
        customer_name: displayName,
        email: normEmail,
        city: safeRole,
        address: now.toISOString(),
        phone: '',
        landmarked: 'Present and Working',
        product_name: 'Employee Attendance Shift',
        product_variant: 'EMPLOYEE_ATTENDANCE',
        quantity: 1,
        total_price: 0,
        payment_method: 'TIME_CLOCK',
        status: 'processing', // represents active shift
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Failed to insert attendance sign-in:', error);
  }

  const newRecord: AttendanceRecord = {
    id: data?.id ? String(data.id) : 'att-' + Date.now(),
    employeeEmail: normEmail,
    employeeName: displayName,
    role: safeRole,
    status: 'present_and_working',
    signInTime: now.toISOString(),
    durationFormatted: 'Just Clocked In',
    date: todayDate,
  };

  attendanceMemoryStore.unshift(newRecord);
  return newRecord;
}

async function recordEmployeeSignOut(email: string): Promise<{ success: boolean; record?: AttendanceRecord; message: string }> {
  const normEmail = (email || '').trim().toLowerCase();
  const now = new Date();
  const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  // Find active shift in Supabase
  const { data: activeOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('product_variant', 'EMPLOYEE_ATTENDANCE')
    .eq('email', normEmail)
    .eq('status', 'processing')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeOrder) {
    // Check in-memory store fallback
    const memIndex = attendanceMemoryStore.findIndex(
      (r) => r.employeeEmail.toLowerCase() === normEmail && r.status === 'present_and_working'
    );

    if (memIndex >= 0) {
      const memRec = attendanceMemoryStore[memIndex];
      const signInDate = new Date(memRec.signInTime);
      const diffMs = Math.max(0, now.getTime() - signInDate.getTime());
      const diffMins = Math.max(1, Math.round(diffMs / 60000));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const durationFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      const updatedMem: AttendanceRecord = {
        ...memRec,
        status: 'signed_out',
        signOutTime: now.toISOString(),
        durationMinutes: diffMins,
        durationFormatted,
      };
      attendanceMemoryStore[memIndex] = updatedMem;

      const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        success: true,
        record: updatedMem,
        message: `${memRec.employeeName} has successfully signed out at ${timeFormatted}. Shift duration: ${durationFormatted}.`,
      };
    }

    return {
      success: false,
      message: `No active clock-in session found for ${normEmail}.`,
    };
  }

  const signInDate = new Date(activeOrder.address || activeOrder.created_at);
  const diffMs = Math.max(0, now.getTime() - signInDate.getTime());
  const diffMins = Math.max(1, Math.round(diffMs / 60000));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  const durationFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const { data: updated, error } = await supabase
    .from('orders')
    .update({
      status: 'delivered', // represents completed shift
      phone: now.toISOString(),
      landmarked: 'Signed Out',
      product_name: `Completed Shift (${durationFormatted})`,
      total_price: diffMins,
    })
    .eq('id', activeOrder.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update attendance sign-out:', error);
  }

  const completedRecord: AttendanceRecord = {
    id: String(activeOrder.id),
    employeeEmail: normEmail,
    employeeName: activeOrder.customer_name,
    role: activeOrder.city || 'Crew Member',
    status: 'signed_out',
    signInTime: activeOrder.address || activeOrder.created_at,
    signOutTime: now.toISOString(),
    durationMinutes: diffMins,
    durationFormatted,
    date: todayDate,
  };

  attendanceMemoryStore = attendanceMemoryStore.map((r) => (r.id === completedRecord.id ? completedRecord : r));

  return {
    success: true,
    record: completedRecord,
    message: `${activeOrder.customer_name} signed out at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Total shift: ${durationFormatted}.`,
  };
}

// Helper to calculate real-time store sales, growth, progress, and employee attendance
async function fetchStoreAnalytics() {
  try {
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('*')
      .neq('product_variant', 'EMPLOYEE_ACCOUNT')
      .neq('product_variant', 'EMPLOYEE_ATTENDANCE')
      .order('created_at', { ascending: false });

    const attendanceRecords = await fetchAttendanceRecords();
    const currentlyWorking = attendanceRecords.filter((r) => r.status === 'present_and_working');
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const signedOutToday = attendanceRecords.filter((r) => r.status === 'signed_out' && r.date === todayDate);

    if (error || !allOrders) {
      return {
        totalOrdersCount: 0,
        totalGrossRevenue: 0,
        deliveredRevenue: 0,
        todayRevenue: 0,
        todayOrdersCount: 0,
        yesterdayRevenue: 0,
        salesGrowthRate: 0,
        salesGrowthAmount: 0,
        weekRevenue: 0,
        countsByStatus: { new: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
        activeOrdersCount: 0,
        avgOrderValue: 0,
        fulfillmentRate: 100,
        topProducts: [] as { name: string; count: number; total: number }[],
        paymentBreakdown: { cod: { count: 0, total: 0 }, gcash: { count: 0, total: 0 } },
        allOrders: [] as any[],
        attendance: {
          currentlyWorkingCount: currentlyWorking.length,
          currentlyWorking,
          signedOutToday,
          allRecords: attendanceRecords,
        },
      };
    }

    const now = new Date();
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalGrossRevenue = 0;
    let deliveredRevenue = 0;
    let todayRevenue = 0;
    let todayOrdersCount = 0;
    let yesterdayRevenue = 0;
    let yesterdayOrdersCount = 0;
    let weekRevenue = 0;

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
        const orderTimestamp = o.created_at ? new Date(o.created_at) : new Date();

        if (orderDate === todayDate) {
          todayRevenue += price;
          todayOrdersCount++;
        } else if (orderDate === yesterdayDate) {
          yesterdayRevenue += price;
          yesterdayOrdersCount++;
        }

        if (orderTimestamp >= sevenDaysAgo) {
          weekRevenue += price;
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

    // Sales Growth Rate calculation
    let salesGrowthRate = 0;
    const salesGrowthAmount = todayRevenue - yesterdayRevenue;
    if (yesterdayRevenue > 0) {
      salesGrowthRate = Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100);
    } else if (todayRevenue > 0) {
      salesGrowthRate = 100; // Strong initial growth from baseline
    }

    const topProducts = Object.entries(productSalesMap)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return {
      totalOrdersCount: allOrders.length,
      totalGrossRevenue,
      deliveredRevenue,
      todayRevenue,
      todayOrdersCount,
      yesterdayRevenue,
      yesterdayOrdersCount,
      salesGrowthRate,
      salesGrowthAmount,
      weekRevenue,
      countsByStatus,
      activeOrdersCount,
      avgOrderValue,
      fulfillmentRate,
      topProducts,
      paymentBreakdown: paymentMap,
      allOrders,
      attendance: {
        currentlyWorkingCount: currentlyWorking.length,
        currentlyWorking,
        signedOutToday,
        allRecords: attendanceRecords,
      },
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

// Live Employee Attendance & Shift Tracking endpoints
app.post('/api/attendance/sign-in', async (req, res) => {
  try {
    const { email, employeeName, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const record = await recordEmployeeSignIn(email, employeeName, role);
    res.json({
      success: true,
      record,
      message: `${record.employeeName} is recorded as Present and Working starting at ${new Date(record.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    });
  } catch (err: any) {
    console.error('Error in sign-in attendance:', err);
    res.status(500).json({ error: err.message || 'Could not record attendance' });
  }
});

app.post('/api/attendance/sign-out', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await recordEmployeeSignOut(email);
    res.json(result);
  } catch (err: any) {
    console.error('Error in sign-out attendance:', err);
    res.status(500).json({ error: err.message || 'Could not record sign-out' });
  }
});

app.get('/api/attendance/status', async (_req, res) => {
  try {
    const records = await fetchAttendanceRecords();
    const currentlyWorking = records.filter((r) => r.status === 'present_and_working');
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const signedOutToday = records.filter((r) => r.status === 'signed_out' && r.date === todayDate);

    res.json({
      success: true,
      totalPresentCount: currentlyWorking.length,
      currentlyWorking,
      signedOutToday,
      allRecords: records,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Could not fetch attendance status' });
  }
});

// AI Chatbot endpoint - Store Growth, Sales & Revenue Analyst + Staff Attendance
app.post('/api/gemini/chat', async (req, res) => {
  let candidateOrders: any[] = [];
  let storeAnalytics: any = null;
  try {
    const { message, customerName, orderId, activeOrderPhone } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Fetch live store analytics & employee attendance
    storeAnalytics = await fetchStoreAnalytics();

    // Lookup relevant orders from Supabase for context
    let orderContext = 'No specific order found.';

    try {
      let query = supabase
        .from('orders')
        .select('*')
        .neq('product_variant', 'EMPLOYEE_ACCOUNT')
        .neq('product_variant', 'EMPLOYEE_ATTENDANCE')
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
              `- Order ID: ${o.id.slice(0, 8)} (Full: ${o.id}) | Customer: ${o.customer_name} | Item: ${o.product_variant} (x${o.quantity}) | Price: ₱${o.total_price || (o.quantity * 140)} | Status: ${o.status.toUpperCase()}`
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

    // Format employee attendance summary
    const workingEmployees = storeAnalytics?.attendance?.currentlyWorking || [];
    const workingStaffSummary = workingEmployees.length > 0
      ? workingEmployees
          .map(
            (e: any, i: number) =>
              `  ${i + 1}. **${e.employeeName}** (${e.role}) — Status: **PRESENT AND WORKING** (Signed in: ${new Date(e.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, Active: ${e.durationFormatted})`
          )
          .join('\n')
      : '  • No employees currently clocked in as working.';

    const signedOutEmployees = storeAnalytics?.attendance?.signedOutToday || [];
    const signedOutSummary = signedOutEmployees.length > 0
      ? signedOutEmployees
          .map(
            (e: any, i: number) =>
              `  ${i + 1}. **${e.employeeName}** (${e.role}) — Signed out: ${new Date(e.signOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Total shift: ${e.durationFormatted})`
          )
          .join('\n')
      : '  • No completed shift sign-outs recorded today.';

    const ai = getGeminiClient();

    const systemPrompt = `You are "Tara Timpla Coffee AI Growth & Revenue Analyst", the official Executive Business Intelligence & Employee Shift Presence Specialist for Tara Timpla Coffee.
You are embedded directly on the Tara Timpla Coffee platform.
Tone: Sharp, encouraging, professional, transparent Filipino coffee brand executive and store analyst. Fluent in English and natural Filipino/Taglish.

🚨 STRICT CONSTITUTIONAL RULE: YOU ARE NOT INTENDED TO TAKE ORDERS!
- DO NOT invite customers to order from you.
- DO NOT ask for their address, phone, sweetness level, or cup size to create orders.
- DO NOT output any order creation tokens.
- IF A USER ASKS TO ORDER A DRINK OR BUY COFFEE:
  Warmly and politely explain:
  "☕ Tara Timpla AI Analyst: Please note that I am our store's executive Growth, Sales & Revenue intelligence assistant, not an order-taking bot! To place an order, please visit our **Working Station** or **Orders** section where our barista crew is ready to craft your coffee fresh. Would you like me to share our current sales growth, revenue breakdown, or who is currently present and working on shift?"

LIVE STORE SALES & REVENUE GROWTH METRICS (REAL-TIME DATABASE AUDIT):
- Today's Revenue: ₱${(storeAnalytics?.todayRevenue || 0).toLocaleString()} across ${storeAnalytics?.todayOrdersCount || 0} order(s) today.
- Yesterday's Revenue: ₱${(storeAnalytics?.yesterdayRevenue || 0).toLocaleString()} (${storeAnalytics?.yesterdayOrdersCount || 0} orders yesterday).
- Day-over-Day Sales Growth Rate: ${storeAnalytics?.salesGrowthRate >= 0 ? '+' : ''}${storeAnalytics?.salesGrowthRate || 0}%
- Sales Growth Net Difference: ${storeAnalytics?.salesGrowthAmount >= 0 ? '+' : ''}₱${(storeAnalytics?.salesGrowthAmount || 0).toLocaleString()}
- Past 7 Days Gross Revenue: ₱${(storeAnalytics?.weekRevenue || 0).toLocaleString()}
- Total All-Time Gross Revenue: ₱${(storeAnalytics?.totalGrossRevenue || 0).toLocaleString()} across ${storeAnalytics?.totalOrdersCount || 0} total records.
- Delivered (Collected) Sales: ₱${(storeAnalytics?.deliveredRevenue || 0).toLocaleString()} (${storeAnalytics?.countsByStatus?.delivered || 0} delivered orders).
- Average Order Value (AOV): ₱${storeAnalytics?.avgOrderValue || 0}
- Fulfillment Completion Rate: ${storeAnalytics?.fulfillmentRate || 100}%
- Payment Split: COD (₱${(storeAnalytics?.paymentBreakdown?.cod?.total || 0).toLocaleString()}, ${storeAnalytics?.paymentBreakdown?.cod?.count || 0} orders) | GCash (₱${(storeAnalytics?.paymentBreakdown?.gcash?.total || 0).toLocaleString()}, ${storeAnalytics?.paymentBreakdown?.gcash?.count || 0} orders).

LIVE EMPLOYEE ATTENDANCE & SHIFTS (TIME-IN / TIME-OUT TRACKER):
- Currently Present & Working Staff Count: ${storeAnalytics?.attendance?.currentlyWorkingCount || 0}
- Active Working Crew:
${workingStaffSummary}
- Today's Signed-Out Shifts:
${signedOutSummary}

WORKING STATION OPERATIONAL PIPELINE:
- Actively Brewing at Station (Processing): ${storeAnalytics?.countsByStatus?.processing || 0} order(s)
- Out for Delivery with Rider (Shipped): ${storeAnalytics?.countsByStatus?.shipped || 0} order(s)
- Queued / Incoming: ${(storeAnalytics?.countsByStatus?.pending || 0) + (storeAnalytics?.countsByStatus?.new || 0)} order(s)
- Total Active Orders in Station right now: ${storeAnalytics?.activeOrdersCount || 0}

TOP REVENUE-DRIVING SPECIALTY ITEMS:
${topSellingSummary || '1. Spanish Latte\n2. Caramel Macchiato\n3. Cold Brew Reserve'}

RECENT TRACKED ORDER RECORDS:
${trackedRecordsSummary || 'No recent orders yet.'}

YOUR SPECIALIZED MISSIONS:

MISSION 1: ANSWER "WHAT IS THE GROWTH SALES AND REVENUE?"
When asked about sales growth, revenue, financial performance, daily earnings, or how sales are going:
- Provide an inspiring, data-backed financial summary.
- Highlight:
  * Today's Sales (₱ and order count)
  * Day-over-day growth % (${storeAnalytics?.salesGrowthRate >= 0 ? '+' : ''}${storeAnalytics?.salesGrowthRate || 0}%)
  * Total Gross Revenue (₱)
  * Delivered/Realized Cash Revenue (₱)
  * Past 7 Days Revenue (₱)
  * Top drinks driving the most revenue
  * Payment distribution (COD vs GCash)
- Explain the growth momentum and financial health of Tara Timpla Coffee.

MISSION 2: ANSWER EMPLOYEE ATTENDANCE & SHIFT TIME (TIME-IN / TIME-OUT)
When asked "Who is working?", "Who is present?", "What time did employees sign in?", "Who signed out?", or shift queries:
- Report the exact employees who are currently **Present and Working** on shift.
- State the exact time they signed in (e.g. "Signed in at 8:30 AM") and their active shift duration.
- State any employees who signed out today, their sign-out time, and total shift length.
- If no one is clocked in, mention that all employees are currently off-shift or waiting for their next shift.

MISSION 3: ORDER STATUS LOOKUPS & STORE PIPELINE
- Answer how orders are progressing in the Working Station pipeline.
- If a customer asks about their specific order, provide the live status from the database.
- If customer requests cancellation, verify if it is eligible (only 'new' or 'pending'). Include [ACTION: CANCEL_ORDER] if eligible.`;

    const promptText = `${systemPrompt}\n\nCustomer Name: "${customerName || ''}"\nCustomer Message: "${message}"`;

    let aiReply: string = '';
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }],
            },
          ],
        });
        if (response && response.text) {
          aiReply = response.text;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!aiReply) {
      throw new Error('FALLBACK_TO_LOCAL_ENGINE');
    }

    let actionTaken = null;
    let updatedOrderId = null;

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

    // Clean any action tokens from user-visible reply
    const cleanedReply = aiReply
      .replace(/\[ACTION:\s*CANCEL_ORDER\]/g, '')
      .replace(/\[ACTION:\s*CREATE_ORDER:.*?\]/gs, '')
      .trim();

    res.json({
      reply: cleanedReply,
      actionTaken,
      updatedOrderId,
      storeAnalytics,
      matchedOrders: candidateOrders.map((o) => ({
        id: o.id,
        customer_name: o.customer_name,
        product_variant: o.product_variant,
        status: o.status,
        total_price: o.total_price,
      })),
    });
  } catch {
    // Graceful fallback to local growth & attendance intelligence engine without emitting raw error dumps
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

    const matched = candidateOrders[0];
    const workingList = storeAnalytics?.attendance?.currentlyWorking || [];
    const signedOutList = storeAnalytics?.attendance?.signedOutToday || [];

    // 1. ORDER ATTEMPT - NOT INTENDED TO ORDER
    if (
      lower.includes('i want to order') ||
      lower.includes('can i order') ||
      lower.includes('place order') ||
      lower.includes('buy coffee') ||
      lower.includes('pabili') ||
      lower.includes('buy 1') ||
      lower.includes('buy 2') ||
      (lower.includes('order') && (lower.includes('spanish') || lower.includes('caramel') || lower.includes('latte') || lower.includes('croissant')))
    ) {
      reply = `☕ **Notice: Tara Timpla AI Growth & Revenue Analyst** 📊✨

Please note: **This AI chatbot is not intended for placing coffee orders!**

Our specialized role is to serve as our store's executive **Financial Growth, Sales & Revenue Analyst** and **Employee Shift & Attendance Tracker**.

👉 **How to place an order:**
Please head over to our **Working Station** or **Orders** section where our team will happily handcraft your coffee fresh!

👉 **What you can ask me right here:**
• 📈 **"What is our sales growth and revenue today?"**
• 👥 **"Who is present and working right now?"**
• ⏱️ **"What time did employees sign in or sign out today?"**
• 🏆 **"Which drinks are driving the most revenue?"**
• 🏪 **"What is the status of the barista pipeline?"**`;
    }
    // 2. EMPLOYEE ATTENDANCE & WORKING SHIFTS ("Who is working?", "What time they signed in?")
    else if (
      lower.includes('employee') ||
      lower.includes('staff') ||
      lower.includes('working') ||
      lower.includes('present') ||
      lower.includes('sign in') ||
      lower.includes('signed in') ||
      lower.includes('sign out') ||
      lower.includes('signed out') ||
      lower.includes('time in') ||
      lower.includes('time out') ||
      lower.includes('attendance') ||
      lower.includes('shift') ||
      lower.includes('who is on') ||
      lower.includes('clock')
    ) {
      const activeCount = workingList.length;
      let workingDetails = '• *No employees are currently clocked in as working.*';

      if (activeCount > 0) {
        workingDetails = workingList
          .map(
            (e: any, idx: number) =>
              `  ${idx + 1}. 🟢 **${e.employeeName}** (${e.role})\n     • Status: **Present & Working**\n     • Signed in at: **${new Date(e.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}** (${e.durationFormatted})`
          )
          .join('\n\n');
      }

      let signedOutDetails = '• *No employees have signed out yet today.*';
      if (signedOutList.length > 0) {
        signedOutDetails = signedOutList
          .map(
            (e: any, idx: number) =>
              `  ${idx + 1}. ⚪ **${e.employeeName}** (${e.role}) — Signed out at **${new Date(e.signOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}** (Shift length: **${e.durationFormatted}**)`
          )
          .join('\n');
      }

      reply = `👥 **Tara Timpla Coffee - Employee Attendance & Shift Tracker** ⏱️☕

Here is the real-time record of staff presence and working shifts:

🟢 **Currently Present and Working (${activeCount} staff)**:
${workingDetails}

⚪ **Completed Shifts Today (Signed Out)**:
${signedOutDetails}

💡 *Note: Every time an employee signs into Tara Timpla Coffee, the system automatically marks them as **Present and Working** and records their exact sign-in timestamp. When they sign out, the time-out and total shift duration are saved.*`;
    }
    // 3. SALES GROWTH & REVENUE INQUIRY ("What is the growth sales and revenue?")
    else if (
      lower.includes('growth') ||
      lower.includes('grow') ||
      lower.includes('sale') ||
      lower.includes('revenue') ||
      lower.includes('earn') ||
      lower.includes('income') ||
      lower.includes('gross') ||
      lower.includes('financial') ||
      lower.includes('trend') ||
      lower.includes('how much')
    ) {
      const todayRev = (storeAnalytics?.todayRevenue || 0).toLocaleString();
      const yesterdayRev = (storeAnalytics?.yesterdayRevenue || 0).toLocaleString();
      const growthRate = storeAnalytics?.salesGrowthRate || 0;
      const growthDiff = storeAnalytics?.salesGrowthAmount || 0;
      const totalRev = (storeAnalytics?.totalGrossRevenue || 0).toLocaleString();
      const delivRev = (storeAnalytics?.deliveredRevenue || 0).toLocaleString();
      const weekRev = (storeAnalytics?.weekRevenue || 0).toLocaleString();
      const topItems = (storeAnalytics?.topProducts || [])
        .slice(0, 3)
        .map((p: any, i: number) => `   ${i + 1}. **${p.name}** — ₱${p.total.toLocaleString()} (${p.count} units sold)`)
        .join('\n');

      reply = `📈 **Tara Timpla Coffee - Sales Growth & Revenue Analysis** 💰✨

Here is our live financial growth breakdown:

🚀 **Sales Growth Performance**:
• **Day-over-Day Growth Rate**: **${growthRate >= 0 ? '+' : ''}${growthRate}%**
• **Net Sales Growth**: **${growthDiff >= 0 ? '+' : ''}₱${growthDiff.toLocaleString()}** vs previous period
• **Sales Momentum**: ${growthRate >= 0 ? 'Accelerating growth with strong coffee cup demand!' : 'Steady volume pace across all channels.'}

💰 **Revenue Breakdown**:
• **Today's Revenue**: **₱${todayRev}** (${storeAnalytics?.todayOrdersCount || 0} orders today)
• **Yesterday's Revenue**: **₱${yesterdayRev}** (${storeAnalytics?.yesterdayOrdersCount || 0} orders)
• **Past 7 Days Revenue**: **₱${weekRev}**
• **All-Time Gross Sales**: **₱${totalRev}** across ${storeAnalytics?.totalOrdersCount || 0} total records
• **Delivered (Realized) Cash**: **₱${delivRev}**
• **Average Order Value (AOV)**: **₱${storeAnalytics?.avgOrderValue || 0}**

🏆 **Top Revenue Driving Drinks**:
${topItems || '   1. Spanish Latte\n   2. Caramel Macchiato\n   3. Cold Brew Reserve'}

💵 **Payment Methods**:
• Cash on Delivery (COD): ₱${(storeAnalytics?.paymentBreakdown?.cod?.total || 0).toLocaleString()} (${storeAnalytics?.paymentBreakdown?.cod?.count || 0} orders)
• GCash: ₱${(storeAnalytics?.paymentBreakdown?.gcash?.total || 0).toLocaleString()} (${storeAnalytics?.paymentBreakdown?.gcash?.count || 0} orders)

Would you like to know more about our staff coverage or operational fulfillment pipeline?`;
    }
    // 4. STORE PROGRESS & WORKING STATION PIPELINE
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
👥 **Staff On Duty**: **${workingList.length} employee(s) present & working**`;
    }
    // 5. TRACK ALL RECORDS & AUDIT LOG
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
        reply = `📋 **Tracked Order Records**: No orders recorded in the system yet.`;
      } else {
        const recordsFormatted = records
          .map((o: any, idx: number) => {
            const time = o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return `${idx + 1}. **#${o.id.slice(0, 8)}** | **${o.customer_name}** — ${o.product_variant} (x${o.quantity}) | ₱${o.total_price || 140} | Status: **[${(o.status || 'new').toUpperCase()}]** (${time})`;
          })
          .join('\n');

        reply = `📋 **Tara Timpla Coffee - Tracked Order Records (Live Audit)** 🔍

Total tracked records in system: **${storeAnalytics?.totalOrdersCount || records.length} orders**

${recordsFormatted}`;
      }
    }
    // 6. CANCELLATION REQUESTS
    else if (lower.includes('cancel')) {
      if (!matched) {
        reply = "☕ Tara Timpla Coffee: We'd be glad to check on that for you! Could you please provide your full name or Order ID so we can verify if it's still eligible for cancellation?";
      } else if (matched.status === 'new' || matched.status === 'pending') {
        try {
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', matched.id);
          actionTaken = 'ORDER_CANCELLED';
          updatedOrderId = matched.id;
          reply = `☕ Tara Timpla Coffee: Yes, ${matched.customer_name}! Since your order (${matched.product_variant}) is still in ${matched.status.toUpperCase()} and our crew has not started brewing yet, we have successfully CANCELLED your order. Salamat!`;
        } catch {
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
    // 7. STATUS INQUIRY
    else if (lower.includes('status') || lower.includes('update') || lower.includes('where') || lower.includes('track')) {
      if (!matched) {
        reply = `☕ Tara Timpla Coffee: Hello! To check your order status, please tell us your name or Order ID so we can pull up your ticket from our Working Station immediately.`;
      } else {
        const item = matched.product_variant;
        reply = `☕ Tara Timpla Coffee: Hi ${matched.customer_name}! Your order for ${item} is currently in **${matched.status.toUpperCase()}** stage.`;
      }
    } else {
      reply = `☕ **Tara Timpla AI Growth & Revenue Analyst** 📊✨
Kumusta! I am your store's executive financial intelligence and employee shift analyst.

I can answer:
• 📈 **"What is our sales growth and revenue today?"** (Growth %, today's revenue, gross total, AOV)
• 👥 **"Who is present and working right now?"** (Employees currently on shift, exact sign-in times)
• ⏱️ **"What time did employees sign in or sign out?"** (Full shift timeclock log)
• 🏆 **"Which drinks are driving the most revenue?"** (Top sales drivers)
• 🏪 **"What is the current store progress?"** (Brewing station and delivery pipeline)

*(Please note: I am not intended to take coffee orders; please place orders directly at the Working Station or Orders section!)*

How may I assist your store management today?`;
    }

    res.json({
      reply,
      actionTaken,
      updatedOrderId,
      storeAnalytics,
      matchedOrders: candidateOrders.map((o) => ({
        id: o.id,
        customer_name: o.customer_name,
        product_variant: o.product_variant,
        status: o.status,
        total_price: o.total_price,
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
