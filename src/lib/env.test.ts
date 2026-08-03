import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSupabasePublicEnv,
  getSupabaseServiceRoleKey,
  hasSupabasePublicEnv,
  hasSupabaseServiceRoleEnv,
} from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasSupabasePublicEnv", () => {
  // This is the demo-mode switch: every read in platform.ts and every action
  // in actions.ts branches on it, so both halves must be present.
  it("is true only when both public vars are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(hasSupabasePublicEnv()).toBe(true);
  });

  it("is false when either var is missing or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(hasSupabasePublicEnv()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(hasSupabasePublicEnv()).toBe(false);
  });
});

describe("getSupabasePublicEnv", () => {
  it("returns both values when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(getSupabasePublicEnv()).toEqual({
      url: "https://project.supabase.co",
      anonKey: "anon-key",
    });
  });

  it("names the missing variable when it throws", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(() => getSupabasePublicEnv()).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

describe("service role key", () => {
  it("reports presence without returning the value", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    expect(hasSupabaseServiceRoleEnv()).toBe(true);

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(hasSupabaseServiceRoleEnv()).toBe(false);
  });

  it("throws rather than returning undefined when unset", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseServiceRoleKey()).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});
