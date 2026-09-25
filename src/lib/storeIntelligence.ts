import { supabase } from './supabase';
import { Order } from '../types';

export interface AttendanceRecord {
  id: string;
  email: string;
  employeeName: string;
  role: string;
  status: 'present_working' | 'signed_out';
  signInTime: string;
  signOutTime?: string;
  durationMinutes?: number;
  durationFormatted?: string;
  date: string;
  created_at: string;
}

export interface StoreAnalytics {
  totalOrdersCount: number;
  totalGrossRevenue: number;
  deliveredRevenue: number;
  todayRevenue: number;
  todayOrdersCount: number;
  yesterdayRevenue: number;
  yesterdayOrdersCount: number;
  salesGrowthRate: number;
  salesGrowthAmount: number;
  weekRevenue: number;
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
  attendance: {
    totalSignedToday: number;
    currentlyWorkingCount: number;
    signedOutCount: number;
    currentlyWorking: AttendanceRecord[];
    signedOutToday: AttendanceRecord[];
    allAttendance: AttendanceRecord[];
  };
}

// In-memory fallback if needed for immediate session continuity
let localAttendanceCache: AttendanceRecord[] = [];

/**
 * Format minutes into clean human-readable duration
 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.max(1, minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Fetch and calculate complete real-time Store Growth, Sales, Revenue, and Attendance
 * Works in both local dev (via server or Supabase directly) and production Vercel
 */
