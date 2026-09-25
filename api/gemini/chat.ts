import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.max(1, minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function getStoreData() {
  const { data: rawOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  const allRecords = rawOrders || [];
  const attendanceOrders = allRecords.filter((o) => o.product_variant === 'EMPLOYEE_ATTENDANCE');
  const customerOrders = allRecords.filter(
    (o) => o.product_variant !== 'EMPLOYEE_ATTENDANCE' && o.product_variant !== 'EMPLOYEE_ACCOUNT'
  );

  const now = new Date();
  const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const allAttendance = attendanceOrders.map((o) => {
    const isWorking = o.status === 'processing' || o.landmarked === 'Present and Working';
    const signIn = o.address || o.created_at;
    const signOut = o.phone || undefined;
    let durationMins = Number(o.total_price) || undefined;
    if (!durationMins && signOut && signIn) {
      durationMins = Math.max(1, Math.round((new Date(signOut).getTime() - new Date(signIn).getTime()) / 60000));
    }
    let durationFormatted = o.product_name || '';
    if (!durationFormatted || durationFormatted === 'Employee Attendance Shift') {
      if (durationMins) {
        durationFormatted = formatMinutes(durationMins);
      } else if (isWorking) {
        const activeMins = Math.max(1, Math.round((Date.now() - new Date(signIn).getTime()) / 60000));
        durationFormatted = `${formatMinutes(activeMins)} on shift`;
      }
    } else {
      durationFormatted = durationFormatted.replace('Completed Shift (', '').replace(')', '');
    }

    return {
      id: String(o.id),
      employeeEmail: (o.email || '').toLowerCase(),
      employeeName: o.customer_name || 'Team Member',
      role: o.city || 'Crew Member',
      status: isWorking ? 'present_and_working' : 'signed_out',
      signInTime: signIn,
      signOutTime: signOut,
      durationMinutes: durationMins,
      durationFormatted,
      date: o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
        : todayDateStr,
    };
  });

  const currentlyWorking = allAttendance.filter((r) => r.status === 'present_and_working');
  const signedOutToday = allAttendance.filter((r) => r.status === 'signed_out' && r.date === todayDateStr);

  let totalGrossRevenue = 0;
  let deliveredRevenue = 0;
  let todayRevenue = 0;
  let todayOrdersCount = 0;
  let yesterdayRevenue = 0;
  let yesterdayOrdersCount = 0;
  let weekRevenue = 0;

  const countsByStatus = { new: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  const productSalesMap: Record<string, { count: number; total: number }> = {};
  const paymentMap = { cod: { count: 0, total: 0 }, gcash: { count: 0, total: 0 } };

  for (const o of customerOrders) {
    const status = (o.status || 'new').toLowerCase() as keyof typeof countsByStatus;
    if (countsByStatus[status] !== undefined) countsByStatus[status]++;
    else countsByStatus.new++;

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
      if (orderTs >= sevenDaysAgo) weekRevenue += price;
      if (status === 'delivered') deliveredRevenue += price;

      const prod = o.product_variant || 'Specialty Coffee';
      if (!productSalesMap[prod]) productSalesMap[prod] = { count: 0, total: 0 };
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

  const nonCancelled = customerOrders.filter((o) => o.status !== 'cancelled').length;
  const avgOrderValue = nonCancelled > 0 ? Math.round(totalGrossRevenue / nonCancelled) : 0;
  const activeOrdersCount = countsByStatus.new + countsByStatus.pending + countsByStatus.processing + countsByStatus.shipped;
  const fulfillmentRate = nonCancelled > 0 ? Math.round((countsByStatus.delivered / nonCancelled) * 100) : 100;

  let salesGrowthRate = 0;
  const salesGrowthAmount = todayRevenue - yesterdayRevenue;
  if (yesterdayRevenue > 0) {
    salesGrowthRate = Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100);
  } else if (todayRevenue > 0) {
    salesGrowthRate = 100;
  }

  const topProducts = Object.entries(productSalesMap)
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
    allOrders: customerOrders,
    attendance: {
      currentlyWorkingCount: currentlyWorking.length,
      currentlyWorking,
      signedOutToday,
      allRecords: allAttendance,
    },
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const storeAnalytics = await getStoreData();
    const key = process.env.GEMINI_API_KEY;

    if (key) {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const workingList = storeAnalytics.attendance.currentlyWorking || [];
        const workingStaffSummary = workingList.length > 0
          ? workingList.map((e: any, i: number) => `  ${i + 1}. ${e.employeeName} (${e.role}) — Present & Working (Signed in at ${new Date(e.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`).join('\n')
          : '  • No employees currently clocked in.';

        const systemPrompt = `You are "Tara Timpla Coffee AI Growth & Revenue Analyst".
Tone: Professional, transparent Filipino coffee brand executive and store analyst.
🚨 STRICT CONSTITUTIONAL RULE: YOU ARE NOT INTENDED TO TAKE ORDERS!
If user asks to order coffee, reply that you are not intended to take coffee orders, and direct them to the Working Station or Orders section.
LIVE STORE METRICS:
- Today's Revenue: ₱${storeAnalytics.todayRevenue.toLocaleString()} (${storeAnalytics.todayOrdersCount} orders)
- Yesterday's Revenue: ₱${storeAnalytics.yesterdayRevenue.toLocaleString()}
- Sales Growth Rate: ${storeAnalytics.salesGrowthRate >= 0 ? '+' : ''}${storeAnalytics.salesGrowthRate}% (₱${storeAnalytics.salesGrowthAmount.toLocaleString()})
- Total Gross Revenue: ₱${storeAnalytics.totalGrossRevenue.toLocaleString()}
- Active Working Staff: ${storeAnalytics.attendance.currentlyWorkingCount}
${workingStaffSummary}
Answer sales growth, daily revenue, and employee sign-in/sign-out times accurately.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser: ${message}` }] }],
        });

        if (response && response.text) {
          return res.status(200).json({
            reply: response.text,
            storeAnalytics,
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini call failed in serverless handler:', geminiErr);
      }
    }

    // Default intelligent analyst fallback
    const lower = message.toLowerCase();
    let reply = '';

    if (
      lower.includes('order') ||
      lower.includes('buy') ||
      lower.includes('pabili') ||
      lower.includes('latte') ||
      lower.includes('croissant')
    ) {
      reply = `☕ **Notice: Tara Timpla AI Growth & Revenue Analyst** 📊✨\n\n⚠️ **Please note: This AI chatbot is not intended to take coffee orders!**\n\nTo place an order, please visit our **Working Station** or **Orders** section where our team will craft your order fresh.\n\nAsk me about:\n• 📈 **"What is our sales growth and revenue today?"**\n• 👥 **"Who is present and working right now?"**\n• ⏱️ **"What time did employees sign in and sign out?"**`;
    } else if (
      lower.includes('growth') ||
      lower.includes('revenue') ||
      lower.includes('sale') ||
      lower.includes('financial')
    ) {
      reply = `📊 **Tara Timpla Coffee — Sales Growth & Revenue Report** 📈✨\n\n• **Today's Revenue**: **₱${storeAnalytics.todayRevenue.toLocaleString()}** (${storeAnalytics.todayOrdersCount} orders)\n• **Yesterday**: **₱${storeAnalytics.yesterdayRevenue.toLocaleString()}**\n• **Day-over-Day Growth**: **${storeAnalytics.salesGrowthRate >= 0 ? '+' : ''}${storeAnalytics.salesGrowthRate}%** (₱${storeAnalytics.salesGrowthAmount.toLocaleString()})\n• **All-Time Gross Revenue**: **₱${storeAnalytics.totalGrossRevenue.toLocaleString()}**\n• **Average Order Value (AOV)**: **₱${storeAnalytics.avgOrderValue}**\n• **Fulfillment Rate**: **${storeAnalytics.fulfillmentRate}%**`;
    } else if (
      lower.includes('employee') ||
      lower.includes('working') ||
      lower.includes('present') ||
      lower.includes('sign in') ||
      lower.includes('sign out') ||
      lower.includes('shift') ||
      lower.includes('attendance')
    ) {
      const workingStaff = storeAnalytics.attendance.currentlyWorking;
      const staffList = workingStaff.length > 0
        ? workingStaff.map((e: any, i: number) => `  ${i + 1}. 🟢 **${e.employeeName}** (${e.role}) — Present & Working (Signed in: ${new Date(e.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`).join('\n')
        : '  • No employees currently clocked in as active.';

      reply = `👥 **Tara Timpla Coffee — Employee Attendance & Shifts** ⏱️☕\n\n🟢 **Currently Present & Working (${workingStaff.length} staff)**:\n${staffList}\n\n📋 *Employee presence is automatically recorded when signing in and signing out.*`;
    } else {
      reply = `📈 **Kumusta! Tara Timpla AI Growth & Shift Attendance Analyst** 📊✨\n\n• **Today's Revenue**: ₱${storeAnalytics.todayRevenue.toLocaleString()} (Growth: ${storeAnalytics.salesGrowthRate >= 0 ? '+' : ''}${storeAnalytics.salesGrowthRate}%)\n• **Staff on Duty**: ${storeAnalytics.attendance.currentlyWorkingCount} present & working\n\nAsk me about sales growth, revenue, or employee shifts anytime!`;
    }

    return res.status(200).json({ reply, storeAnalytics });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
