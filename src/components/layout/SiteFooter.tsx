import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { getOwnerAccess } from "@/lib/owner.functions";

export function SiteFooter() {
  const { isAuthenticated } = useAuth();
  const fetchAccess = useServerFn(getOwnerAccess);
  const access = useQuery({
    queryKey: ["owner-access"],
    queryFn: () => fetchAccess(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const showOwnerLink = Boolean(access.data?.isOwner || access.data?.canClaim);

  return (
    <footer className="border-t border-border/60 bg-surface">
      <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground">© 2026 Flamio · Owned by Mohosin</p>
        {showOwnerLink ? (
          <Link
            to="/owner"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Owner Dashboard
          </Link>
        ) : null}
      </div>
    </footer>
  );
}
