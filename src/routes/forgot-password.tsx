import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { preparePasswordReset } from "@/lib/password-reset.functions";
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/otp";
import { formatPhone, isValidPhone } from "@/lib/phone";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Flamio" },
      {
        name: "description",
        content:
          "Reset your Flamio password with an SMS code sent to your registered phone number.",
      },
      { property: "og:title", content: "Reset your password — Flamio" },
      {
        property: "og:description",
        content: "Verify your phone by SMS and set a new Flamio password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

type Step = "phone" | "code" | "password";

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const prepare = useServerFn(preparePasswordReset);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configRequired, setConfigRequired] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function fail(message: string) {
    setError(message);
    toast.error(message);
  }

  async function requestCode(resend = false) {
    if (busy) return;
    setError(null);
    setConfigRequired(false);

    if (!isValidPhone(phone)) {
      fail("Please enter a valid phone number (e.g. 01712345678).");
      return;
    }

    setBusy(true);
    try {
      const prepared = await prepare({ data: { phone } });
      if (!prepared.found) {
        fail(prepared.message ?? "We couldn't start the reset. Please try again.");
        return;
      }

      const sent = await sendPhoneOtp(phone);
      if (!sent.ok) {
        setConfigRequired(Boolean(sent.configurationRequired));
        fail(sent.message ?? "We couldn't send the verification code.");
        return;
      }

      setStep("code");
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      toast.success(resend ? "New code sent" : `Code sent to ${formatPhone(phone)}`);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (code.trim().length < 4) {
      fail("Enter the code from the SMS.");
      return;
    }

    setBusy(true);
    try {
      const result = await verifyPhoneOtp(phone, code);
      if (!result.ok) {
        setConfigRequired(Boolean(result.configurationRequired));
        fail(result.message ?? "We couldn't verify that code.");
        return;
      }
      setStep("password");
      toast.success("Phone verified");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (password.length < 6) {
      fail("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      fail("Both passwords must match.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        fail(updateError.message);
        return;
      }
      await supabase.auth.signOut();
      toast.success("Password updated. Please sign in.");
      await navigate({ to: "/auth", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 pb-28 sm:px-6">
      <Link
        to="/auth"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to sign in
      </Link>

      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
        Reset your password
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {step === "phone" && "We'll send a verification code by SMS to your registered number."}
        {step === "code" && `Enter the code we sent to ${formatPhone(phone)}.`}
        {step === "password" && "Phone verified. Choose a new password."}
      </p>

      <ol className="mt-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {(["phone", "code", "password"] as const).map((s, i) => (
          <li
            key={s}
            className={
              "flex-1 rounded-full border px-2 py-1 text-center " +
              (step === s
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/70 bg-secondary")
            }
          >
            {i + 1}. {s === "phone" ? "Phone" : s === "code" ? "Verify" : "New password"}
          </li>
        ))}
      </ol>

      {configRequired && (
        <div
          role="alert"
          className="mt-5 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">SMS provider configuration required</p>
            <p className="mt-1 break-words text-muted-foreground">
              No code was sent. SMS verification must be enabled for this project before password
              resets by phone can work.
            </p>
          </div>
        </div>
      )}

      {step === "phone" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
          className="mt-6 space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="reset-phone">Phone number</Label>
            <Input
              id="reset-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="01712345678"
            />
          </div>
          {error && !configRequired && <ErrorText message={error} />}
          <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? "Sending code..." : "Send verification code"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyCode} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-code">Verification code</Label>
            <Input
              id="reset-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </div>
          {error && !configRequired && <ErrorText message={error} />}
          <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? "Verifying..." : "Verify code"}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="font-semibold text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
            >
              Change number
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void requestCode(true)}
              className="font-semibold text-foreground underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={savePassword} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && !configRequired && <ErrorText message={error} />}
          <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? "Saving..." : "Save new password"}
          </Button>
        </form>
      )}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
