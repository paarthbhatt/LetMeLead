"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PageHeader } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Skeleton,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money, relative, shortDate } from "@/lib/utils";

const PACKS = [1, 3, 10];

function CreditsInner() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const status = params.get("status");
  const [error, setError] = useState<string | null>(null);

  const balance = useQuery({ queryKey: ["credits"], queryFn: api.credits });
  const ledger = useQuery({ queryKey: ["credits", "ledger"], queryFn: api.ledger });
  const orders = useQuery({ queryKey: ["orders"], queryFn: api.orders });

  const topUp = useMutation({
    mutationFn: (pack: number) => api.topUp(pack),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      if (order.checkout_url) window.location.href = order.checkout_url;
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the checkout."),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Credits"
        description="Credits buy claimed leads. They never expire, every movement is in the ledger, and there is no subscription."
      />

      {status === "success" ? (
        <Card className="border-emerald-500/40">
          <CardContent className="text-sm">
            Payment received. Credits appear as soon as Stripe&apos;s webhook lands — refresh in a few seconds.
          </CardContent>
        </Card>
      ) : status === "cancelled" ? (
        <Card className="border-amber-500/40">
          <CardContent className="text-sm">Checkout cancelled. Nothing was charged.</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Balance</CardDescription>
            <CardTitle className="text-2xl">{balance.isLoading ? "—" : balance.data?.balance}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Free leads left</CardDescription>
            <CardTitle className="text-2xl">
              {balance.isLoading ? "—" : balance.data?.free_leads_remaining}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Price per claim</CardDescription>
            <CardTitle className="text-2xl">{balance.data?.lead_price_credits ?? 1} credit</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top up</CardTitle>
          <CardDescription>
            {balance.data ? `${balance.data.spend_report.credits_spent} spent · ${balance.data.spend_report.credits_purchased} purchased` : "Credit packs, charged once."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PACKS.map((pack) => (
            <Button
              key={pack}
              variant="outline"
              onClick={() => {
                setError(null);
                topUp.mutate(pack);
              }}
              disabled={topUp.isPending}
            >
              <span className="font-semibold">{pack * 100} credits</span>
              <span className="text-xs text-muted-foreground">{money(4900 * pack)}</span>
            </Button>
          ))}
        </CardContent>
        {error ? <p className="px-5 pb-4 text-sm text-destructive">{error}</p> : null}
        {!topUp.isPending && orders.data?.length === 0 ? (
          <p className="px-5 pb-4 text-xs text-muted-foreground">
            Stripe keys are not configured: orders are recorded as pending here so the ledger flow stays testable.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Append-only. Rows are never edited or deleted.</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !ledger.data?.items.length ? (
            <Empty title="No credit movements yet" hint="Claiming a lead writes the first row." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Change</Th>
                  <Th className="text-right">Balance after</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.data.items.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap text-muted-foreground">{shortDate(entry.created_at)}</Td>
                    <Td>{entry.reason}</Td>
                    <Td className="text-right">
                      <Badge tone={entry.delta > 0 ? "success" : "muted"}>
                        {entry.delta > 0 ? "+" : ""}
                        {entry.delta}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{entry.balance_after}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Stripe checkout sessions for this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {!orders.data?.length ? (
            <Empty title="No orders yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Created</Th>
                  <Th>Credits</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {orders.data.map((order) => (
                  <tr key={order.id}>
                    <Td className="whitespace-nowrap">{relative(order.created_at)}</Td>
                    <Td>{order.credits}</Td>
                    <Td>{money(order.amount_cents, order.currency)}</Td>
                    <Td>
                      <Badge
                        tone={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "muted"}
                      >
                        {order.status}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {order.status === "pending" && order.checkout_url ? (
                        <a href={order.checkout_url} className="text-sm text-primary hover:underline">
                          Pay
                        </a>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <CreditsInner />
    </Suspense>
  );
}
