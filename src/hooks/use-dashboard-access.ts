import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerAccess } from "@/lib/owner.functions";

/**
 * Shared read of the caller's dashboard access (same query key as the owner
 * shell, so it is fetched once). The real boundary lives in the server
 * functions — this only decides what the UI offers.
 *
 * The server function requires a session, so the query never runs while the
 * visitor is signed out (or while the session is still being restored) and it
 * is never retried — otherwise public pages such as the cart and checkout
 * would throw "Unauthorized" for guests.
 */
export function useDashboardAccess(enabled = true) {
  const { isAuthenticated, loading } = useAuth();
  const fetchAccess = useServerFn(getOwnerAccess);
  const query = useQuery({
    queryKey: ["owner-access"],
    queryFn: async () => {
      // Session can end between render and fetch (e.g. during logout).
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return fetchAccess();
    },
    enabled: enabled && isAuthenticated && !loading,
    retry: false,
    staleTime: 60 * 1000,
  });

  const data = query.data;
  return {
    ...query,
    isManager: Boolean(data?.isManager),
    isStaffOnly: Boolean(data?.isStaff && !data?.isManager),
  };
}
