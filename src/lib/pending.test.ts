import { describe, expect, it } from "vitest";
import {
  PENDING_LABELS,
  isSubmitter,
  pendingButtonState,
  updatePendingSet,
} from "./pending";

function formData(entries: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

describe("pendingButtonState", () => {
  it("is idle and pressable when nothing is in flight", () => {
    expect(pendingButtonState({ formPending: false, data: null })).toEqual({
      busy: false,
      disabled: false,
    });
  });

  it("disables and shows pending while its own form is in flight", () => {
    expect(
      pendingButtonState({ formPending: true, data: formData({ pollId: "p1" }) }),
    ).toEqual({ busy: true, disabled: true });
  });

  it("disables, without the pending label, while a sibling form in its group is in flight", () => {
    expect(
      pendingButtonState({ formPending: false, data: null, groupBusy: true }),
    ).toEqual({ busy: false, disabled: true });
  });

  it("shows pending only on the pressed button of a shared form", () => {
    const data = formData({ theme: "dark" });

    expect(
      pendingButtonState({ formPending: true, data, name: "theme", value: "dark" }),
    ).toEqual({ busy: true, disabled: true });
    expect(
      pendingButtonState({ formPending: true, data, name: "theme", value: "light" }),
    ).toEqual({ busy: false, disabled: true });
  });

  it("goes back to idle once the form settles, even if the group is still clearing", () => {
    expect(
      pendingButtonState({ formPending: false, data: null, groupBusy: false }),
    ).toEqual({ busy: false, disabled: false });
  });
});

describe("isSubmitter", () => {
  it("treats an unnamed button as its form's only trigger", () => {
    expect(isSubmitter(null)).toBe(true);
  });

  it("matches a named button against the submitted value", () => {
    const data = formData({ theme: "system" });

    expect(isSubmitter(data, "theme", "system")).toBe(true);
    expect(isSubmitter(data, "theme", "dark")).toBe(false);
  });

  it("does not match a named button when there is no submission data", () => {
    expect(isSubmitter(null, "theme", "dark")).toBe(false);
  });
});

describe("updatePendingSet", () => {
  it("adds and removes in-flight ids", () => {
    const added = updatePendingSet(new Set(), "a", true);
    expect([...added]).toEqual(["a"]);

    const removed = updatePendingSet(added, "a", false);
    expect(removed.size).toBe(0);
  });

  it("returns the same set when nothing changed", () => {
    const current = new Set(["a"]);

    expect(updatePendingSet(current, "a", true)).toBe(current);
    expect(updatePendingSet(current, "b", false)).toBe(current);
  });

  it("stays busy until every form in the group has settled", () => {
    let set: ReadonlySet<string> = new Set();
    set = updatePendingSet(set, "a", true);
    set = updatePendingSet(set, "b", true);
    set = updatePendingSet(set, "a", false);

    expect(set.size).toBe(1);
  });
});

describe("PENDING_LABELS", () => {
  it("are all non-empty and read as in progress", () => {
    for (const label of Object.values(PENDING_LABELS)) {
      expect(label.length).toBeGreaterThan(1);
      expect(label.endsWith("…")).toBe(true);
    }
  });
});
