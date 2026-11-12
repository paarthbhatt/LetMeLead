"use client";

import { Clock3, GitBranch, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input, Label, Select, Textarea } from "@/components/ui";
import type { SequenceStepInput } from "@/lib/api";
import { normalizeSequence, stepDelayLabel, validateSequence } from "@/lib/outreach-campaigns";

export function OutreachSequenceEditor({
  steps,
  dirty,
  saving,
  disabled = false,
  onChange,
  onSave,
}: {
  steps: SequenceStepInput[];
  dirty: boolean;
  saving: boolean;
  disabled?: boolean;
  onChange: (steps: SequenceStepInput[]) => void;
  onSave: () => void;
}) {
  const issues = validateSequence(steps);
  const locked = saving || disabled;

  function updateStep(index: number, update: Partial<SequenceStepInput>) {
    onChange(steps.map((step, position) => position === index ? { ...step, ...update } : step));
  }

  function addStep() {
    onChange([...steps, {
      step_no: steps.length + 1,
      kind: steps.length ? "message" : "connect",
      body_template: steps.length ? "Following up on {signal} at {company}. Would a short conversation about {offer} be useful?" : "Hi, I noticed {signal} at {company}. Would love to connect.",
      delay_days: steps.length ? 4 : 0,
    }]);
  }

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><GitBranch className="size-4 text-blue-600 dark:text-blue-400" aria-hidden />Outreach sequence</CardTitle>
          <CardDescription>A purposeful first touch, then room to follow up.</CardDescription>
        </div>
        <Badge tone={dirty ? "warning" : "muted"}>{dirty ? "Unsaved changes" : steps.length ? "Saved version" : "No sequence"}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 text-xs leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
          <p>Use <span className="font-medium text-blue-600 dark:text-blue-400">{"{signal}"}, {"{company}"}, {"{offer}"}, {"{title}"}</span> to ground your message in evidence. Text without placeholders is personalized by the service, not used verbatim.</p>
        </div>

        {steps.length ? (
          <ol className="space-y-3">
            {steps.map((step, index) => {
              const bodyError = issues.find((issue) => issue.step === index + 1 && issue.field === "body_template");
              const delayError = issues.find((issue) => issue.step === index + 1 && issue.field === "delay_days");
              const kindError = issues.find((issue) => issue.step === index + 1 && issue.field === "kind");
              return (
                <li key={step.step_no} className="rounded-xl border bg-background/30 p-4">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-600 dark:text-blue-400">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{step.kind === "connect" ? "Connection request" : index === 0 ? "First message" : "Follow-up message"}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3" aria-hidden />{stepDelayLabel(step, index)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={locked || steps.length === 1}
                      onClick={() => onChange(normalizeSequence(steps.filter((_, position) => position !== index)))}
                    ><Trash2 className="size-3.5" aria-hidden /></Button>
                  </div>

                  <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="space-y-1.5">
                      <Label htmlFor={`step-kind-${index}`} className="text-xs">Channel action</Label>
                      <Select id={`step-kind-${index}`} value={step.kind} disabled={locked} aria-invalid={!!kindError} onChange={(event) => updateStep(index, { kind: event.target.value })}>
                        <option value="connect">LinkedIn connection request</option>
                        <option value="message">LinkedIn message</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`step-delay-${index}`} className="text-xs">{index ? "Follow-up delay (days)" : "Delay (days)"}</Label>
                      <Input
                        id={`step-delay-${index}`}
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        value={Number.isFinite(step.delay_days) ? step.delay_days : ""}
                        disabled={locked}
                        aria-invalid={!!delayError}
                        aria-describedby={delayError ? `step-delay-error-${index}` : `step-timing-${index}`}
                        onChange={(event) => updateStep(index, { delay_days: event.target.value === "" ? Number.NaN : Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`step-body-${index}`} className="text-xs">Message template</Label>
                    <Textarea
                      id={`step-body-${index}`}
                      value={step.body_template}
                      className="min-h-[120px] resize-y bg-card text-sm leading-relaxed"
                      maxLength={2000}
                      disabled={locked}
                      aria-invalid={!!bodyError}
                      aria-describedby={bodyError ? `step-body-error-${index}` : `step-timing-${index}`}
                      onChange={(event) => updateStep(index, { body_template: event.target.value })}
                    />
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
                    <p id={`step-timing-${index}`}>{index ? "Delay applies to automatic follow-ups after a recorded send. Manual queueing can bypass it." : "The first step starts when queued; its delay is not an initial waiting period."}</p>
                    <span className="shrink-0 tabular-nums">{step.body_template.length.toLocaleString()} / 2,000</span>
                  </div>
                  {bodyError ? <p id={`step-body-error-${index}`} className="mt-2 text-xs text-destructive">{bodyError.message}</p> : null}
                  {delayError ? <p id={`step-delay-error-${index}`} className="mt-2 text-xs text-destructive">{delayError.message}</p> : null}
                  {kindError ? <p className="mt-2 text-xs text-destructive">{kindError.message}</p> : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty title="Build your first touch" hint="Add a connection request or a message to begin this sequence." icon={<GitBranch className="size-5" />} action={<Button variant="outline" disabled={locked} onClick={addStep}><Plus className="size-4" aria-hidden />Add first step</Button>} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button variant="outline" onClick={addStep} disabled={locked || steps.length >= 10}><Plus className="size-4" aria-hidden />Add step <span className="text-muted-foreground">{steps.length}/10</span></Button>
          <Button onClick={onSave} disabled={locked || !dirty || !!issues.length}><Save className="size-4" aria-hidden />{saving ? "Saving…" : "Save sequence"}</Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Saving changes future queueing and previews. Messages already in the queue keep their original text.</p>
      </CardContent>
    </Card>
  );
}
