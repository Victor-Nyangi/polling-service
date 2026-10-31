/**
 * Pending-state rules for the submit buttons, kept out of the component so
 * they can be unit tested without a DOM.
 *
 * A form action is "in flight" from the moment it is submitted until the page
 * it redirects to has rendered. While it is, its trigger is disabled, so a
 * second click or an Enter in a field (implicit submission skips a disabled
 * default button) can't post it twice.
 */

/** What a submit button needs to know about the form around it. */
export type PendingInput = {
  /** `useFormStatus().pending`: this button's form is in flight. */
  formPending: boolean;
  /** `useFormStatus().data`: what that form submitted, submitter included. */
  data: Pick<FormData, "get"> | null;
  /** The button's own `name`/`value`, when several buttons share a form. */
  name?: string;
  value?: string;
  /** Another form in the same `PendingGroup` is in flight. */
  groupBusy?: boolean;
};

export type PendingState = {
  /** The trigger can't be pressed. */
  disabled: boolean;
  /** This button's own submission is the one in flight: show its pending label. */
  busy: boolean;
};

/**
 * Whether this button is the one that submitted its form. A button with no
 * name is the form's only trigger, so any pending submission is its own.
 * With a name, the submitted data carries the pressed button's name=value.
 */
export function isSubmitter(
  data: PendingInput["data"],
  name?: string,
  value?: string,
): boolean {
  if (!name) {
    return true;
  }

  return data?.get(name) === (value ?? "");
}

export function pendingButtonState({
  formPending,
  data,
  name,
  value,
  groupBusy = false,
}: PendingInput): PendingState {
  const busy = formPending && isSubmitter(data, name, value);

  return {
    busy,
    disabled: formPending || groupBusy,
  };
}

/**
 * The set of in-flight forms in a `PendingGroup`, updated as each button
 * reports. Returns the same set when nothing changed, so React can skip the
 * re-render.
 */
export function updatePendingSet(
  current: ReadonlySet<string>,
  id: string,
  pending: boolean,
): ReadonlySet<string> {
  if (current.has(id) === pending) {
    return current;
  }

  const next = new Set(current);

  if (pending) {
    next.add(id);
  } else {
    next.delete(id);
  }

  return next;
}

/**
 * The words a trigger shows while its action is in flight. One place, so the
 * whole app speaks the same way, and the status region reads the same text.
 */
export const PENDING_LABELS = {
  publish: "Publishing…",
  vote: "Voting…",
  report: "Reporting…",
  openPoll: "Opening it up…",
  restrictPoll: "Making it invite-only…",
  issueInvites: "Issuing links…",
  revokeInvite: "Revoking…",
  signIn: "Signing in…",
  signInWithGoogle: "Opening Google…",
  signUp: "Creating account…",
  signOut: "Signing out…",
  saveProfile: "Saving…",
  markRead: "Marking…",
  markReviewed: "Marking reviewed…",
  closeReport: "Closing…",
  theme: "Switching theme…",
} as const;
