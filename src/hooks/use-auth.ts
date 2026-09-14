import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type CustomerProfile = {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
};

/**
 * Single source of truth for the customer session. Registers one
 * onAuthStateChange listener and keeps the linked profile in sync.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let active = true;
    void supabase
      .from("profiles")
      .select("id, full_name, phone, email, avatar_path")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!active) return;

        let avatarUrl: string | null = null;
        if (data?.avatar_path) {
          const { data: signed } = await supabase.storage
            .from("profile-photos")
            .createSignedUrl(data.avatar_path, 60 * 60);
          if (!active) return;
          avatarUrl = signed?.signedUrl ?? null;
        }

        setProfile(
          data
            ? {
                id: data.id,
                fullName: data.full_name,
                phone: data.phone,
                email: data.email,
                avatarPath: data.avatar_path,
                avatarUrl,
              }
            : {
                id: user.id,
                fullName: null,
                phone: null,
                email: null,
                avatarPath: null,
                avatarUrl: null,
              },
        );
      });
    return () => {
      active = false;
    };
  }, [user, profileVersion]);

  const refreshProfile = useCallback(() => setProfileVersion((v) => v + 1), []);

  return { session, user, profile, loading, refreshProfile, isAuthenticated: Boolean(user) };
}
