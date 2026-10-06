"use client";

import { useActionState, useEffect, useState } from "react";
import { issuePollInvitesAction } from "@/app/actions";
import {
  type IssueInvitesResult,
  MAX_INVITES_PER_BATCH,
  parseInviteLabels,
} from "@/lib/invite";

/**
 * The only Client Component in the app, and the reason it is one: the links
 * a batch of invites produces may be shown exactly once.
 *
 * They arrive as this component's action state, in the response to the POST
 * that issued them, and live only in this component's memory. Nothing writes
 * them to a cookie, storage, or a URL, so a reload, or leaving and coming
 * back, renders the page from the server, which no longer has them. The
 * action is wrapped so it is called with the form data alone: useActionState
 * would otherwise post the previous state, this batch's links, back to the
 * server with the next batch.
 *
 * Copying needs the clipboard API, which is the other half of why this runs in
 * the browser.
 */

const initialState: IssueInvitesResult = { status: "idle" };

function previewText(text: string) {
  if (text === "") {
    return `One line per invite, up to ${MAX_INVITES_PER_BATCH}. A blank line makes an unnamed invite.`;
  }

  const parsed = parseInviteLabels(text);

  if (!parsed.ok) {
    return parsed.message;
  }

  const total = parsed.labels.length;
  const noun = total === 1 ? "invite" : "invites";

  return `Issues ${total} ${noun}: ${parsed.named} named, ${parsed.unnamed} unnamed.`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // No clipboard access (an insecure origin, or permission denied).
          // The link is still selectable in its field.
        }
      }}
      className="shrink-0 rounded-full border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96]"
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function InviteIssuer({
  pollId,
  redirectTo,
}: {
  pollId: string;
  redirectTo: string;
}) {
  const [text, setText] = useState("");
  const [dismissed, setDismissed] = useState<IssueInvitesResult | null>(null);
  const [state, formAction, pending] = useActionState(
    async (_previous: IssueInvitesResult, formData: FormData) => {
      const result = await issuePollInvitesAction(formData);

      if (result.status === "issued") {
        setText("");
      }

      return result;
    },
    initialState,
  );

  // A page restored from the back/forward cache comes back with its memory
  // intact, links included. Reload it instead, so the server renders it again
  // without them.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const links = state.status === "issued" && dismissed !== state ? state.links : null;
  const allLinks = links
    ?.map((link) => (link.label ? `${link.label}: ${link.url}` : link.url))
    .join("\n");

  return (
    <div className="grid gap-4">
      {links ? (
        <div className="grid gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {links.length === 1 ? "1 invite link" : `${links.length} invite links`}
              </p>
              <p className="mt-1 text-sm">
                Copy these now. They won&apos;t be shown again: only a
                fingerprint of each link is stored, so a lost link can&apos;t
                be recovered, only revoked and replaced.
              </p>
            </div>
            {allLinks ? <CopyButton text={allLinks} label="Copy all" /> : null}
          </div>
          <ul className="grid gap-2">
            {links.map((link) => (
              <li key={link.url} className="grid gap-1">
                <span className="text-sm font-medium">
                  {link.label ?? "Unnamed"}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={link.url}
                    aria-label={`Invite link for ${link.label ?? "an unnamed invite"}`}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                  <CopyButton text={link.url} label="Copy" />
                </div>
              </li>
            ))}
          </ul>
          <div>
            <button
              type="button"
              onClick={() => setDismissed(state)}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:border-accent/50 active:scale-[0.97]"
            >
              I&apos;ve copied them, hide the links
            </button>
          </div>
        </div>
      ) : null}

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="pollId" value={pollId} />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Who are the invites for?</span>
          <textarea
            name="labels"
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"Ada Lovelace\nGrace Hopper"}
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </label>
        <p className="text-sm text-muted" aria-live="polite">
          {previewText(text)}
        </p>
        <p className="text-sm text-muted">
          Labels are for you. Only you see them, and nobody, you included, can
          see which option an invite chose.
        </p>
        {state.status === "error" ? (
          <p
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {state.message}
          </p>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent-strong px-5 py-3 text-sm font-medium text-white transition hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? "Issuing..." : "Issue invite links"}
          </button>
        </div>
      </form>
    </div>
  );
}
