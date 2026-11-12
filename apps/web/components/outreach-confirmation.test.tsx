import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { OutreachConfirmation } from "./outreach-confirmation";

function props() {
  return {
    open: true,
    onOpenChange: vi.fn(),
    action: "send" as const,
    campaignName: "Compliance conversations",
    scope: "One claimed lead: Acme.",
    pending: false,
    onConfirm: vi.fn(),
  };
}

describe("outreach confirmation", () => {
  it("never calls the sender before the explicit acknowledgement", () => {
    const input = props();
    render(<OutreachConfirmation {...input} />);
    const confirm = screen.getByRole("button", { name: "Confirm & run sender" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(input.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(input.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("resets acknowledgement when the action or recipient scope changes", () => {
    const input = props();
    const view = render(<OutreachConfirmation {...input} />);
    fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<OutreachConfirmation {...input} action="resume" />);
    expect((screen.getByRole("button", { name: "Resume campaign" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<OutreachConfirmation {...input} action="resume" scope="Two claimed leads: Acme and Other." />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("cancels without sending and cannot dismiss a pending request", () => {
    const input = props();
    const view = render(<OutreachConfirmation {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input.onOpenChange).toHaveBeenCalledWith(false);
    expect(input.onConfirm).not.toHaveBeenCalled();
    input.onOpenChange.mockClear();
    view.rerender(<OutreachConfirmation {...input} pending />);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(input.onOpenChange).not.toHaveBeenCalled();
  });

  it("still treats reported dry-run mode and queueing as send-capable", () => {
    render(<OutreachConfirmation {...props()} action="queue" dryRun error="Queue status could not be confirmed." />);
    expect(screen.getByText(/Manual queueing does not enforce follow-up delays/)).toBeTruthy();
    expect(screen.getByText(/Settings can change/)).toBeTruthy();
    expect(screen.getByText(/I understand this action may send LinkedIn messages/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm & queue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Queue status could not be confirmed");
  });
});
