import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.max(1, minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function handler(req: any, res: any) {
  try {
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

    const analytics = {
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
        totalSignedToday: currentlyWorking.length + signedOutToday.length,
        currentlyWorkingCount: currentlyWorking.length,
        signedOutCount: signedOutToday.length,
        currentlyWorking,
        signedOutToday,
        allAttendance,
      },
    };

    return res.status(200).json({ success: true, analytics });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching analytics' });
  }
}
