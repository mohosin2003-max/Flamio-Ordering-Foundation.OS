import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/branding/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { signInWithPhonePassword } from "@/lib/auth.functions";
import { getOwnerAccess } from "@/lib/owner.functions";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { claimMyStaffInvite } from "@/lib/staff.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in or create an account — Flamio" },
      { name: "description", content: "Sign in to your Flamio customer or staff account." },
      { property: "og:title", content: "Sign in or create an account — Flamio" },
      { property: "og:description", content: "Access your Flamio customer or staff account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const fetchAccess = useServerFn(getOwnerAccess);
  const claimInvite = useServerFn(claimMyStaffInvite);
  const phonePasswordLogin = useServerFn(signInWithPhonePassword);

  const [mode, setMode] = useState<Mode>("login");
  const [identity, setIdentity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingPhoneOtp, setAwaitingPhoneOtp] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function safeRedirect(): string | null {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("redirect");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
  }

  const goToLanding = useCallback(async () => {
    try {
      await claimInvite({});
      const access = await fetchAccess();
      if (access.isManager || access.isStaff || (access.permissions ?? []).length > 0) {
        await navigate({ to: "/owner", replace: true });
        return;
      }
    } catch {
      // Customer routing remains available if no invitation exists.
    }
    const back = safeRedirect();
    if (back) {
      window.location.replace(back);
      return;
    }
    await navigate({ to: "/account/orders", replace: true });
  }, [claimInvite, fetchAccess, navigate]);

  useEffect(() => {
    if (!loading && isAuthenticated && !awaitingPhoneOtp) void goToLanding();
  }, [loading, isAuthenticated, awaitingPhoneOtp, goToLanding]);

  const fail = (message: string) => {
    setError(message);
    toast.error(message);
  };

  async function login() {
    if (!identity.trim() || !password) {
      fail("Enter your email or phone number and password.");
      return;
    }
    const value = identity.trim();
    if (!value.includes("@") && !isValidPhone(value)) throw new Error("Enter a valid email or phone number.");
    let directSession = null;
    if (value.includes("@")) {
      const direct = await supabase.auth.signInWithPassword({ email: value.toLowerCase(), password });
      directSession = direct.data.session;
    } else {
      const direct = await supabase.auth.signInWithPassword({
        phone: `+${normalizePhone(value)}`,
        password,
      });
      directSession = direct.data.session;
    }
    if (!directSession) {
      const result = await phonePasswordLogin({ data: { identity: value, password } });
      if (!result.ok) throw new Error(result.message);
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) throw new Error("We couldn't start your session. Please try again.");
    }
    toast.success("Signed in");
    await goToLanding();
  }

  async function signup() {
    if (fullName.trim().length < 2) throw new Error("Please enter your full name.");
    // Phone is always required: it stays the primary login identifier.
    if (!phone.trim()) throw new Error("Phone number is required.");
    if (!isValidPhone(phone)) throw new Error("Please enter a valid phone number.");
    if (!password) throw new Error("Password is required.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email.trim().toLowerCase();
    // Email is optional; when given it must be valid.
    if (normalizedEmail && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      throw new Error("Enter a valid email address or leave it empty.");
    }

    const metadata = {
      full_name: fullName.trim(),
      phone: normalizedPhone,
      contact_email: normalizedEmail,
      address_line: address.trim(),
    };

    if (normalizedEmail) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: window.location.origin + "/auth", data: metadata },
      });
      if (signUpError) throw signUpError;
      // The email must be confirmed by the provider before the account is
      // usable. If a session is handed back while the address is still
      // unconfirmed, we end it so the account is never treated as verified.
      const emailConfirmed = Boolean(data.user?.email_confirmed_at ?? data.user?.confirmed_at);
      if (!emailConfirmed) {
        if (data.session) await supabase.auth.signOut();
        setAwaitingEmail(true);
        toast.success("Check your email to confirm your account");
        return;
      }
      await goToLanding();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      phone: `+${normalizedPhone}`,
      password,
      options: { data: metadata },
    });
    if (signUpError) throw signUpError;
    if (!data.session) {
      setAwaitingPhoneOtp(true);
      toast.success("Enter the code sent to your phone");
      return;
    }
    await goToLanding();
  }


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login();
      else await signup();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone() {
    if (otp.trim().length < 4) {
      fail("Enter the code sent to your phone.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: `+${normalizePhone(phone)}`,
        token: otp.trim(),
        type: "sms",
      });
      if (verifyError) throw verifyError;
      setAwaitingPhoneOtp(false);
      toast.success("Phone verified");
      await goToLanding();
    } catch (err) {
      fail(err instanceof Error ? err.message : "We couldn't verify that code.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Verifies the signup code emailed by the existing authentication provider.
   * The code is only ever typed in by the customer — it is never generated,
   * stored or logged here.
   */
  async function verifyEmail() {
    if (otp.trim().length < 4) {
      fail("Enter the code sent to your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: "signup",
      });
      if (verifyError) throw verifyError;
      setAwaitingEmail(false);
      toast.success("Email verified");
      await goToLanding();
    } catch (err) {
      fail(err instanceof Error ? err.message : "We couldn't verify that code.");
    } finally {
      setBusy(false);
    }
  }



  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <div className="mb-6 flex justify-center">
        <BrandLogo showName textClassName="text-2xl tracking-tight" imageClassName="size-14" />
      </div>
      <h1 className="font-display text-3xl font-extrabold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        One account works for Flamio customers and staff.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {(["login", "signup"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant={mode === value ? "default" : "ghost"}
            onClick={() => {
              setMode(value);
              setError(null);
              setAwaitingEmail(false);
              setAwaitingPhoneOtp(false);
            }}
          >
            {value === "login" ? "Sign in" : "Sign up"}
          </Button>
        ))}
      </div>

      {awaitingEmail ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="font-semibold">Verify your email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a verification code to {email.trim()}. Enter it below to finish creating your
              account. The link in the same email also works.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-otp">Email verification code</Label>
            <Input
              id="email-otp"
              value={otp}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(event) => setOtp(event.target.value)}
            />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void verifyEmail()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Verify email
          </Button>
        </div>
      ) : awaitingPhoneOtp ? (
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Phone verification code</Label>
            <Input
              id="otp"
              value={otp}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(event) => setOtp(event.target.value)}
            />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void verifyPhone()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Verify phone
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "login" ? (
            <div className="space-y-2">
              <Label htmlFor="identity">Email or phone number</Label>
              <Input
                id="identity"
                value={identity}
                autoComplete="username"
                onChange={(event) => setIdentity(event.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input id="full-name" value={fullName} autoComplete="name" onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number (required)</Label>
                <Input id="phone" value={phone} inputMode="tel" autoComplete="tel" required placeholder="01712345678" onChange={(e) => setPhone(e.target.value)} />
                <p className="text-xs text-muted-foreground">You will sign in with this number.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input id="email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  If you add an email, we will send a verification code to it.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Delivery location (optional)</Label>
                <Input id="address" value={address} autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">{mode === "login" ? "Password" : "Password (required)"}</Label>
              {mode === "login" ? <Link to="/forgot-password" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Forgot password?</Link> : null}
            </div>
            <Input id="password" type="password" value={password} autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      )}

      <p className={cn("mt-6 text-center text-sm text-muted-foreground", awaitingEmail && "mt-4")}>
        You can keep browsing without an account. <Link to="/menu" className="font-semibold text-foreground hover:underline">View menu</Link>
      </p>
    </div>
  );
}