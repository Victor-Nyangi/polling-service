import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { getCurrentUser } from "@/lib/server/platform";

/**
 * See `src/app/p/[postId]/not-found.tsx` — the `metadata` export is what
 * survives the `notFound()` throw in the page body.
 */
export const metadata: Metadata = {
  title: "Profile not found",
  description: "This profile is not available.",
};

export default async function ProfileNotFound() {
  const currentUser = await getCurrentUser();

  return (
    <AppShell currentUser={currentUser}>
      <EmptyState
        title="Profile not found"
        description="No account uses that handle. It may have been changed, or the account may have been removed."
      />

      <p className="text-sm text-muted">
        <Link href="/" className="text-accent transition hover:underline">
          Back to the feed
        </Link>
      </p>
    </AppShell>
  );
}
