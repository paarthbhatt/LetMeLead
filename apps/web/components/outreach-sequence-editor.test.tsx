import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import type { SequenceStepInput } from "@/lib/api";
import { OutreachSequenceEditor } from "./outreach-sequence-editor";

const steps: SequenceStepInput[] = [
  { step_no: 1, kind: "connect", body_template: "Hi {company}, I noticed {signal} and would love to connect.", delay_days: 0 },
  { step_no: 2, kind: "message", body_template: "Following up on {signal}. Would a quick conversation be useful?", delay_days: 4 },
];
const props = () => ({ steps, dirty: true, saving: false, onChange: vi.fn(), onSave: vi.fn() });

describe("sequence editor controls", () => {
  it("only saves a changed, valid sequence", () => {
    const input = props();
    const view = render(<OutreachSequenceEditor {...input} dirty={false} />);
    expect((screen.getByRole("button", { name: "Save sequence" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<OutreachSequenceEditor {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Save sequence" }));
    expect(input.onSave).toHaveBeenCalledTimes(1);
    view.rerender(<OutreachSequenceEditor {...input} steps={[{ ...steps[0], body_template: " " }]} />);
    expect((screen.getByRole("button", { name: "Save sequence" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Use between 5 and 2,000 characters of message text.")).toBeTruthy();
  });

  it("renumbers remaining steps on removal and preserves their text", () => {
    const input = props();
    render(<OutreachSequenceEditor {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(input.onChange).toHaveBeenCalledWith([{ ...steps[1], step_no: 1 }]);
  });

  it("never removes the final step or converts a blank delay into immediate sending", () => {
    const input = props();
    render(<OutreachSequenceEditor {...input} steps={[steps[0]]} />);
    expect((screen.getByRole("button", { name: "Remove step 1" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Delay (days)"), { target: { value: "" } });
    expect(Number.isNaN(input.onChange.mock.calls[0][0][0].delay_days)).toBe(true);
    expect(input.onSave).not.toHaveBeenCalled();
  });

  it("adds a clear follow-up without saving or sending it", () => {
    const input = props();
    render(<OutreachSequenceEditor {...input} />);
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    expect(input.onChange.mock.calls[0][0][2]).toMatchObject({ step_no: 3, kind: "message", delay_days: 4 });
    expect(input.onSave).not.toHaveBeenCalled();
  });

  it("locks fields during other outreach operations without claiming to save", () => {
    render(<OutreachSequenceEditor {...props()} disabled />);
    expect((screen.getAllByLabelText("Message template", { selector: "textarea" })[0] as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save sequence" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
