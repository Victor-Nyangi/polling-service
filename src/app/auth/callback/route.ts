import { NextResponse } from "next/server";
import { hasSupabasePublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const safeNext = safeRedirectPath(url.searchParams.get("next"));

  if (!hasSupabasePublicEnv()) {
    return NextResponse.redirect(
      new URL(
        `/auth/login?notice=info&message=${encodeURIComponent(
          "Configure Supabase before using auth callbacks.",
        )}`,
        url.origin,
      ),
    );
  }

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
