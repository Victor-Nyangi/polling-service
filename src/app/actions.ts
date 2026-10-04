"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSupabasePublicEnv } from "@/lib/env";
import { buildNoticeHref } from "@/lib/notice";
import { safeRedirectPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/username";

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function redirectTarget(formData: FormData, fallback = "/") {
  return safeRedirectPath(stringValue(formData, "redirectTo"), fallback);
}

function toHashtags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean);
}

async function redirectWithNotice(
  redirectTo: string,
  type: "success" | "error" | "info",
  message: string,
): Promise<never> {
  redirect(buildNoticeHref(redirectTo, type, message));
}

async function requireConfigured(redirectTo: string) {
  if (!hasSupabasePublicEnv()) {
    await redirectWithNotice(
      redirectTo,
      "info",
      "Connect Supabase in .env.local to enable persistent auth and data.",
    );
  }
}

async function requireAuthenticatedUser(redirectTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    await redirectWithNotice(
      redirectTo,
      "error",
      "Sign in first to complete that action.",
    );
  }

  if (!user) {
    throw new Error("Authenticated user missing after redirect guard.");
  }

  return { supabase, user };
}

async function appOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");

  if (origin) {
    return origin;
  }

  const host = requestHeaders.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function signInAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const email = stringValue(formData, "email");
  const password = stringValue(formData, "password");

  if (!email || !password) {
    await redirectWithNotice(redirectTo, "error", "Email and password are required.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  redirect(buildNoticeHref(redirectTo, "success", "Signed in successfully."));
}

export async function signUpAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const email = stringValue(formData, "email");
  const password = stringValue(formData, "password");

  if (!email || password.length < 8) {
    await redirectWithNotice(
      redirectTo,
      "error",
      "Use a valid email and a password with at least 8 characters.",
    );
  }

  const supabase = await createClient();
  const origin = await appOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  redirect(
    buildNoticeHref(
      redirectTo,
      "success",
      "Check your email for the confirmation link.",
    ),
  );
}

