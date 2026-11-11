"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell";
import { Badge, Card, CardContent, Empty, Skeleton, Table, Td, Th } from "@/components/ui";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/utils";

export default function AuditPage() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: api.audit });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every outreach action, claim, key change and billing event, with the actor that caused it."
      />
      <Card>
        <CardContent>
          {audit.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !audit.data?.items.length ? (
            <Empty title="Nothing logged yet" hint="Actions appear here as soon as you use the workspace." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Action</Th>
                  <Th>Actor</Th>
                  <Th>Target</Th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap text-muted-foreground">{shortDate(entry.created_at)}</Td>
                    <Td>
                      <code className="text-xs">{entry.action}</code>
                    </Td>
                    <Td>
                      <Badge tone={entry.actor_type === "system" ? "muted" : "default"}>{entry.actor_type}</Badge>
                      {entry.actor_id ? (
                        <span className="ml-2 text-xs text-muted-foreground">{entry.actor_id.slice(0, 8)}</span>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {entry.target_type ?? "—"}
                      {entry.target_id ? ` · ${entry.target_id.slice(0, 8)}` : ""}
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
