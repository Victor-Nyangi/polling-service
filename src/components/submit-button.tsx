"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { pendingButtonState, updatePendingSet } from "@/lib/pending";
import { Spinner } from "./spinner";

/**
 * The submit button for every `<form action={serverAction}>` in the app.
 *
 * The forms stay in Server Components and keep posting to the actions in
 * `src/app/actions.ts`; only the button runs in the browser, because
 * `useFormStatus` is how it learns its form is in flight. From the click
 * until the redirect's page has rendered, the button is disabled (no double
 * submit, including Enter in a field), carries `aria-busy`, shows a spinner
 * and its pending label, and a polite status region says the same thing to
 * screen readers. The redirect's notice then reports how it went.
 *
 * Before hydration the forms still post natively, so nothing here is needed
 * for an action to work.
 */

type GroupContextValue = {
  busy: boolean;
  report: (id: string, pending: boolean) => void;
};

const PendingGroupContext = createContext<GroupContextValue | null>(null);

/**
 * Locks several separate forms together: while any one is in flight, every
 * button in the group is disabled. A poll's options are one form each, so
 * without this a second option could be voted while the first is still
 * being recorded.
 */
export function PendingGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback((id: string, pending: boolean) => {
    setInFlight((current) => updatePendingSet(current, id, pending));
  }, []);
  const busy = inFlight.size > 0;
  const value = useMemo(() => ({ busy, report }), [busy, report]);

  return (
    <PendingGroupContext value={value}>
      <div className={className} aria-busy={busy || undefined}>
        {children}
      </div>
    </PendingGroupContext>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  pendingContent,
  className = "",
  name,
  value,
  ...rest
}: {
  children: React.ReactNode;
  /** Shown and announced while this button's action is in flight, e.g. "Voting…". */
  pendingLabel: string;
  /** Replaces the default spinner + label, for buttons whose content has a layout to keep. */
  pendingContent?: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "disabled" | "name" | "value" | "children"
>) {
  const { pending, data } = useFormStatus();
  const group = useContext(PendingGroupContext);
  const id = useId();
  const report = group?.report;

  useEffect(() => {
    report?.(id, pending);
  }, [report, id, pending]);

  useEffect(() => {
    return () => report?.(id, false);
  }, [report, id]);

  const state = pendingButtonState({
    formPending: pending,
    data,
    name,
    value,
    groupBusy: group?.busy,
  });

  return (
    <>
      <button
        {...rest}
        type="submit"
        name={name}
        value={value}
        disabled={state.disabled}
        aria-busy={state.busy || undefined}
        className={`${className} disabled:cursor-not-allowed ${
          state.disabled && !state.busy ? "disabled:opacity-60" : ""
        }`}
      >
        {state.busy
          ? (pendingContent ?? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner />
                {pendingLabel}
              </span>
            ))
          : children}
      </button>
      <span role="status" className="sr-only">
        {state.busy ? pendingLabel : ""}
      </span>
    </>
  );
}