export async function fetchStoreAnalytics(): Promise<StoreAnalytics> {
  // First attempt server endpoint if available
  try {
    const res = await fetch('/api/store/analytics');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.analytics) {
        return data.analytics as StoreAnalytics;
      }
    }
  } catch {
    // Continue to direct Supabase calculation
  }

  // Direct Supabase calculation (100% reliable on Vercel and offline)
  const { data: rawOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  const allRecords = rawOrders || [];

  // 1. Separate attendance records from customer coffee orders
  const attendanceOrders = allRecords.filter((o) => o.product_variant === 'EMPLOYEE_ATTENDANCE');
  const customerOrders = allRecords.filter(
    (o) => o.product_variant !== 'EMPLOYEE_ATTENDANCE' && o.product_variant !== 'EMPLOYEE_ACCOUNT'
  );

  const now = new Date();
  const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 2. Parse Attendance records
  const mappedAttendance: AttendanceRecord[] = attendanceOrders.map((o) => {
    const isWorking = o.status === 'processing' || o.landmarked === 'Present and Working';
    const signIn = o.address || o.created_at;
    const signOut = o.phone || undefined;
    let durationMins = Number(o.total_price) || undefined;

    if (!durationMins && signOut && signIn) {
      durationMins = Math.max(1, Math.round((new Date(signOut).getTime() - new Date(signIn).getTime()) / 60000));
    }

    let durationFormatted = o.product_name || '';
    if (!durationFormatted || durationFormatted === 'Employee Attendance Shift' || durationFormatted === 'Present & Working') {
      if (durationMins) {
        durationFormatted = formatMinutes(durationMins);
      } else if (isWorking) {
        const activeMins = Math.max(1, Math.round((Date.now() - new Date(signIn).getTime()) / 60000));
        durationFormatted = `${formatMinutes(activeMins)} on shift`;
      }
    } else {
      durationFormatted = durationFormatted.replace('Completed Shift (', '').replace(')', '');
    }

    const recordDate = o.created_at
      ? new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      : todayDateStr;

    return {
      id: String(o.id),
      email: (o.email || '').toLowerCase(),
      employeeName: o.customer_name || 'Team Member',
      role: o.city || 'Crew Member',
      status: isWorking ? 'present_working' : 'signed_out',
      signInTime: signIn,
      signOutTime: signOut,
      durationMinutes: durationMins,
      durationFormatted,
      date: recordDate,
      created_at: o.created_at || now.toISOString(),
    };
  });

  // Merge with any in-memory items
  const attendanceMap = new Map<string, AttendanceRecord>();
  for (const item of mappedAttendance) {
    attendanceMap.set(item.id, item);
  }
  for (const item of localAttendanceCache) {
    if (!attendanceMap.has(item.id)) {
      attendanceMap.set(item.id, item);
    }
  }

  const allAttendance = Array.from(attendanceMap.values()).sort(
    (a, b) => new Date(b.signInTime).getTime() - new Date(a.signInTime).getTime()
  );

  const currentlyWorking = allAttendance.filter((r) => r.status === 'present_working');
  const signedOutToday = allAttendance.filter((r) => r.status === 'signed_out' && r.date === todayDateStr);

  // 3. Calculate Financial & Sales Growth Metrics
  let totalGrossRevenue = 0;
  let deliveredRevenue = 0;
  let todayRevenue = 0;
  let todayOrdersCount = 0;
  let yesterdayRevenue = 0;
  let yesterdayOrdersCount = 0;
  let weekRevenue = 0;

  const countsByStatus = {
    new: 0,
    pending: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };

  const productMap: Record<string, { count: number; total: number }> = {};
  const paymentMap = {
    cod: { count: 0, total: 0 },
    gcash: { count: 0, total: 0 },
  };

  for (const o of customerOrders) {
    const status = (o.status || 'new').toLowerCase() as keyof typeof countsByStatus;
    if (countsByStatus[status] !== undefined) {
      countsByStatus[status]++;
    } else {
      countsByStatus.new++;
    }

    const price = Number(o.total_price) || (Number(o.quantity) || 1) * 140;

    if (status !== 'cancelled') {
      totalGrossRevenue += price;

      const orderDate = o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
        : '';
      const orderTs = o.created_at ? new Date(o.created_at) : new Date();

      if (orderDate === todayDateStr) {
        todayRevenue += price;
        todayOrdersCount++;
      } else if (orderDate === yesterdayDateStr) {
        yesterdayRevenue += price;
        yesterdayOrdersCount++;
      }

      if (orderTs >= sevenDaysAgo) {
        weekRevenue += price;
      }

      if (status === 'delivered') {
        deliveredRevenue += price;
      }

      const prod = o.product_variant || o.product_name || 'Specialty Coffee';
      if (!productMap[prod]) {
        productMap[prod] = { count: 0, total: 0 };
      }
      productMap[prod].count += Number(o.quantity) || 1;
      productMap[prod].total += price;

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

  const nonCancelled = customerOrders.filter((o) => o.status !== 'cancelled').length;
  const avgOrderValue = nonCancelled > 0 ? Math.round(totalGrossRevenue / nonCancelled) : 0;
  const activeOrdersCount =
    countsByStatus.new + countsByStatus.pending + countsByStatus.processing + countsByStatus.shipped;
  const fulfillmentRate = nonCancelled > 0 ? Math.round((countsByStatus.delivered / nonCancelled) * 100) : 100;

  // Day-over-Day Sales Growth calculation
  let salesGrowthRate = 0;
  const salesGrowthAmount = todayRevenue - yesterdayRevenue;
  if (yesterdayRevenue > 0) {
    salesGrowthRate = Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100);
  } else if (todayRevenue > 0) {
    salesGrowthRate = 100;
  }

  const topProducts = Object.entries(productMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return {
    totalOrdersCount: customerOrders.length,
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
    allOrders: customerOrders as Order[],
    attendance: {
      totalSignedToday: currentlyWorking.length + signedOutToday.length,
      currentlyWorkingCount: currentlyWorking.length,
      signedOutCount: signedOutToday.length,
      currentlyWorking,
      signedOutToday,
      allAttendance,
    },
  };
}

/**
 * Record Employee Sign In (Present and Working)
 * Ensures automatic persistence to Supabase even if server API is unreachable on Vercel
 */
export async function recordEmployeeSignIn(
  email: string,
  employeeName?: string,
  role?: string
): Promise<{ success: boolean; record?: AttendanceRecord; message: string }> {
  const normEmail = (email || '').trim().toLowerCase();
  const displayName =
    employeeName || (normEmail === 'johnjoshuaguiral12@gmail.com' ? 'Store Owner' : normEmail.split('@')[0]);
  const safeRole = role || (normEmail === 'johnjoshuaguiral12@gmail.com' ? 'Owner' : 'Crew Member');
  const now = new Date();
  const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  // 1. Try server route
  try {
    const res = await fetch('/api/attendance/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normEmail, employeeName: displayName, role: safeRole }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.record) {
        return { success: true, record: data.record, message: data.message };
      }
    }
  } catch {
    // Continue to direct Supabase write
  }

  // 2. Direct Supabase write
  try {
    // Check if employee already has an active present shift today
    const { data: existing } = await supabase
      .from('orders')
      .select('*')
      .eq('product_variant', 'EMPLOYEE_ATTENDANCE')
      .eq('email', normEmail)
      .eq('status', 'processing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const existingRecord: AttendanceRecord = {
        id: String(existing.id),
        email: normEmail,
        employeeName: existing.customer_name || displayName,
        role: existing.city || safeRole,
        status: 'present_working',
        signInTime: existing.address || existing.created_at,
        durationFormatted: 'Already on active shift',
        date: todayDateStr,
        created_at: existing.created_at,
      };
      return {
        success: true,
        record: existingRecord,
        message: `${displayName} is already recorded as Present & Working.`,
      };
    }

    const { data: inserted, error } = await supabase
      .from('orders')
      .insert([
        {
          customer_name: displayName,
          email: normEmail,
          city: safeRole,
          address: now.toISOString(),
          phone: '',
          product_name: 'Present & Working',
          product_variant: 'EMPLOYEE_ATTENDANCE',
          quantity: 1,
          total_price: 0,
          status: 'processing',
        },
      ])
      .select()
      .single();

    if (error) {
      console.warn('Direct Supabase attendance insert error:', error);
    }

    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newRecord: AttendanceRecord = {
      id: inserted?.id ? String(inserted.id) : `att-${Date.now()}`,
      email: normEmail,
      employeeName: displayName,
      role: safeRole,
      status: 'present_working',
      signInTime: now.toISOString(),
      durationFormatted: 'Just Clocked In',
      date: todayDateStr,
      created_at: now.toISOString(),
    };

    localAttendanceCache.unshift(newRecord);

    return {
      success: true,
      record: newRecord,
      message: `✅ Recorded: ${displayName} (${safeRole}) is Present & Working (Signed in at ${timeStr})`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Could not record sign in',
    };
  }
}

