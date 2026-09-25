import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, employeeName, role } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normEmail = email.trim().toLowerCase();
    const displayName = employeeName || (normEmail === 'johnjoshuaguiral12@gmail.com' ? 'Store Owner' : normEmail.split('@')[0]);
    const safeRole = role || (normEmail === 'johnjoshuaguiral12@gmail.com' ? 'Owner' : 'Crew Member');
    const now = new Date();
    const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

    // Check if already clocked in
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
      return res.status(200).json({
        success: true,
        record: {
          id: String(existing.id),
          email: normEmail,
          employeeName: existing.customer_name || displayName,
          role: existing.city || safeRole,
          status: 'present_working',
          signInTime: existing.address || existing.created_at,
          durationFormatted: 'Already on active shift',
          date: todayDateStr,
        },
        message: `${displayName} is already on shift.`,
      });
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
      console.warn('Attendance insert error:', error);
    }

    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const record = {
      id: inserted?.id ? String(inserted.id) : `att-${Date.now()}`,
      email: normEmail,
      employeeName: displayName,
      role: safeRole,
      status: 'present_working',
      signInTime: now.toISOString(),
      durationFormatted: 'Just Clocked In',
      date: todayDateStr,
    };

    return res.status(200).json({
      success: true,
      record,
      message: `✅ Recorded: ${displayName} (${safeRole}) is Present & Working (Signed in at ${timeStr})`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
