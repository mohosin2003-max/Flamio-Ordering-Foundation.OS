import { previewCategory, listForOwner, deleteRecords } from "@/lib/cleanup.server";
const now = new Date().toISOString();
const notif = await listForOwner("notifications", { before: now, limit: 200 });
console.log("notifications scanned", notif.length, "protected", notif.filter(n=>n.protectedReason).length);
console.log("sample protected:", notif.filter(n=>n.protectedReason).slice(0,3).map(n=>n.protectedReason));
const ord = await previewCategory("completed_orders", { before: now });
console.log("completed orders eligible", ord.eligible, "protected", ord.protected, ord.sample.filter(s=>s.protectedReason).slice(0,4).map(s=>`${s.label}:${s.protectedReason}`));
// SAFE: try to delete a PROTECTED notification -> must be refused, nothing removed.
const target = notif.find(n=>n.protectedReason);
if (target) {
  const res = await deleteRecords("notifications", [target.id], { userId: null as any, label: "test", runType: "manual" }, { before: now });
  console.log("protected delete attempt:", res);
}
// SAFE: high-risk category is locked by default -> must throw.
try {
  await deleteRecords("completed_orders", ["00000000-0000-0000-0000-000000000000"], { userId: null as any, label: "test", runType: "manual" }, { before: now });
  console.log("LOCK FAILED");
} catch (e) { console.log("lock works:", String(e).slice(0,90)); }
