export function formatBDT(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}
