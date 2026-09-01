export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}
