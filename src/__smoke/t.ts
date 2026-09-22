import { previewCategory, scanStorage, readConfig, buildOverview } from "@/lib/cleanup.server";
const cfg = await readConfig();
console.log("installed:", cfg.installed);
for (const c of ["notifications","notification_jobs","expired_push_tokens","completed_orders","cancelled_orders","old_reviews","push_deliveries","communication_log"] as const) {
  const p = await previewCategory(c);
  console.log(c, "eligible", p.eligible, "protected", p.protected, "cutoff", p.cutoffAt.slice(0,10));
}
const files = await scanStorage();
console.log("files", files.length, files.map(f=>`${f.bucket}/${f.path}=${f.status}`).slice(0,10));
const o = await buildOverview();
console.log("overview records", o.databaseRecords.map(r=>`${r.table}:${r.count}`).join(","), "bytes", o.storageBytes, "orphans", o.orphanFiles);
