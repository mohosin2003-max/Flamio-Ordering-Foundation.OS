import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/envcheck')({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env['SUPABASE_URL'] ?? null;
        const pid = process.env['SUPABASE_PROJECT_ID'] ?? null;
        const pub = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? null;
        const srk =
          process.env['EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'] ||
          process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
          null;

        let adminOk: string = 'not-tested';
        if (url && srk) {
          const res = await fetch(`${url}/rest/v1/products?select=id&limit=1`, {
            headers: { apikey: srk, Authorization: `Bearer ${srk}` },
          });
          adminOk = `${res.status}`;
        }

        return new Response(
          JSON.stringify({
            serverUrl: url,
            serverProjectId: pid,
            pubPrefix: pub ? pub.slice(0, 22) : null,
            srkLen: srk ? srk.length : 0,
            adminRestStatus: adminOk,
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      },
    },
  },
});
