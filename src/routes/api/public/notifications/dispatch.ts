import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled notification dispatcher. Called once a minute by the database
 * scheduler with the platform cron secret; it claims due jobs atomically and
 * sends the delayed review reminders and staff/owner escalations.
 */
export const Route = createFileRoute("/api/public/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { dispatchDueNotificationJobs } = await import("@/lib/push.server");
        const result = await dispatchDueNotificationJobs(25);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