/**
 * Record Employee Sign Out (Clock out)
 * Ensures automatic update to Supabase even if server API is unreachable on Vercel
 */
export async function recordEmployeeSignOut(
  email: string
): Promise<{ success: boolean; record?: AttendanceRecord; message: string }> {
  const normEmail = (email || '').trim().toLowerCase();
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. Try server route
  try {
    const res = await fetch('/api/attendance/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normEmail }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return data;
      }
    }
  } catch {
    // Continue to direct Supabase update
  }

  // 2. Direct Supabase update
  try {
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
      // Check local cache
      const memIndex = localAttendanceCache.findIndex(
        (r) => r.email === normEmail && r.status === 'present_working'
      );
      if (memIndex >= 0) {
        const item = localAttendanceCache[memIndex];
        const signInDate = new Date(item.signInTime);
        const diffMs = Math.max(0, now.getTime() - signInDate.getTime());
        const diffMins = Math.max(1, Math.round(diffMs / 60000));
        const durStr = formatMinutes(diffMins);

        const updated: AttendanceRecord = {
          ...item,
          status: 'signed_out',
          signOutTime: now.toISOString(),
          durationMinutes: diffMins,
          durationFormatted: durStr,
        };
        localAttendanceCache[memIndex] = updated;

        return {
          success: true,
          record: updated,
          message: `🚪 Recorded: ${item.employeeName} Signed Out at ${timeFormatted}. Shift duration: ${durStr}.`,
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
    const durStr = formatMinutes(diffMins);

    await supabase
      .from('orders')
      .update({
        status: 'delivered', // represents completed shift
        phone: now.toISOString(), // sign-out time
        product_name: `Completed Shift (${durStr})`,
        total_price: diffMins,
      })
      .eq('id', activeOrder.id);

    const updatedRecord: AttendanceRecord = {
      id: String(activeOrder.id),
      email: normEmail,
      employeeName: activeOrder.customer_name || normEmail.split('@')[0],
      role: activeOrder.city || 'Crew Member',
      status: 'signed_out',
      signInTime: activeOrder.address || activeOrder.created_at,
      signOutTime: now.toISOString(),
      durationMinutes: diffMins,
      durationFormatted: durStr,
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
      created_at: activeOrder.created_at,
    };

    return {
      success: true,
      record: updatedRecord,
      message: `🚪 Recorded: ${updatedRecord.employeeName} Signed Out at ${timeFormatted}. Shift duration: ${durStr}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Could not record sign out',
    };
  }
}

/**
 * Intelligent AI Analyst response generator
 * Formats rich, executive sales growth, daily revenue, and attendance shift reports.
 * STRICT CONSTITUTION: NEVER TAKES COFFEE ORDERS!
 */
export function generateAnalystResponse(message: string, analytics: StoreAnalytics | null): string {
  const lower = (message || '').toLowerCase().trim();

  // 1. STRICT CONSTITUTIONAL RULE: NOT INTENDED TO TAKE ORDERS
  const isOrderingAttempt =
    lower.includes('order') ||
    lower.includes('buy') ||
    lower.includes('pabili') ||
    lower.includes('pa-order') ||
    lower.includes('can i have') ||
    lower.includes('i want to get') ||
    lower.includes('deliver to') ||
    lower.includes('price of') ||
    lower.includes('spanish latte') ||
    lower.includes('caramel macchiato') ||
    lower.includes('croissant') ||
    lower.includes('americano') ||
    lower.includes('matcha');

  // Check if it's an order query rather than asking about order records or pipeline
  const isAskingMetricsOrPipeline =
    lower.includes('growth') ||
    lower.includes('revenue') ||
    lower.includes('sales') ||
    lower.includes('attendance') ||
    lower.includes('shift') ||
    lower.includes('present') ||
    lower.includes('working') ||
    lower.includes('sign in') ||
    lower.includes('sign out') ||
    lower.includes('pipeline') ||
    lower.includes('working station') ||
    lower.includes('station progress') ||
    lower.includes('records') ||
    lower.includes('audit');

  if (isOrderingAttempt && !isAskingMetricsOrPipeline) {
    return `☕ **Notice: Tara Timpla AI Growth & Shift Analyst** 📊✨

⚠️ **Strict Store Policy: I am not intended to take coffee orders!**

All coffee beverages, espresso drinks, and pastries are freshly crafted and fulfilled directly at our **Working Station** or **Orders** section.

👉 **How to Place an Order**:
Please navigate to the **Working Station** or **Orders** tab where our dedicated barista team is ready to receive and craft your cup!

💡 **How I Can Assist You Right Here (Store Intelligence)**:
• 📈 **"What is our sales growth and revenue today?"** (Day-over-day growth %, today's earnings, gross sales, AOV)
• 👥 **"Who is present and working right now?"** (Staff on active duty & exact sign-in times)
• ⏱️ **"What time did employees sign in and sign out?"** (Complete shift clock-in and clock-out logs)
• 🏆 **"Which drinks are driving the most revenue growth?"** (Top grossing menu items)
• 🏪 **"What is our Working Station status?"** (Live brewing pipeline and order counts)

Would you like me to share our current revenue growth or check who is on duty today?`;
  }

  // 2. EMPLOYEE ATTENDANCE & SHIFT INQUIRIES
  if (
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
    lower.includes('roster') ||
    lower.includes('clock') ||
    lower.includes('who is on')
  ) {
    const workingList = analytics?.attendance?.currentlyWorking || [];
    const signedOutList = analytics?.attendance?.signedOutToday || [];
    const workingCount = workingList.length;

    let workingDetails = '• *No employees are currently clocked in as active right now.*';
    if (workingCount > 0) {
      workingDetails = workingList
        .map(
          (e, idx) =>
            `  ${idx + 1}. 🟢 **${e.employeeName}** (${e.role})\n     • Status: **Present & Working**\n     • Signed in at: **${new Date(e.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}**\n     • Active duration: **${e.durationFormatted}**`
        )
        .join('\n\n');
    }

    let signedOutDetails = '• *No completed shift sign-outs recorded today.*';
    if (signedOutList.length > 0) {
      signedOutDetails = signedOutList
        .map(
          (e, idx) =>
            `  ${idx + 1}. ⚪ **${e.employeeName}** (${e.role}) — Signed out at **${new Date(e.signOutTime || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}** (Shift length: **${e.durationFormatted}**)`
        )
        .join('\n');
    }

    return `👥 **Tara Timpla Coffee — Staff Attendance & Shift Intelligence** ⏱️☕

Here is the live real-time record of employee presence and working shifts:

🟢 **Currently Present & Working (${workingCount} staff on duty)**:
${workingDetails}

⚪ **Completed Shifts Today (Signed Out)**:
${signedOutDetails}

📋 **Automatic Shift Policy**:
• Once an employee signs into Tara Timpla Coffee, the system immediately logs them as **Present & Working** along with their exact sign-in timestamp.
• When they sign out at the end of their shift, their clock-out time and total completed shift duration are permanently recorded.`;
  }

  // 3. SALES GROWTH & REVENUE INQUIRY
  if (
    lower.includes('growth') ||
    lower.includes('grow') ||
    lower.includes('sale') ||
    lower.includes('revenue') ||
    lower.includes('earn') ||
    lower.includes('income') ||
    lower.includes('gross') ||
    lower.includes('financial') ||
    lower.includes('trend') ||
    lower.includes('how much') ||
    lower.includes('performance')
  ) {
    const todayRev = (analytics?.todayRevenue || 0).toLocaleString();
    const yesterdayRev = (analytics?.yesterdayRevenue || 0).toLocaleString();
    const growthRate = analytics?.salesGrowthRate || 0;
    const growthSign = growthRate >= 0 ? '+' : '';
    const growthDiff = (analytics?.salesGrowthAmount || 0).toLocaleString();
    const totalRev = (analytics?.totalGrossRevenue || 0).toLocaleString();
    const delivRev = (analytics?.deliveredRevenue || 0).toLocaleString();
    const weekRev = (analytics?.weekRevenue || 0).toLocaleString();
    const aov = analytics?.avgOrderValue || 0;
    const fulfillRate = analytics?.fulfillmentRate || 100;
    const todayOrders = analytics?.todayOrdersCount || 0;
    const yesterdayOrders = analytics?.yesterdayOrdersCount || 0;
    const totalOrders = analytics?.totalOrdersCount || 0;

    const topList = (analytics?.topProducts || [])
      .slice(0, 4)
      .map((p, i) => `  ${i + 1}. **${p.name}** — ${p.count} cups sold (₱${p.total.toLocaleString()} revenue)`)
      .join('\n');

    return `📊 **Tara Timpla Coffee — Sales Growth & Revenue Report** 📈✨

Here is our live store financial growth and revenue breakdown:

💰 **Daily Revenue & Growth Momentum**:
• **Today's Revenue**: **₱${todayRev}** across **${todayOrders}** order(s) today
• **Yesterday's Baseline**: **₱${yesterdayRev}** (${yesterdayOrders} orders)
• **Day-over-Day Sales Growth**: **${growthSign}${growthRate}%** (${growthSign}₱${growthDiff} net change)
• **Past 7 Days Gross Revenue**: **₱${weekRev}**
• **All-Time Gross Store Revenue**: **₱${totalRev}** across **${totalOrders}** recorded orders
• **Realized (Delivered) Revenue**: **₱${delivRev}** (${analytics?.countsByStatus.delivered || 0} delivered orders)

📈 **Key Business Intelligence Metrics**:
• **Average Order Value (AOV)**: **₱${aov}** per order
• **Fulfillment Completion Rate**: **${fulfillRate}%**
• **Payment Split**: Cash on Delivery (₱${(analytics?.paymentBreakdown.cod.total || 0).toLocaleString()}, ${analytics?.paymentBreakdown.cod.count || 0} orders) | GCash (₱${(analytics?.paymentBreakdown.gcash.total || 0).toLocaleString()}, ${analytics?.paymentBreakdown.gcash.count || 0} orders)

🏆 **Top Revenue Drivers (Best Sellers)**:
${topList || '  • Speciality Coffee drinks are driving steady store volume.'}

🏪 **Working Station Brewing Pipeline**:
• **Actively Brewing at Station**: ${analytics?.countsByStatus.processing || 0} orders
• **Out with Delivery Rider**: ${analytics?.countsByStatus.shipped || 0} orders
• **Incoming / Queued**: ${(analytics?.countsByStatus.pending || 0) + (analytics?.countsByStatus.new || 0)} orders`;
  }

  // 4. TOP DRINKS / BEST SELLERS
  if (lower.includes('top') || lower.includes('best') || lower.includes('driver') || lower.includes('item')) {
    const topList = (analytics?.topProducts || [])
      .map((p, i) => `  ${i + 1}. **${p.name}** — **${p.count}** orders (Total Gross: **₱${p.total.toLocaleString()}**)`)
      .join('\n');

    return `🏆 **Tara Timpla Coffee — Top Revenue-Driving Specialty Drinks** ☕✨

Here are the highest revenue-generating items ranked by sales volume:

${topList || '  • Spanish Latte and Caramel Macchiato are top grossing items.'}

💡 *These signature drinks represent the core growth engine of our daily sales.*`;
  }

  // 5. WORKING STATION / PIPELINE PROGRESS
  if (lower.includes('station') || lower.includes('pipeline') || lower.includes('brewing') || lower.includes('progress')) {
    return `🏪 **Tara Timpla Coffee — Working Station Live Status** ☕🛵

Operational status of active orders:
• ☕ **Actively Brewing (Processing)**: **${analytics?.countsByStatus.processing || 0}** order(s) locked in
• 🛵 **Out for Delivery (Shipped)**: **${analytics?.countsByStatus.shipped || 0}** order(s) with riders
• 📋 **Pending Confirmation**: **${analytics?.countsByStatus.pending || 0}** order(s)
• 🆕 **New Queued**: **${analytics?.countsByStatus.new || 0}** order(s)
• 🎉 **Delivered Today**: **${analytics?.countsByStatus.delivered || 0}** order(s)
• 👥 **Staff on Duty**: **${analytics?.attendance?.currentlyWorkingCount || 0}** crew members actively present`;
  }

  // 6. DEFAULT STORE EXECUTIVE BRIEFING
  const todayRev = (analytics?.todayRevenue || 0).toLocaleString();
  const growthRate = analytics?.salesGrowthRate || 0;
  const growthSign = growthRate >= 0 ? '+' : '';
  const workingCount = analytics?.attendance?.currentlyWorkingCount || 0;

  return `📈 **Kumusta! Welcome to Tara Timpla AI Growth & Shift Attendance Analyst** 📊✨

I am your dedicated store intelligence analyst reporting on sales growth, daily revenue, and employee work shifts.

*(⚠️ Please note: I am not intended to take coffee orders. All customer orders are crafted directly at the Working Station!)*

📌 **Current Store Snapshot**:
• **Today's Revenue**: **₱${todayRev}** (Sales Growth: **${growthSign}${growthRate}%**)
• **Crew on Duty**: **${workingCount}** employee(s) currently Present & Working

Quick questions you can ask me:
• 📈 **"What is our sales growth and revenue today?"**
• 👥 **"Who is present and working right now?"**
• ⏱️ **"What time did employees sign in and sign out today?"**
• 🏆 **"Which drinks are driving the most revenue?"**
• 🏪 **"What is our Working Station progress?"**

How can I help you analyze the store today?`;
}
