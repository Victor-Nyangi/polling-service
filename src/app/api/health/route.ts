import { NextResponse } from "next/server";
import { hasSupabasePublicEnv, hasSupabaseServiceRoleEnv } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "digital-brand-platform",
    configured: {
      supabasePublicEnv: hasSupabasePublicEnv(),
      supabaseServiceRoleEnv: hasSupabaseServiceRoleEnv(),
    },
    timestamp: new Date().toISOString(),
  });
}
