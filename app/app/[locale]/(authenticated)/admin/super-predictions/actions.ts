"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth-guard";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const SUPER_ADMIN_EMAIL = "albert.fernandez@puma.com";

function parseLocale(value: FormDataEntryValue | null) {
  const locale = String(value ?? "").trim();
  return ["en", "es", "it", "pt"].includes(locale) ? locale : "es";
}

function parseScore(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  const score = Number(text);

  if (!text || !Number.isInteger(score) || score < 0 || score > 99) {
    return null;
  }

  return score;
}

function buildRedirect(params: {
  locale: string;
  userId?: string;
  matchId?: string;
  success?: string;
  error?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.userId) searchParams.set("userId", params.userId);
  if (params.matchId) searchParams.set("matchId", params.matchId);
  if (params.success) searchParams.set("success", params.success);
  if (params.error) searchParams.set("error", params.error);

  const query = searchParams.toString();
  return `/${params.locale}/admin/super-predictions${query ? `?${query}` : ""}`;
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function updateSuperAdminPredictionAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  const userId = String(formData.get("user_id") ?? "").trim();
  const matchId = String(formData.get("match_id") ?? "").trim();
  const predictionId = String(formData.get("prediction_id") ?? "").trim();
  const homeScore = parseScore(formData.get("home_score_pred"));
  const awayScore = parseScore(formData.get("away_score_pred"));

  if (!userId || !matchId || !predictionId || homeScore === null || awayScore === null) {
    redirect(buildRedirect({ locale, userId, matchId, error: "invalid-input" }));
  }

  const { user: adminUser } = await requireAuthenticatedUser({ requireAdmin: true });
  const admin = getSupabaseAdminClient();

  const { data: adminProfile, error: adminProfileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", adminUser.id)
    .maybeSingle();

  const isSuperAdmin =
    normalizeEmail(adminUser.email) === SUPER_ADMIN_EMAIL ||
    normalizeEmail(adminProfile?.email) === SUPER_ADMIN_EMAIL;

  if (adminProfileError || !isSuperAdmin) {
    redirect(`/${locale}/admin`);
  }

  const [{ data: prediction, error: predictionError }, { data: match, error: matchError }] =
    await Promise.all([
      admin
        .from("predictions")
        .select("id, user_id, match_id, home_score_pred, away_score_pred")
        .eq("id", predictionId)
        .eq("user_id", userId)
        .eq("match_id", matchId)
        .maybeSingle(),
      admin
        .from("matches")
        .select("id, status, match_datetime, home_team, away_team")
        .eq("id", matchId)
        .maybeSingle(),
    ]);

  if (predictionError || matchError || !prediction || !match) {
    redirect(buildRedirect({ locale, userId, matchId, error: "not-found" }));
  }

  if (match.status !== "live" && match.status !== "finished") {
    redirect(buildRedirect({ locale, userId, matchId, error: "match-not-editable" }));
  }

  const previousPrediction = {
    home_score_pred: prediction.home_score_pred,
    away_score_pred: prediction.away_score_pred,
  };
  const nextPrediction = {
    home_score_pred: homeScore,
    away_score_pred: awayScore,
  };

  const { error: updateError } = await admin
    .from("predictions")
    .update(nextPrediction)
    .eq("id", prediction.id)
    .eq("user_id", userId)
    .eq("match_id", matchId);

  if (updateError) {
    console.error("[updateSuperAdminPredictionAction]", updateError);
    redirect(buildRedirect({ locale, userId, matchId, error: "save-failed" }));
  }

  const { error: auditError } = await admin.from("admin_audit_logs").insert({
    admin_user_id: adminUser.id,
    target_user_id: userId,
    action: "super_admin_prediction_updated",
    details: {
      prediction_id: prediction.id,
      match_id: matchId,
      match: `${match.home_team} vs ${match.away_team}`,
      match_status: match.status,
      previous: previousPrediction,
      next: nextPrediction,
    },
  });

  if (auditError) {
    console.error("[updateSuperAdminPredictionAction][audit]", auditError);
  }

  revalidatePath(`/${locale}/admin/super-predictions`);
  revalidatePath(`/${locale}/ranking`);
  revalidatePath(`/${locale}/my-predictions`);
  revalidatePath(`/${locale}/match/${matchId}`);

  redirect(buildRedirect({ locale, userId, matchId, success: "prediction-updated" }));
}
