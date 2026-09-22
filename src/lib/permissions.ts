/**
 * Shared (client-safe) permission catalogue for dashboard access.
 *
 * Owners and managers (admins) are unrestricted; these keys only narrow what a
 * `staff` member can see and do. They reuse the existing roles system — a
 * person still needs a row in `public.user_roles`.
 *
 * Each granted section carries an access level:
 *  - "view"   → can open the section, but every write action is refused.
 *  - "manage" → full access (the behaviour every existing grant already has).
 */

export const STAFF_PERMISSIONS = [
  "pos",
  "platform_sales",
  "online_orders",
  "order_management",
  "riders",
  "kitchen",
  "menu",
  "combos",
  "banners",
  "inventory",
  "purchases",
  "suppliers",
  "coupons",
  "rewards",
  "challenges",
  "customers",
  "reviews",
  "reports",
  "delivery",
  "staff",
  "staff_finance",
  "own_salary",
  "own_money_taken",
  "own_profit_share",

  "settings",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const ACCESS_LEVELS = ["view", "manage"] as const;
export type StaffAccessLevel = (typeof ACCESS_LEVELS)[number];

export type PermissionGrants = Partial<Record<StaffPermission, StaffAccessLevel>>;

export const ACCESS_LEVEL_LABELS: Record<StaffAccessLevel, string> = {
  view: "View only",
  manage: "Full access",
};

export const PERMISSION_LABELS: Record<StaffPermission, string> = {
  pos: "Counter Sale",
  platform_sales: "Online Platform Sale",
  online_orders: "Online Orders",
  order_management: "Order Management",
  riders: "Riders",
  kitchen: "Kitchen / KDS",
  menu: "Menu Management",
  combos: "Combos",
  banners: "Promo Banners",
  inventory: "Inventory",
  purchases: "Purchases",
  suppliers: "Suppliers",
  coupons: "Offers & Coupons",
  rewards: "Rewards",
  challenges: "Challenges",
  customers: "Customers / CRM",
  reviews: "Reviews",
  reports: "Reports",
  delivery: "Delivery zones",
  staff: "Staff Management",
  staff_finance: "Staff Accounts",
  own_salary: "Own Salary",
  own_money_taken: "Own Money-Taken",
  settings: "Settings",
};

export const PERMISSION_HINTS: Partial<Record<StaffPermission, string>> = {
  order_management: "Change order status and assign deliveries",
  settings: "Restaurant settings, payment and SMS setup",
  own_salary: "Lets this person see only their own salary and money records",
  own_money_taken: "Lets this person submit money-taken requests for owner approval",
};

/**
 * Sections that used to sit under a wider switch. Someone who already has the
 * older section keeps the newer ones until the owner changes it.
 */
export const PERMISSION_FALLBACK: Partial<Record<StaffPermission, StaffPermission>> = {
  rewards: "coupons",
  challenges: "coupons",
  reviews: "customers",
  delivery: "settings",
  riders: "order_management",
  banners: "menu",
  combos: "menu",
};

/** Grouping used by the owner's permission editor. */
export const PERMISSION_GROUPS: { title: string; permissions: StaffPermission[] }[] = [
  {
    title: "Selling",
    permissions: ["pos", "online_orders", "order_management", "riders", "platform_sales"],
  },
  {
    title: "Kitchen & stock",
    permissions: ["kitchen", "inventory", "purchases", "suppliers"],
  },
  {
    title: "Menu & marketing",
    permissions: ["menu", "combos", "banners", "coupons", "rewards", "challenges"],
  },
  {
    title: "Customers",
    permissions: ["customers", "reviews"],
  },
  {
    title: "People & money",
    permissions: ["staff", "staff_finance", "own_salary", "own_money_taken"],
  },
  {
    title: "Reports & setup",
    permissions: ["reports", "delivery", "settings"],
  },
];

export function isStaffPermission(value: string): value is StaffPermission {
  return (STAFF_PERMISSIONS as readonly string[]).includes(value);
}

export function isAccessLevel(value: string): value is StaffAccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(value);
}

export type PermissionAccess = {
  isOwner?: boolean;
  isManager?: boolean;
  permissions?: string[];
  grants?: Record<string, string> | PermissionGrants | null;
} | null | undefined;

function readGrant(
  access: NonNullable<PermissionAccess>,
  permission: StaffPermission,
): StaffAccessLevel | null {
  const grants = (access.grants ?? null) as Record<string, string> | null;
  const direct = grants?.[permission];
  if (direct && isAccessLevel(direct)) return direct;
  // Compatibility: older callers only send a flat list of granted sections.
  if (!grants && (access.permissions ?? []).includes(permission)) return "manage";
  return null;
}

/** The person's level for this section, or null when they have no access. */
export function permissionLevel(
  access: PermissionAccess,
  permission: StaffPermission,
): StaffAccessLevel | null {
  if (!access) return null;
  if (access.isManager) return "manage";
  const direct = readGrant(access, permission);
  if (direct) return direct;
  const fallback = PERMISSION_FALLBACK[permission];
  if (fallback) return readGrant(access, fallback);
  return null;
}

/** Can this person open the section (view or manage)? Owners/managers always can. */
export function hasPermission(access: PermissionAccess, permission: StaffPermission): boolean {
  return permissionLevel(access, permission) !== null;
}

/** Can this person change things in the section? */
export function canManage(access: PermissionAccess, permission: StaffPermission): boolean {
  return permissionLevel(access, permission) === "manage";
}
