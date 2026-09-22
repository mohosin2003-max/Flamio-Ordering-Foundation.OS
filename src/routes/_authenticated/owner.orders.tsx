import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/owner/orders")({
  validateSearch: (search: Record<string, unknown>): { order?: string; date?: string; activeOnline?: boolean } => {
    const parsed: { order?: string; date?: string; activeOnline?: boolean } = {};
    if (typeof search["order"] === "string") parsed.order = search["order"];
    if (typeof search["date"] === "string") parsed.date = search["date"];
    if (search["activeOnline"] === true || search["activeOnline"] === "true") parsed.activeOnline = true;
    return parsed;
  },
  component: () => <Outlet />,
});
