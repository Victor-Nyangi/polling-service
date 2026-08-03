export function LoadError({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      Could not load {what} right now. This is a problem on our side, not an
      empty {what} — refresh in a moment.
    </div>
  );
}
