/**
 * Shared (client-safe) permission catalogue for dashboard access.
 *
 * Owners and managers (admins) are unrestricted; these keys only narrow what a
 * `staff` member can see and do. They reuse the existing roles system — a
 * person still needs a row in `public.user_roles`.
 */

export const STAFF_PERMISSIONS = [
  "pos",
  "platform_sales",
  "online_orders",
  "order_management",
  "kitchen",
  "menu",
  "inventory",
  "purchases",
  "suppliers",
  "coupons",
  "customers",
  "reports",
  "staff",
  "staff_finance",
  "own_salary",
  "own_money_taken",
  "settings",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<StaffPermission, string> = {
  pos: "Counter Sale",
  platform_sales: "Online Platform Sale",
  online_orders: "Online Orders",
  order_management: "Order Management",
  kitchen: "Kitchen / KDS",
  menu: "Menu Management",
  inventory: "Inventory",
  purchases: "Purchases",
  suppliers: "Suppliers",
  coupons: "Offers & Coupons",
  customers: "Customers / CRM",
  reports: "Reports",
  staff: "Staff Management",
  staff_finance: "Staff Accounts",
  own_salary: "Own Salary",
  own_money_taken: "Own Money-Taken",
  settings: "Settings",
};

export const PERMISSION_HINTS: Partial<Record<StaffPermission, string>> = {
  order_management: "Also covers riders and delivery assignment",
  menu: "Also covers promo banners",
  settings: "Also covers delivery zones and payment setup",
  own_salary: "Lets this person see only their own salary and money records",
  own_money_taken: "Lets this person submit money-taken requests for owner approval",
};

export function isStaffPermission(value: string): value is StaffPermission {
  return (STAFF_PERMISSIONS as readonly string[]).includes(value);
}

/** Does this person have the permission? Owners/managers always do. */
export function hasPermission(
  access: { isOwner?: boolean; isManager?: boolean; permissions?: string[] } | null | undefined,
  permission: StaffPermission,
): boolean {
  if (!access) return false;
  if (access.isManager) return true;
  return (access.permissions ?? []).includes(permission);
}
