import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { getCurrentUser } from "@/lib/server/platform";

/**
 * A route-local `not-found.tsx` is what keeps the 404 title. When the page
 * body throws `notFound()`, Next discards that segment's `generateMetadata`
 * output, so without the `metadata` export below the tab falls back to the
 * root layout's "Digital Brand Platform".
 */
export const metadata: Metadata = {
  title: "Poll not found",
  description: "This poll is not available.",
};

export default async function PostNotFound() {
  const currentUser = await getCurrentUser();

  return (
    <AppShell currentUser={currentUser}>
      <EmptyState
        title="Poll not found"
        description="This link points at a poll that does not exist, or one that has since been removed."
      />

      <p className="text-sm text-muted">
        <Link href="/" className="text-accent transition hover:underline">
          Back to the feed
        </Link>
      </p>
    </AppShell>
  );
}
