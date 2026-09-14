import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/use-auth";
import {
  deleteAddress as deleteLocal,
  loadAddresses,
  saveAddresses,
  upsertAddress as upsertLocal,
} from "@/lib/addresses";
import {
  listAddresses,
  removeAddress,
  saveAddress,
  setDefaultAddress,
} from "@/lib/customer.functions";
import type { CustomerAddress } from "@/types/menu";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One address surface for the whole app. Signed-in customers read and write
 * their addresses in the database (protected by row-level security); guests
 * keep using the existing local store so checkout still works without an
 * account.
 */
export function useSavedAddresses() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const fetchAddresses = useServerFn(listAddresses);
  const persistAddress = useServerFn(saveAddress);
  const dropAddress = useServerFn(removeAddress);
  const makeDefault = useServerFn(setDefaultAddress);

  const [local, setLocal] = useState<CustomerAddress[]>([]);

  useEffect(() => {
    if (isAuthenticated) return;
    setLocal(loadAddresses());
  }, [isAuthenticated]);

  const remote = useQuery({
    queryKey: ["customer", "addresses"],
    queryFn: () => fetchAddresses(),
    enabled: isAuthenticated,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["customer", "addresses"] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (address: CustomerAddress) => {
      if (!isAuthenticated) {
        const next = upsertLocal(local, address);
        setLocal(next);
        saveAddresses(next);
        return;
      }
      await persistAddress({
        data: {
          id: UUID_RE.test(address.id) ? address.id : null,
          label: address.label,
          fullName: address.fullName,
          phone: address.phone,
          addressLine: address.addressLine,
          area: address.area,
          zoneId: address.zoneId,
          landmark: address.landmark,
          deliveryNotes: address.deliveryNotes,
          isDefault: address.isDefault,
          latitude: address.latitude ?? null,
          longitude: address.longitude ?? null,
        },
      });
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isAuthenticated) {
        const next = deleteLocal(local, id);
        setLocal(next);
        saveAddresses(next);
        return;
      }
      await dropAddress({ data: { id } });
      invalidate();
    },
  });

  const defaultMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isAuthenticated) {
        const next = local.map((a) => ({ ...a, isDefault: a.id === id }));
        setLocal(next);
        saveAddresses(next);
        return;
      }
      await makeDefault({ data: { id } });
      invalidate();
    },
  });

  const addresses: CustomerAddress[] = isAuthenticated
    ? ((remote.data ?? []) as CustomerAddress[])
    : local;

  return {
    addresses,
    isLoading: authLoading || (isAuthenticated && remote.isLoading),
    error: remote.error instanceof Error ? remote.error.message : null,
    isSaving: saveMutation.isPending,
    isRemoving: removeMutation.isPending,
    save: (address: CustomerAddress) => saveMutation.mutateAsync(address),
    remove: (id: string) => removeMutation.mutateAsync(id),
    setDefault: (id: string) => defaultMutation.mutateAsync(id),
    isRemote: isAuthenticated,
  };
}
