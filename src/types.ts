export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

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
}
