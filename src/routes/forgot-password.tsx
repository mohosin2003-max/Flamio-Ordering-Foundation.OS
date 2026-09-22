import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, MessageCircleQuestion, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot your password? — Flamio" },
      {
        name: "description",
        content:
          "Password recovery currently requires contacting Flamio support. SMS recovery is coming in a future update.",
      },
      { property: "og:title", content: "Forgot your password? — Flamio" },
      {
        property: "og:description",
        content: "Contact Flamio support to recover your account password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 pb-28 sm:px-6">
      <Link
        to="/auth"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to sign in
      </Link>

      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
        Forgot your password?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        For account security, password recovery currently requires contacting Flamio support.
        Our team will verify your identity and help you get back into your account.
      </p>

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="recovery-phone">Your phone number</Label>
          <Input
            id="recovery-phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01712345678"
            aria-describedby="recovery-phone-hint"
          />
          <p id="recovery-phone-hint" className="text-xs text-muted-foreground">
            Have your registered phone number ready — support will use it to find your account.
          </p>
        </div>

        <Button asChild className="w-full">
          <Link to="/contact">
            <MessageCircleQuestion aria-hidden="true" /> Contact Flamio Support
          </Link>
        </Button>

        <div className="flex gap-3 rounded-xl border border-border/70 bg-secondary p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">
            SMS password recovery will be available in a future update. We never ask for your
            current password.
          </p>
        </div>
      </div>
    </div>
  );
}
