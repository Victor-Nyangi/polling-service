"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The fallback when something throws instead of redirecting with a notice:
 * an action that failed outright (the connection dropped mid-vote, the server
 * errored) or a page that failed to render. Expected failures never reach
 * here: actions report those through `?notice=`. Without this file, a failed
 * action left the visitor on Next's bare client-error screen.
 *
 * In production the message from a server error is a generic one with a
 * digest, so it is not shown; the digest is, so it can be matched to logs.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-xl content-center gap-4 bg-background px-6 py-16">
      <div
        role="alert"
        className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
      >
        <h1 className="font-display text-xl font-semibold">
          That didn&apos;t go through
        </h1>
        <p className="mt-2 text-sm leading-6">
          Something went wrong on our side, or the connection dropped. If you
          were voting or saving, it may not have been recorded. Try again, and
          check the result once the page reloads.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-full bg-accent-strong px-5 py-3 text-sm font-medium text-white transition hover:brightness-95 active:scale-[0.98]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-border px-5 py-3 text-sm font-medium transition hover:border-accent/50 active:scale-[0.98]"
        >
          Back to polls
        </Link>
      </div>
    </main>
  );
}
