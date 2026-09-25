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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normEmail = email.trim().toLowerCase();
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
      return res.status(200).json({
        success: false,
        message: `No active clock-in session found for ${normEmail}.`,
      });
    }

    const signInDate = new Date(activeOrder.address || activeOrder.created_at);
    const diffMs = Math.max(0, now.getTime() - signInDate.getTime());
    const diffMins = Math.max(1, Math.round(diffMs / 60000));
    const durStr = formatMinutes(diffMins);

    await supabase
      .from('orders')
      .update({
        status: 'delivered', // completed shift
        phone: now.toISOString(),
        product_name: `Completed Shift (${durStr})`,
        total_price: diffMins,
      })
      .eq('id', activeOrder.id);

    return res.status(200).json({
      success: true,
      record: {
        id: String(activeOrder.id),
        email: normEmail,
        employeeName: activeOrder.customer_name || normEmail.split('@')[0],
        role: activeOrder.city || 'Crew Member',
        status: 'signed_out',
        signInTime: activeOrder.address || activeOrder.created_at,
        signOutTime: now.toISOString(),
        durationMinutes: diffMins,
        durationFormatted: durStr,
      },
      message: `🚪 Recorded: ${activeOrder.customer_name || normEmail} Signed Out at ${timeFormatted}. Shift duration: ${durStr}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