export async function signInWithGoogleAction() {
  await requireConfigured("/auth/login");
  const supabase = await createClient();
  const origin = await appOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=/`,
    },
  });

  if (error || !data.url) {
    await redirectWithNotice("/auth/login", "error", error?.message ?? "Unable to start Google sign-in.");
  }

  const providerUrl = data.url;

  if (!providerUrl) {
    throw new Error("OAuth provider URL missing after redirect guard.");
  }

  redirect(providerUrl);
}

export async function signOutAction() {
  if (!hasSupabasePublicEnv()) {
    redirect(buildNoticeHref("/", "info", "Demo mode does not persist sessions."));
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(buildNoticeHref("/", "success", "Signed out."));
}

export async function updateProfileAction(formData: FormData) {
  const redirectTo = redirectTarget(formData, "/onboarding");
  await requireConfigured(redirectTo);
  const username = stringValue(formData, "username");
  const displayName = stringValue(formData, "displayName");
  const bio = stringValue(formData, "bio");
  const interests = toHashtags(stringValue(formData, "interests"));

  if (!username || !displayName) {
    await redirectWithNotice(
      redirectTo,
      "error",
      "Username and display name are required.",
    );
  }

  // `handle_new_user()` seeds a safe `[a-z0-9_]` handle at sign-up and this
  // form is what overwrites it, so the format rule has to be enforced here or
  // not at all. A leading `@` and uppercase are normalised silently; anything
  // else is rejected with a message rather than rewritten into a handle the
  // user did not choose.
  const usernameCheck = validateUsername(username);

  if (!usernameCheck.ok) {
    await redirectWithNotice(redirectTo, "error", usernameCheck.message);
    throw new Error("Invalid username survived the redirect guard.");
  }

  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    username: usernameCheck.username,
    display_name: displayName,
    bio: bio || null,
    interests,
    onboarded_at: new Date().toISOString(),
  });

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/");
  revalidatePath("/onboarding");
  redirect(buildNoticeHref("/", "success", "Profile saved."));
}

export async function createPollPostAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const body = stringValue(formData, "body");
  const question = stringValue(formData, "question");
  const hashtags = toHashtags(stringValue(formData, "hashtags"));
  const options = ["option1", "option2", "option3", "option4"]
    .map((name) => stringValue(formData, name))
    .filter(Boolean);

  if (!question || options.length < 2) {
    await redirectWithNotice(
      redirectTo,
      "error",
      "Provide a question and at least two poll options.",
    );
  }

  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      body: body || null,
      hashtags,
    })
    .select("id")
    .single();

  if (postError || !post) {
    await redirectWithNotice(
      redirectTo,
      "error",
      postError?.message ?? "Unable to create the post.",
    );
  }

  if (!post) {
    throw new Error("Post missing after insert guard.");
  }

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .insert({
      post_id: post.id,
      question,
    })
    .select("id")
    .single();

  if (pollError || !poll) {
    await supabase.from("posts").delete().eq("id", post.id);
    await redirectWithNotice(
      redirectTo,
      "error",
      pollError?.message ?? "Unable to create the poll.",
    );
  }

  if (!poll) {
    throw new Error("Poll missing after insert guard.");
  }

  const { error: optionError } = await supabase.from("poll_options").insert(
    options.map((label, index) => ({
      poll_id: poll.id,
      label,
      position: index + 1,
    })),
  );

  if (optionError) {
    await supabase.from("posts").delete().eq("id", post.id);
    await redirectWithNotice(redirectTo, "error", optionError.message);
  }

  revalidatePath("/");
  redirect(buildNoticeHref("/", "success", "Poll post created."));
}

export async function voteOnPollAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const pollId = stringValue(formData, "pollId");
  const optionId = stringValue(formData, "optionId");
  const { supabase, user } = await requireAuthenticatedUser(redirectTo);

  const { data: existingVote } = await supabase
    .from("poll_votes")
    .select("id")
    .eq("poll_id", pollId)
    .eq("voter_id", user.id)
    .maybeSingle();

  if (existingVote) {
    await redirectWithNotice(
      redirectTo,
      "info",
      "Votes are immutable in the MVP once submitted.",
    );
  }

  const { error } = await supabase.from("poll_votes").insert({
    poll_id: pollId,
    option_id: optionId,
    voter_id: user.id,
  });

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/");
  redirect(buildNoticeHref(redirectTo, "success", "Vote recorded."));
}

export async function setReactionAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const postId = stringValue(formData, "postId");
  const reactionType = stringValue(formData, "reactionType");

  if (reactionType !== "like" && reactionType !== "dislike") {
    await redirectWithNotice(redirectTo, "error", "Invalid reaction type.");
  }

  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { data: existing } = await supabase
    .from("reactions")
    .select("id, reaction_type")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.reaction_type === reactionType) {
    const { error } = await supabase.from("reactions").delete().eq("id", existing.id);

    if (error) {
      await redirectWithNotice(redirectTo, "error", error.message);
    }

    revalidatePath("/");
    redirect(buildNoticeHref(redirectTo, "success", "Reaction removed."));
  }

  const { error } = await supabase.from("reactions").upsert(
    {
      post_id: postId,
      user_id: user.id,
      reaction_type: reactionType,
    },
    { onConflict: "post_id,user_id" },
  );

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/");
  redirect(buildNoticeHref(redirectTo, "success", "Reaction updated."));
}

export async function toggleRepostAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const postId = stringValue(formData, "postId");
  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { data: existing } = await supabase
    .from("reposts")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("reposts").delete().eq("id", existing.id);

    if (error) {
      await redirectWithNotice(redirectTo, "error", error.message);
    }

    revalidatePath("/");
    redirect(buildNoticeHref(redirectTo, "success", "Repost removed."));
  }

  const { error } = await supabase.from("reposts").insert({
    post_id: postId,
    user_id: user.id,
  });

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/");
  redirect(buildNoticeHref(redirectTo, "success", "Reposted to your profile."));
}

export async function createReportAction(formData: FormData) {
  const redirectTo = redirectTarget(formData);
  await requireConfigured(redirectTo);
  const targetType = stringValue(formData, "targetType");
  const targetPostId = stringValue(formData, "targetPostId");
  const targetUserId = stringValue(formData, "targetUserId");
  const reason = stringValue(formData, "reason");

  if (targetType !== "post" && targetType !== "user") {
    await redirectWithNotice(redirectTo, "error", "Invalid report target.");
  }

  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: targetType,
    target_post_id: targetType === "post" ? targetPostId : null,
    target_user_id: targetType === "user" ? targetUserId : null,
    reason: reason || "Reported from MVP workflow",
  });

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/moderation");
  redirect(buildNoticeHref(redirectTo, "success", "Report submitted."));
}

export async function markNotificationReadAction(formData: FormData) {
  const redirectTo = redirectTarget(formData, "/notifications");
  await requireConfigured(redirectTo);
  const notificationId = stringValue(formData, "notificationId");
  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id);

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/notifications");
  redirect(buildNoticeHref("/notifications", "success", "Notification marked as read."));
}

export async function reviewReportAction(formData: FormData) {
  const redirectTo = redirectTarget(formData, "/moderation");
  await requireConfigured(redirectTo);
  const reportId = stringValue(formData, "reportId");
  const status = stringValue(formData, "status");

  if (status !== "reviewed" && status !== "closed") {
    await redirectWithNotice(redirectTo, "error", "Invalid moderation status.");
  }

  const { supabase, user } = await requireAuthenticatedUser(redirectTo);
  const { error } = await supabase
    .from("reports")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    await redirectWithNotice(redirectTo, "error", error.message);
  }

  revalidatePath("/moderation");
  redirect(buildNoticeHref("/moderation", "success", "Report updated."));
}
