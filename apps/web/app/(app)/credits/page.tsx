"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CreditCard, ExternalLink, Gift, ReceiptText, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AccountCopyButton, AccountDetail, AccountPanel, AccountQueryError } from "@/components/account-ui";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Dialog, Empty, Notice, Select, Skeleton, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { accountError, checkoutNotice, httpUrl, ledgerLabel } from "@/lib/account-helpers";
import { api, request, type LedgerEntry, type Order, type Page } from "@/lib/api";
import { cn, money, shortDate } from "@/lib/utils";

const PACKS = [
  { pack: 1, name: "Starter", credits: 100, cents: 4900 },
  { pack: 3, name: "Growth", credits: 300, cents: 14700 },
  { pack: 10, name: "Scale", credits: 1000, cents: 49000 },
] as const;

function CreditsInner() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const returnStatus = params.get("status");
  const returnId = params.get("order");
  const [returnedAt] = useState(() => Date.now());
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [movement, setMovement] = useState("all");
  const balance = useQuery({ queryKey: ["credits"], queryFn: api.credits });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const ledger = useInfiniteQuery({
    queryKey: ["credits", "ledger", "history"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => pageParam ? request<Page<LedgerEntry>>(`/v1/credits/ledger?limit=50&cursor=${encodeURIComponent(pageParam)}`) : api.ledger(),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: api.orders,
    refetchInterval: (query) => {
      const pending = query.state.data?.some((order) => order.id === returnId && order.status === "pending");
      return returnStatus === "success" && pending && health.data?.providers.stripe !== false && Date.now() - returnedAt < 60_000 ? 3000 : false;
    },
  });
  const topUp = useMutation({
    mutationFn: (pack: number) => api.topUp(pack),
    onSuccess: (order) => {
      setReviewOrder(order);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const returnOrder = returnId ? orders.data?.find((order) => order.id === returnId) : undefined;
  const notice = checkoutNotice(returnStatus, returnOrder, Boolean(returnId) && orders.isLoading);
  const selectedOrder = orders.data?.find((order) => order.id === reviewOrder?.id) ?? reviewOrder;
  const checkoutUrl = httpUrl(selectedOrder?.checkout_url);
  const entries = Array.from(new Map((ledger.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => [entry.id, entry])).values());
  const visibleEntries = entries.filter((entry) => movement === "all" || (movement === "purchased" && entry.delta > 0) || (movement === "spent" && entry.delta < 0) || (movement === "free" && entry.reason.startsWith("free lead ")));

  useEffect(() => {
    if (returnOrder?.status === "paid") void queryClient.invalidateQueries({ queryKey: ["credits"] });
  }, [returnOrder?.id, returnOrder?.status, queryClient]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["credits"] });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Credits" description="Pay for the leads you claim. Keep every top-up and credit movement in view." />
        <Button type="button" variant="outline" disabled={balance.isFetching || ledger.isFetching || orders.isFetching} onClick={refresh}><RefreshCw className="size-4" />Refresh</Button>
      </div>
      {notice ? <Notice tone={notice.tone}><p className="font-semibold">{notice.title}</p><p className="mt-1 leading-relaxed">{notice.message}</p></Notice> : null}
      {balance.isError ? <AccountQueryError message="Your credit balance could not be loaded." onRetry={() => void balance.refetch()} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Available credits" value={balance.isLoading || balance.isError ? "—" : balance.data?.balance ?? "—"} hint={balance.data ? `${balance.data.spend_report.credits_spent} spent · ${balance.data.spend_report.credits_purchased} added` : "Your workspace's current balance"} />
        <Stat label="Free claims remaining" value={balance.isLoading || balance.isError ? "—" : balance.data?.free_leads_remaining ?? "—"} hint={balance.data ? `${balance.data.free_leads_used} free claims used · free claims are used first` : "Available before paid credits are used"} />
        <Stat label="Cost per claimed lead" value={balance.isLoading || balance.isError || !balance.data ? "—" : `${balance.data.lead_price_credits} ${balance.data.lead_price_credits === 1 ? "credit" : "credits"}`} hint="Charged only when you claim a paid lead" />
      </div>

      <AccountPanel title="Top up your workspace" description="One-time packs, no subscription. Review the server's final total before continuing to checkout." icon={<CreditCard className="size-4" />}>
        <div className="space-y-4">
          {health.data?.providers.stripe === false ? <Notice tone="info">Payments are not configured on this server. You can create a pending order, but checkout and credit grants will not be available until payments are configured.</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {PACKS.map((pack) => (
              <div key={pack.pack} className={cn("flex flex-col rounded-xl border p-4", pack.pack === 3 ? "border-signal/30 bg-signal/5" : "bg-muted/20")}>
                <p className="text-xs font-medium text-muted-foreground">{pack.name}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{pack.credits.toLocaleString("en-US")} <span className="text-xs font-normal text-muted-foreground">credits</span></p>
                <p className="mt-1 text-sm font-medium">{money(pack.cents)} <span className="text-xs font-normal text-muted-foreground">USD</span></p>
                <Button type="button" variant={pack.pack === 3 ? "default" : "outline"} className="mt-5 w-full" disabled={topUp.isPending} onClick={() => topUp.mutate(pack.pack)}>{topUp.isPending && topUp.variables === pack.pack ? "Creating order…" : health.data?.providers.stripe === false ? "Create pending order" : "Choose pack"}</Button>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Standard pack pricing is shown above. A server can configure different pack sizes or prices; the order review shows the authoritative credits and total. Creating an order does not confirm a payment.</p>
          {topUp.isError ? <Notice tone="error">{accountError(topUp.error, "The order could not be created. Please try again.")}</Notice> : null}
        </div>
      </AccountPanel>

      <AccountPanel
        title="Credit ledger"
        description="A permanent record of top-ups and claims, newest first."
        icon={<ReceiptText className="size-4" />}
        action={<Select aria-label="Filter credit movements" value={movement} onChange={(event) => setMovement(event.target.value)} className="w-full sm:w-40"><option value="all">All movements</option><option value="purchased">Credits added</option><option value="spent">Credits spent</option><option value="free">Free claims</option></Select>}
      >
        {ledger.isLoading ? <Skeleton className="h-32 w-full" /> : ledger.isError && !entries.length ? (
          <AccountQueryError message="The credit ledger could not be loaded." onRetry={() => void ledger.refetch()} />
        ) : !visibleEntries.length ? (
          <Empty title={entries.length ? "No matching movements" : "No credit movements yet"} hint={entries.length ? "Choose another movement type or load older entries." : "Your first top-up or claim will appear here."} icon={<ReceiptText className="size-5" />} />
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Activity</Th><Th className="text-right">Change</Th><Th className="text-right">Balance after</Th></tr></thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <tr key={entry.id}>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground"><time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{shortDate(entry.created_at)}</time></Td>
                  <Td><div className="flex items-center gap-2.5"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{entry.delta > 0 ? <ArrowDownLeft className="size-3.5" /> : entry.delta < 0 ? <ArrowUpRight className="size-3.5" /> : <Gift className="size-3.5" />}</span><p className="text-sm">{ledgerLabel(entry.reason)}</p></div></Td>
                  <Td className="text-right"><Badge tone={entry.delta > 0 ? "success" : entry.delta === 0 ? "default" : "muted"}>{entry.delta > 0 ? "+" : ""}{entry.delta}</Badge></Td>
                  <Td className="text-right tabular-nums">{entry.balance_after}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {entries.length ? <p className="mt-4 text-xs text-muted-foreground">{visibleEntries.length} of {entries.length} loaded movements · balances are recorded at the time of each entry</p> : null}
        {ledger.isError && entries.length ? <div className="mt-4"><AccountQueryError message="The ledger refresh failed. Your loaded entries are still shown." onRetry={() => void ledger.refetch()} /></div> : null}
        {ledger.hasNextPage ? <div className="mt-4 border-t pt-4"><Button type="button" variant="outline" size="sm" disabled={ledger.isFetching} onClick={() => void ledger.fetchNextPage()}>{ledger.isFetchingNextPage ? "Loading…" : "Load older movements"}</Button></div> : null}
      </AccountPanel>

      <AccountPanel title="Order history" description="Payment status comes from the server, not from a checkout return URL." icon={<CreditCard className="size-4" />}>
        {orders.isLoading ? <Skeleton className="h-28 w-full" /> : orders.isError ? (
          <AccountQueryError message="Order history could not be loaded. Payment status cannot be verified right now." onRetry={() => void orders.refetch()} />
        ) : !orders.data?.length ? (
          <Empty title="No orders yet" hint="Choose a pack above to create your first order." icon={<CreditCard className="size-5" />} />
        ) : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Credits</Th><Th>Total</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id} className={order.id === returnId ? "bg-signal/5" : undefined}>
                  <Td><p className="text-xs font-medium">{shortDate(order.created_at)}</p><code className="mt-1 block text-[11px] text-muted-foreground">{order.id.slice(0, 8)}</code></Td>
                  <Td className="tabular-nums">{order.credits.toLocaleString("en-US")}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{money(order.amount_cents, order.currency)}</Td>
                  <Td><StatusBadge status={order.status} />{order.status === "pending" ? <p className="mt-1 text-[11px] text-muted-foreground">{httpUrl(order.checkout_url) ? "Awaiting payment confirmation" : "Checkout unavailable"}</p> : null}</Td>
                  <Td className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => setReviewOrder(order)}>{order.status === "pending" && httpUrl(order.checkout_url) ? "Review & pay" : "Details"}</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </AccountPanel>

      <Dialog
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => { if (!open) setReviewOrder(null); }}
        title="Review your order"
        description="The credits, total and status below come directly from the workspace order."
        footer={<><Button type="button" variant="outline" onClick={() => setReviewOrder(null)}>Close</Button>{selectedOrder?.status === "pending" && checkoutUrl ? <Button type="button" onClick={() => window.location.assign(checkoutUrl)}>Continue to checkout<ExternalLink className="size-4" /></Button> : null}</>}
      >
        {selectedOrder ? <>
          <dl>
            <AccountDetail label="Credits">{selectedOrder.credits.toLocaleString("en-US")}</AccountDetail>
            <AccountDetail label="Total">{money(selectedOrder.amount_cents, selectedOrder.currency)} <span className="text-xs text-muted-foreground">{selectedOrder.currency.toUpperCase()}</span></AccountDetail>
            <AccountDetail label="Status"><StatusBadge status={selectedOrder.status} /></AccountDetail>
            <AccountDetail label="Order ID"><div className="flex flex-wrap items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs">{selectedOrder.id}</code><AccountCopyButton value={selectedOrder.id} label="Copy ID" /></div></AccountDetail>
          </dl>
          {selectedOrder.status === "pending" ? <Notice tone="info">{checkoutUrl ? "This order is pending. Opening checkout does not confirm payment; credits are added after the server records the payment." : "No checkout URL was issued for this order. It is still pending, and creating it has not granted any credits. Ask your workspace owner to check payment configuration."}</Notice> : null}
        </> : null}
      </Dialog>
    </div>
  );
}

export default function CreditsPage() {
  return <Suspense fallback={<Skeleton className="h-48 w-full" />}><CreditsInner /></Suspense>;
}
