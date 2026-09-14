import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isValidPhone, normalizePhone, phoneToAuthEmail } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Flamio" },
      {
        name: "description",
        content: "Sign in with your phone number to save your details and reorder faster at Flamio.",
      },
      { property: "og:title", content: "Sign in — Flamio" },
      {
        property: "og:description",
        content: "Sign in with your phone number to reorder faster at Flamio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      void navigate({ to: "/account/orders", replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const fail = (message: string) => {
      setError(message);
      toast.error(message);
    };

    if (!isValidPhone(phone)) {
      fail("Please enter a valid phone number (e.g. 01712345678).");
      return;
    }
    if (!password) {
      fail("Please enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      fail("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && fullName.trim().length < 2) {
      fail("Please enter your full name.");
      return;
    }
    if (mode === "signup" && email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      fail("That email address doesn't look right. You can also leave it empty.");
      return;
    }

    const authEmail = phoneToAuthEmail(phone);

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: normalizePhone(phone),
              contact_email: email.trim(),
            },
          },
        });
        if (signUpError) {
          if (/already/i.test(signUpError.message)) {
            fail("An account with this phone number already exists. Please sign in.");
            setMode("login");
            return;
          }
          throw signUpError;
        }
        if (!data.session) {
          // Fall back to an immediate sign-in when no session came back.
          const { error: postSignIn } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password,
          });
          if (postSignIn) throw postSignIn;
        }
        toast.success("Welcome to Flamio!");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (signInError) {
          fail("Incorrect phone number or password.");
          return;
        }
        toast.success("Signed in");
      }
      await navigate({ to: "/account/orders", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "login"
          ? "Sign in with your phone number to track orders and reorder faster."
          : "Sign up with your phone number. Email is optional."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition-smooth",
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {m === "login" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="01712345678"
          />
        </div>

        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && (
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        You can keep browsing without an account.{" "}
        <Link to="/menu" className="font-semibold text-foreground underline-offset-4 hover:underline">
          View menu
        </Link>
      </p>
    </div>
  );
}
