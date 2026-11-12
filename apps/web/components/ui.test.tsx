import { fireEvent, render, screen, within } from "@testing-library/react";
import { Radio } from "lucide-react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Avatar, Button, CardContent, Dialog, Empty, Input, Label, Notice, Select, Stat, StatusBadge, Textarea } from "./ui";

describe("shared primitives", () => {
  it("keeps native control semantics and forwards refs", () => {
    const inputRef = React.createRef<HTMLInputElement>();
    const selectRef = React.createRef<HTMLSelectElement>();
    const buttonRef = React.createRef<HTMLButtonElement>();
    const change = vi.fn();
    render(<><Label htmlFor="name">Name</Label><Input id="name" ref={inputRef} /><Label htmlFor="notes">Notes</Label><Textarea id="notes" /><Label htmlFor="status">Status</Label><Select id="status" ref={selectRef} defaultValue="new" onChange={change}><option value="new">New</option><option value="claimed">Claimed</option></Select><Button ref={buttonRef}>Action</Button><Button type="submit">Submit</Button></>);
    expect(screen.getByRole("textbox", { name: "Name" })).toBe(inputRef.current);
    expect(screen.getByRole("textbox", { name: "Notes" }).tagName).toBe("TEXTAREA");
    expect(screen.getByRole("combobox", { name: "Status" })).toBe(selectRef.current);
    fireEvent.change(selectRef.current!, { target: { value: "claimed" } });
    expect(selectRef.current?.value).toBe("claimed");
    expect(change).toHaveBeenCalledOnce();
    expect(buttonRef.current?.type).toBe("button");
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).type).toBe("submit");
  });

  it("allows callers to remove all card padding", () => {
    render(<CardContent className="p-0" data-testid="content">Rows</CardContent>);
    const classes = screen.getByTestId("content").className;
    expect(classes).toContain("p-0");
    expect(classes).not.toContain("p-6");
  });

  it("announces errors and non-error notices with appropriate roles", () => {
    render(<><Notice tone="error">Something failed</Notice><Notice tone="success">Saved</Notice><Notice tone="info">Useful information</Notice></>);
    expect(screen.getByRole("alert").textContent).toBe("Something failed");
    expect(screen.getAllByRole("status").map((element) => element.textContent)).toEqual(["Saved", "Useful information"]);
  });

  it("supports optional icons and actions in stats and empty states", () => {
    const action = vi.fn();
    render(<><Stat label="Leads" value={0} hint="No leads yet" /><Stat label="Signals" value={12} icon={Radio} /><Empty title="Your next lead is out there" hint="Run a scan to get started." icon={<Radio />} action={<Button onClick={action}>Find leads</Button>} /></>);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find leads" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("renders accessible initials and readable statuses", () => {
    render(<><Avatar name="Jane Rivera" /><Avatar name="alex.smith@example.com" /><StatusBadge status="not_fit" /><StatusBadge status="active" /></>);
    expect(screen.getByRole("img", { name: "Jane Rivera" }).textContent).toBe("JR");
    expect(screen.getByRole("img", { name: "alex.smith@example.com" }).textContent).toBe("AS");
    expect(screen.getByText("not fit")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
  });
});

function DialogHarness() {
  const [open, setOpen] = React.useState(false);
  return <><Button onClick={() => setOpen(true)}>Open test dialog</Button><Dialog open={open} onOpenChange={setOpen} title="Review your lead" description="Look at the evidence before claiming." className="max-w-xl" footer={<Button>Confirm claim</Button>}><Label htmlFor="reason">Reason</Label><Input id="reason" data-autofocus /></Dialog></>;
}

describe("Dialog", () => {
  it("labels its content, traps focus, closes with Escape, and restores focus", () => {
    const { container } = render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open test dialog" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Review your lead" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Look at the evidence before claiming.");
    expect(dialog.className).toContain("max-w-xl");
    expect(container.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(within(dialog).getByRole("textbox", { name: "Reason" }));

    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm claim" });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(container.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes only when clicking the backdrop, not the content", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open test dialog" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps a parent modal locked while a nested modal closes", () => {
    function NestedDialogs() {
      const [first, setFirst] = React.useState(false);
      const [second, setSecond] = React.useState(false);
      return <><Button onClick={() => setFirst(true)}>Open parent</Button><Dialog open={first} onOpenChange={setFirst} title="Parent"><Button onClick={() => setSecond(true)}>Open child</Button><Dialog open={second} onOpenChange={setSecond} title="Child">Child content</Dialog></Dialog></>;
    }
    render(<NestedDialogs />);
    fireEvent.click(screen.getByRole("button", { name: "Open parent" }));
    const childTrigger = within(screen.getByRole("dialog", { name: "Parent" })).getByRole("button", { name: "Open child" });
    childTrigger.focus();
    fireEvent.click(childTrigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Child" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Parent" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(childTrigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
