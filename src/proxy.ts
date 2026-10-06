import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv, hasSupabasePublicEnv } from "@/lib/env";
import { CURRENT_PATH_HEADER } from "@/lib/theme";

// Next.js 16 renamed the `middleware` file convention to `proxy`. This runs
// before every matched route so the Supabase access token is refreshed and the
// rotated cookies are written; Server Components cannot write cookies, so
// without this the session silently expires and the user appears logged out.
//
// It also forwards the current path and query string to Server Components as
// CURRENT_PATH_HEADER (the header theme toggle's `redirectTo`). Next strips its
// internal `_rsc` query parameter before the proxy sees the URL. The headers
// are re-cloned on every `next()` so cookies the Supabase client writes onto
// `request` below still reach the render.
export async function proxy(request: NextRequest) {
  const currentPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(CURRENT_PATH_HEADER, currentPath);
    return NextResponse.next({ request: { headers } });
  };

  if (!hasSupabasePublicEnv()) {
    return forward();
  }

  let response = forward();
  const { url, anonKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = forward();

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Triggers refresh-token rotation, which writes the new cookies via setAll.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
