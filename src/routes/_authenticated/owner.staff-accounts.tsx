import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBDT } from "@/lib/format";
import {
  LEDGER_TYPES,
  LEDGER_TYPE_LABELS,
  PAYMENT_METHODS,
  ownerCreateLedgerEntry,
  ownerDeleteLedgerEntry,
  ownerListLedgerEntries,
  ownerListStaffAccounts,
  ownerSaveSalaryProfile,
} from "@/lib/staff-finance.functions";
import type { LedgerType, PaymentMethod, StaffAccount } from "@/lib/staff-finance.functions";

/**
 * Owner → Staff Accounts. Salary setup and the money ledger for each team
 * member. Reads the existing team from roles/profiles; nothing else changes.
 */
export const Route = createFileRoute("/_authenticated/owner/staff-accounts")({
  head: () => ({
    meta: [
      { title: "Staff Accounts — Flamio" },
      {
        name: "description",
        content: "Track salaries, advances, loans, bonuses and deductions for the Flamio team.",
      },
      { property: "og:title", content: "Staff Accounts — Flamio" },
      {
        property: "og:description",
        content: "Track salaries, advances, loans, bonuses and deductions for the Flamio team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerStaffAccounts,
});

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

function OwnerStaffAccounts() {
  const listAccounts = useServerFn(ownerListStaffAccounts);
  const [month, setMonth] = useState(thisMonth());
  const [openUser, setOpenUser] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ["staff-accounts", month],
    queryFn: () => listAccounts({ data: { month } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Staff accounts</h2>
          <p className="text-sm text-muted-foreground">
            Salaries, advances, loans, bonuses and deductions for your team.
          </p>
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="month">Month</Label>
          <Input
            id="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || thisMonth())}
          />
        </div>
      </div>

      {accounts.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : accounts.error ? (
        <EmptyState
          title="Couldn't load staff accounts"
          description="Something went wrong while loading your team's records."
          action={<Button onClick={() => void accounts.refetch()}>Try again</Button>}
        />
      ) : !accounts.data?.accounts.length ? (
        <EmptyState
          title="No team members yet"
          description="Add people in Staff first, then set up their salary here."
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap gap-6 p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Paid this month</p>
                <p className="font-display text-lg font-bold">
                  {formatBDT(accounts.data.payrollPaid)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Still due this month</p>
                <p className="font-display text-lg font-bold">
                  {formatBDT(accounts.data.accounts.reduce((a, m) => a + m.salaryDue, 0))}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Team members</p>
                <p className="font-display text-lg font-bold">{accounts.data.accounts.length}</p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {accounts.data.accounts.map((member) => (
              <AccountRow
                key={member.userId}
                member={member}
                month={month}
                open={openUser === member.userId}
                onToggle={() =>
                  setOpenUser(openUser === member.userId ? null : member.userId)
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AccountRow({
  member,
  month,
  open,
  onToggle,
}: {
  member: StaffAccount;
  month: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{member.fullName ?? "Unnamed team member"}</p>
            <p className="text-xs text-muted-foreground">
              {member.phone ?? member.email ?? "No contact saved"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {member.roles.map((role) => (
                <Badge key={role} variant="secondary" className="text-[10px] uppercase">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">
              {member.profile
                ? member.profile.payType === "monthly"
                  ? `${formatBDT(member.profile.monthlyRate)} / month`
                  : `${formatBDT(member.profile.dailyRate)} / day`
                : "No salary set"}
            </p>
            <p className="text-xs text-muted-foreground">
              Paid {formatBDT(member.paidThisMonth)} · Due {formatBDT(member.salaryDue)}
            </p>
            <p className="text-xs text-muted-foreground">
              Advance {formatBDT(member.outstandingAdvance)} · Loan{" "}
              {formatBDT(member.outstandingLoan)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SalaryDialog member={member} month={month} />
          <EntryDialog member={member} month={month} />
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {open ? "Hide history" : "View history"}
          </Button>
        </div>

        {open ? <History userId={member.userId} month={month} /> : null}
      </CardContent>
    </Card>
  );
}

function SalaryDialog({ member, month }: { member: StaffAccount; month: string }) {
  const save = useServerFn(ownerSaveSalaryProfile);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    payType: member.profile?.payType ?? "monthly",
    monthlyRate: String(member.profile?.monthlyRate ?? 0),
    dailyRate: String(member.profile?.dailyRate ?? 0),
    overtimeHourlyRate: String(member.profile?.overtimeHourlyRate ?? 0),
    payday: String(member.profile?.payday ?? 1),
    startsOn: member.profile?.startsOn ?? "",
    isActive: member.profile?.isActive ?? true,
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          userId: member.userId,
          payType: form.payType as "monthly" | "daily",
          monthlyRate: Number(form.monthlyRate) || 0,
          dailyRate: Number(form.dailyRate) || 0,
          overtimeHourlyRate: Number(form.overtimeHourlyRate) || 0,
          payday: Number(form.payday) || 1,
          startsOn: form.startsOn ? form.startsOn : null,
          isActive: form.isActive,
        },
      }),
    onSuccess: async () => {
      toast.success("Salary setup saved");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["staff-accounts", month] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {member.profile ? "Edit salary" : "Set salary"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salary setup</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Pay type</Label>
            <Select
              value={form.payType}
              onValueChange={(v) => setForm((f) => ({ ...f, payType: v as "monthly" | "daily" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly salary</SelectItem>
                <SelectItem value="daily">Daily wage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Monthly salary</Label>
              <Input
                type="number"
                min="0"
                value={form.monthlyRate}
                onChange={(e) => setForm((f) => ({ ...f, monthlyRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Daily wage</Label>
              <Input
                type="number"
                min="0"
                value={form.dailyRate}
                onChange={(e) => setForm((f) => ({ ...f, dailyRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Overtime per hour</Label>
              <Input
                type="number"
                min="0"
                value={form.overtimeHourlyRate}
                onChange={(e) => setForm((f) => ({ ...f, overtimeHourlyRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Payday (day of month)</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={form.payday}
                onChange={(e) => setForm((f) => ({ ...f, payday: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Started on</Label>
            <Input
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm">Currently employed</span>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>
          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save salary setup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({ member, month }: { member: StaffAccount; month: string }) {
  const create = useServerFn(ownerCreateLedgerEntry);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entryType: "salary_payment" as LedgerType,
    amount: "",
    entryDate: today(),
    paymentMethod: "cash" as PaymentMethod | "none",
    note: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          userId: member.userId,
          entryType: form.entryType,
          amount: Number(form.amount) || 0,
          entryDate: form.entryDate,
          paymentMethod: form.paymentMethod === "none" ? null : form.paymentMethod,
          note: form.note.trim() ? form.note.trim() : null,
        },
      }),
    onSuccess: async () => {
      toast.success("Record saved");
      setOpen(false);
      setForm((f) => ({ ...f, amount: "", note: "" }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-accounts", month] }),
        queryClient.invalidateQueries({ queryKey: ["staff-ledger", member.userId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add record</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add money record</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={form.entryType}
              onValueChange={(v) => setForm((f) => ({ ...f, entryType: v as LedgerType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEDGER_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {LEDGER_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.entryDate}
                onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Paid by</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, paymentMethod: v as PaymentMethod | "none" }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "cash" ? "Cash" : m === "bank" ? "Bank" : "Mobile banking"}
                  </SelectItem>
                ))}
                <SelectItem value="none">Not applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <Button
            className="w-full"
            disabled={mutation.isPending || !form.amount}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function History({ userId, month }: { userId: string; month: string }) {
  const list = useServerFn(ownerListLedgerEntries);
  const remove = useServerFn(ownerDeleteLedgerEntry);
  const queryClient = useQueryClient();
  const [allTime, setAllTime] = useState(false);

  const entries = useQuery({
    queryKey: ["staff-ledger", userId, allTime ? "all" : month],
    queryFn: () => list({ data: { userId, month: allTime ? null : month } }),
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Record removed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-ledger", userId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-accounts", month] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">History</p>
        <Button size="sm" variant="ghost" onClick={() => setAllTime((v) => !v)}>
          {allTime ? "This month only" : "Show all time"}
        </Button>
      </div>
      {entries.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !entries.data?.length ? (
        <p className="text-sm text-muted-foreground">No records yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.data.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-medium">{LEDGER_TYPE_LABELS[entry.entryType]}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.entryDate}
                  {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ""}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{formatBDT(entry.amount)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={del.isPending}
                  onClick={() => del.mutate(entry.id)}
                  aria-label="Remove record"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
