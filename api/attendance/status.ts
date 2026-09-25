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
    const { data: attendanceOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('product_variant', 'EMPLOYEE_ATTENDANCE')
      .order('created_at', { ascending: false });

    const now = new Date();
    const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

    const allAttendance = (attendanceOrders || []).map((o) => {
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

    return res.status(200).json({
      success: true,
      totalPresentCount: currentlyWorking.length,
      currentlyWorking,
      signedOutToday,
      allRecords: allAttendance,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
