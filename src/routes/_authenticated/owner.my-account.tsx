import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/states";
import { formatBDT } from "@/lib/format";
import {
  LEDGER_TYPE_LABELS,
  staffGetMyFinance,
  staffSubmitMoneyTaken,
} from "@/lib/staff-finance.functions";

/**
 * A staff member's OWN account. The server function reads only the signed-in
 * person's records, so no other team member's money is reachable from here.
 */
export const Route = createFileRoute("/_authenticated/owner/my-account")({
  component: MyAccountPage,
});

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

function MyAccountPage() {
  const queryClient = useQueryClient();
  const fetchFinance = useServerFn(staffGetMyFinance);
  const submitMoney = useServerFn(staffSubmitMoneyTaken);

  const [month, setMonth] = useState(thisMonth);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const finance = useQuery({
    queryKey: ["my-finance", month],
    queryFn: () => fetchFinance({ data: { month } }),
  });

  if (finance.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (finance.error || !finance.data) {
    return (
      <EmptyState
        title="Couldn't load your account"
        description="Something went wrong while loading your salary records."
        action={<Button onClick={() => void finance.refetch()}>Try again</Button>}
      />
    );
  }

  const data = finance.data;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount you took.");
      return;
    }
    if (reason.trim().length < 2) {
      toast.error("Add a short reason.");
      return;
    }

    setBusy(true);
    try {
      await submitMoney({
        data: {
          amount: value,
          reason: reason.trim(),
          entryDate,
          note: note.trim() || null,
        },
      });
      setAmount("");
      setReason("");
      setNote("");
      toast.success("Sent to the owner for approval");
      await queryClient.invalidateQueries({ queryKey: ["my-finance"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send this request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">My account</h2>
          <p className="text-sm text-muted-foreground">
            Only your own salary and money records are shown here.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="month">Month</Label>
          <Input
            id="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || thisMonth())}
            className="w-[170px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Monthly salary" value={formatBDT(data.monthlySalary)} />
        <Stat label="Paid this month" value={formatBDT(data.paidThisMonth)} />
        <Stat label="Remaining salary" value={formatBDT(data.salaryDue)} />
        <Stat label="Advance outstanding" value={formatBDT(data.outstandingAdvance)} />
        <Stat label="Loan outstanding" value={formatBDT(data.outstandingLoan)} />
        <Stat label="Waiting for approval" value={formatBDT(data.pendingTotal)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Bonus this month" value={formatBDT(data.bonusThisMonth)} />
        <Stat label="Overtime this month" value={formatBDT(data.overtimeThisMonth)} />
        <Stat label="Deductions this month" value={formatBDT(data.deductionThisMonth)} />
      </div>

      {data.canSubmitMoney ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money taken</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="entryDate">Date</Label>
                <Input
                  id="entryDate"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value || today())}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why you took this money"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Textarea
                  id="note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send for approval
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Your request stays pending until the owner approves it. Pending amounts don't
                  change your balances.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet.</p>
          ) : (
            data.entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {LEDGER_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.entryDate}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatBDT(entry.amount)}</p>
                  <p
                    className={
                      entry.status === "pending"
                        ? "text-xs font-medium text-amber-600"
                        : entry.status === "rejected"
                          ? "text-xs font-medium text-destructive"
                          : "text-xs text-muted-foreground"
                    }
                  >
                    {entry.status === "pending"
                      ? "Pending approval"
                      : entry.status === "rejected"
                        ? "Rejected"
                        : "Confirmed"}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
