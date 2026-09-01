export function LoadError({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
      Could not load {what} right now. This is a problem on our side, not an
      empty {what}. Refresh in a moment.
    </div>
  );
}
