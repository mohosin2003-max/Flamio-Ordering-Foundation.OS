import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getOwnerAccess } from "@/lib/owner.functions";

/**
 * Shared read of the caller's dashboard access (same query key as the owner
 * shell, so it is fetched once). The real boundary lives in the server
 * functions — this only decides what the UI offers.
 */
export function useDashboardAccess(enabled = true) {
  const fetchAccess = useServerFn(getOwnerAccess);
  const query = useQuery({
    queryKey: ["owner-access"],
    queryFn: () => fetchAccess(),
    enabled,
    staleTime: 60 * 1000,
  });

  const data = query.data;
  return {
    ...query,
    isManager: Boolean(data?.isManager),
    isStaffOnly: Boolean(data?.isStaff && !data?.isManager),
  };
}
