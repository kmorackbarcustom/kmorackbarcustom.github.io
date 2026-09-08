import { supabase } from './supabase';

export type PlatformSubscriptionPlan = 'free_trial' | 'basic_490' | 'pro_990';

export interface PlatformAdminShop {
  shopId: string;
  name: string;
  slug: string;
  businessCategory: string | null;
  ownerName: string | null;
  phone: string | null;
  promptpayNumber: string | null;
  requestedPlan: string;
  isActive: boolean;
  createdAt: string;
  subscriptionPlan: PlatformSubscriptionPlan | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
}

interface RawPlatformAdminShop {
  shop_id: string;
  name: string;
  slug: string;
  business_category: string | null;
  owner_name: string | null;
  phone: string | null;
  promptpay_number: string | null;
  requested_plan: string;
  is_active: boolean;
  created_at: string;
  subscription_plan: PlatformSubscriptionPlan | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export async function fetchPlatformAdminShops(): Promise<PlatformAdminShop[]> {
  const { data, error } = await supabase.rpc('platform_admin_list_shops');
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawPlatformAdminShop[]).map((row) => ({
    shopId: row.shop_id,
    name: row.name,
    slug: row.slug,
    businessCategory: row.business_category,
    ownerName: row.owner_name,
    phone: row.phone,
    promptpayNumber: row.promptpay_number,
    requestedPlan: row.requested_plan,
    isActive: row.is_active,
    createdAt: row.created_at,
    subscriptionPlan: row.subscription_plan,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  }));
}

export async function setShopActive(shopId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_set_shop_active', {
    p_shop_id: shopId,
    p_is_active: isActive,
  });
  if (error) throw new Error(error.message);
}

export async function extendShopTrial(shopId: string, days: number): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_extend_trial', {
    p_shop_id: shopId,
    p_days: days,
  });
  if (error) throw new Error(error.message);
}

export async function updateShopPlan(shopId: string, plan: PlatformSubscriptionPlan): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_update_plan', {
    p_shop_id: shopId,
    p_plan: plan,
  });
  if (error) throw new Error(error.message);
}
