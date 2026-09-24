export type OrderStatus = 'new' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface FBNotificationLog {
  id: string;
  orderId: string;
  customerName: string;
  phone?: string;
  status: OrderStatus;
  message: string;
  sentAt: string;
  channel: 'facebook_messenger' | 'simulated_webhook';
  delivered: boolean;
}

export interface Order {
  id: string; // Assuming string (UUID) or number but Supabase usually returns string for UUIDs. We'll use string for compatibility.
  customer_name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  landmarked?: string;
  product_variant: string;
  quantity: number;
  total_price?: number;
  payment_method?: string;
  status: OrderStatus;
  created_at: string;
}

export interface AppSettings {
  appName: string;
  fbPageName?: string;
  fbPageId?: string;
  fbAutoNotifyOnProcessing?: boolean;
}

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
