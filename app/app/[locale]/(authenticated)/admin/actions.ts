"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type MatchStatus = "upcoming" | "live" | "finished";

function parseNullableScore(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const num = Number(text);
  if (Number.isNaN(num)) return null;

  return num;
}

function parseNullableText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseNullableDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function parseCheckbox(value: FormDataEntryValue | null) {
  return value === "true";
}

function parseLocale(value: FormDataEntryValue | null) {
  const locale = String(value ?? "").trim();
  return locale === "en" ? "en" : "es";
}

function withLocale(locale: string, path: string) {
  return `/${locale}${path}`;
}

async function requireAdmin(locale: string) {
  const supabase = await getSupabaseServerClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect(withLocale(locale, "/login"));
  }

  const userId = claimsData.claims.sub;

  if (!userId) {
    redirect(withLocale(locale, "/login"));
  }

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (meError) {
    throw new Error(`Error comprobando permisos admin: ${meError.message}`);
  }

  if (!me || me.role !== "admin" || !me.is_active) {
    redirect(withLocale(locale, ""));
  }

  return userId;
}

function revalidateAdminSurfaces(locale: string) {
  revalidatePath(withLocale(locale, "/admin"));
  revalidatePath(withLocale(locale, "/admin/users"));
  revalidatePath(withLocale(locale, "/admin/matches"));
  revalidatePath(withLocale(locale, ""));
  revalidatePath(withLocale(locale, "/ranking"));
  revalidatePath(withLocale(locale, "/my-predictions"));
}

function buildMatchesRedirectUrl(params: {
  locale: string;
  filterStatus?: string | null;
  success?: string;
  error?: string;
  detail?: string | null;
}) {
  const searchParams = new URLSearchParams();

  if (params.filterStatus && params.filterStatus !== "all") {
    searchParams.set("status", params.filterStatus);
  }

  if (params.success) {
    searchParams.set("success", params.success);
  }

  if (params.error) {
    searchParams.set("error", params.error);
  }

  if (params.detail) {
    searchParams.set("detail", params.detail.slice(0, 500));
  }

  const query = searchParams.toString();
  const base = withLocale(params.locale, "/admin/matches");
  return query ? `${base}?${query}` : base;
}

function redirectMatchError(
  locale: string,
  code: string,
  filterStatus?: string | null,
  detail?: string | null,
): never {
  redirect(buildMatchesRedirectUrl({ locale, filterStatus, error: code, detail }));
}

function redirectMatchSuccess(locale: string, code: string, filterStatus?: string | null): never {
  redirect(buildMatchesRedirectUrl({ locale, filterStatus, success: code }));
}

function redirectUserError(locale: string, code: string): never {
  redirect(withLocale(locale, `/admin/users?error=${code}`));
}

function redirectUserSuccess(locale: string, code: string): never {
  redirect(withLocale(locale, `/admin/users?success=${code}`));
}

function redirectAdminError(locale: string, code: string): never {
  redirect(withLocale(locale, `/admin?error=${code}`));
}

function redirectAdminSuccess(locale: string, code: string): never {
  redirect(withLocale(locale, `/admin?success=${code}`));
}

function getErrorDetail(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : null;
  }

  const source = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  return [
    typeof source.code === "string" ? `code: ${source.code}` : null,
    typeof source.message === "string" ? source.message : null,
    typeof source.details === "string" ? source.details : null,
    typeof source.hint === "string" ? `hint: ${source.hint}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;");
}

export async function createMatchAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  await requireAdmin(locale);
  const supabaseAdmin = getSupabaseAdminClient();

  const filterStatus = String(formData.get("filter_status") ?? "all");

  const stage = parseNullableText(formData.get("stage"));
  const matchDatetime = parseNullableDateTime(formData.get("match_datetime"));
  const homeTeam = parseNullableText(formData.get("home_team"));
  const awayTeam = parseNullableText(formData.get("away_team"));
  const homeFlag = parseNullableText(formData.get("home_flag"));
  const awayFlag = parseNullableText(formData.get("away_flag"));
  const matchStatus = String(
    formData.get("match_status") ?? "upcoming"
  ) as MatchStatus;

  const isPumaMatch = parseCheckbox(formData.get("is_puma_match"));
  const isVisible = parseCheckbox(formData.get("is_visible"));
  const isPredictionOpen = parseCheckbox(formData.get("is_prediction_open"));

  if (!homeTeam || !awayTeam) {
    redirectMatchError(locale, "match-create", filterStatus);
  }

  if (homeTeam === awayTeam) {
    redirectMatchError(locale, "match-create", filterStatus);
  }

  const payload = {
    stage,
    match_datetime: matchDatetime,
    home_team: homeTeam,
    away_team: awayTeam,
    home_flag: homeFlag,
    away_flag: awayFlag,
    status: matchStatus,
    is_puma_match: isPumaMatch,
    is_visible: isVisible,
    is_prediction_open: isPredictionOpen,
    home_score: null,
    away_score: null,
  };

  const { error } = await supabaseAdmin.from("matches").insert(payload);

  if (error) {
    console.error("[createMatchAction]", error);
    redirectMatchError(locale, "match-create", filterStatus);
  }

  revalidateAdminSurfaces(locale);
  redirectMatchSuccess(locale, "match-created", filterStatus);
}

export async function updateMatchAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  const filterStatus = String(formData.get("filter_status") ?? "all");

  try {
    await requireAdmin(locale);
    const supabaseAdmin = getSupabaseAdminClient();

    const id = String(formData.get("id") ?? "");

    const stage = parseNullableText(formData.get("stage"));
    const matchDatetime = parseNullableDateTime(formData.get("match_datetime"));
    const homeTeam = parseNullableText(formData.get("home_team"));
    const awayTeam = parseNullableText(formData.get("away_team"));
    const homeFlag = parseNullableText(formData.get("home_flag"));
    const awayFlag = parseNullableText(formData.get("away_flag"));
    const matchStatus = String(
      formData.get("match_status") ?? "upcoming"
    ) as MatchStatus;

    const isPumaMatch = parseCheckbox(formData.get("is_puma_match"));
    const isVisible = parseCheckbox(formData.get("is_visible"));
    const isPredictionOpen = parseCheckbox(formData.get("is_prediction_open"));

    const homeScore = parseNullableScore(formData.get("home_score"));
    const awayScore = parseNullableScore(formData.get("away_score"));

    if (!id || !homeTeam || !awayTeam || homeTeam === awayTeam) {
      redirectMatchError(locale, "match-update", filterStatus);
    }

    if ((homeScore !== null && homeScore < 0) || (awayScore !== null && awayScore < 0)) {
      redirectMatchError(locale, "match-update", filterStatus);
    }

    const payload: {
      stage: string | null;
      match_datetime: string | null;
      home_team: string | null;
      away_team: string | null;
      home_flag: string | null;
      away_flag: string | null;
      status: MatchStatus;
      is_puma_match: boolean;
      is_visible: boolean;
      is_prediction_open: boolean;
      home_score: number | null;
      away_score: number | null;
    } = {
      stage,
      match_datetime: matchDatetime,
      home_team: homeTeam,
      away_team: awayTeam,
      home_flag: homeFlag,
      away_flag: awayFlag,
      status: matchStatus,
      is_puma_match: isPumaMatch,
      is_visible: isVisible,
      is_prediction_open: isPredictionOpen,
      home_score: homeScore,
      away_score: awayScore,
    };

    if (matchStatus === "upcoming") {
      payload.home_score = null;
      payload.away_score = null;
    }

    const { error } = await supabaseAdmin
      .from("matches")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("[updateMatchAction]", error);
      redirectMatchError(locale, "match-update", filterStatus, getErrorDetail(error));
    }

    revalidateAdminSurfaces(locale);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("[updateMatchAction][unexpected]", error);
    redirectMatchError(locale, "match-update", filterStatus, getErrorDetail(error));
  }

  redirectMatchSuccess(locale, "match-updated", filterStatus);
}

export async function deleteMatchAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  await requireAdmin(locale);
  const supabaseAdmin = getSupabaseAdminClient();

  const id = String(formData.get("id") ?? "");
  const filterStatus = String(formData.get("filter_status") ?? "all");

  if (!id) {
    redirectMatchError(locale, "match-delete", filterStatus);
  }

  const { error } = await supabaseAdmin.from("matches").delete().eq("id", id);

  if (error) {
    console.error("[deleteMatchAction]", error);
    redirectMatchError(locale, "match-delete", filterStatus);
  }

  revalidateAdminSurfaces(locale);
  redirectMatchSuccess(locale, "match-deleted", filterStatus);
}

export async function toggleUserActiveAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  await requireAdmin(locale);
  const supabaseAdmin = getSupabaseAdminClient();

  const id = String(formData.get("id") ?? "");
  const nextValueRaw = String(formData.get("next_is_active") ?? "");

  if (!id) {
    redirectUserError(locale, "user-toggle");
  }

  if (nextValueRaw !== "true" && nextValueRaw !== "false") {
    redirectUserError(locale, "user-toggle");
  }

  const nextIsActive = nextValueRaw === "true";

  const supabase = await getSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(withLocale(locale, "/login"));
  }

  const currentAdminId = claimsData.claims.sub;

  if (id === currentAdminId) {
    redirectUserError(locale, "user-toggle-self");
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[toggleUserActiveAction]", error);
    redirectUserError(locale, "user-toggle");
  }

  const { error: auditError } = await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: currentAdminId,
    target_user_id: id,
    action: nextIsActive ? "user_activated" : "user_deactivated",
    details: {
      is_active: nextIsActive,
    },
  });

  if (auditError) {
    console.error("[toggleUserActiveAction][audit]", auditError);
  }

  revalidateAdminSurfaces(locale);
  redirectUserSuccess(locale, nextIsActive ? "user-activated" : "user-deactivated");
}

export async function generateRankingSnapshotAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  await requireAdmin(locale);

  const snapshotKey = String(formData.get("snapshot_key") ?? "").trim();
  const snapshotLabel = String(formData.get("snapshot_label") ?? "").trim();

  if (!snapshotKey) {
    redirectAdminError(locale, "snapshot-missing-key");
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();

    const { error } = await supabaseAdmin.rpc("generate_ranking_snapshot", {
      p_snapshot_key: snapshotKey,
      p_snapshot_label: snapshotLabel || null,
    });

    if (error) {
      console.error("[generateRankingSnapshotAction]", error);
      redirectAdminError(locale, "snapshot-generate");
    }
  } catch (err) {
    console.error("[generateRankingSnapshotAction][unexpected]", err);
    redirectAdminError(locale, "snapshot-generate");
  }

  revalidateAdminSurfaces(locale);
  redirectAdminSuccess(locale, "snapshot-generated");
}

function parseBoolean(value: FormDataEntryValue | null) {
  return String(value ?? "") === "true";
}

function parseText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function isValidRole(value: string): value is "user" | "admin" {
  return value === "user" || value === "admin";
}

export async function createUserAction(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));

  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(withLocale(locale, "/admin/users?error=user-create-auth"));
  }

  const email = parseText(formData.get("email")).toLowerCase();
  const displayName = parseText(formData.get("display_name"));
  const roleRaw = parseText(formData.get("role"));
  const temporaryPassword = parseText(formData.get("temporaryPassword"));
  const isActive = parseBoolean(formData.get("is_active"));

  if (!email || !temporaryPassword || !isValidRole(roleRaw)) {
    redirect(withLocale(locale, "/admin/users?error=user-create-invalid"));
  }

  if (temporaryPassword.length < 8) {
    redirect(withLocale(locale, "/admin/users?error=user-create-password"));
  }

  const role: "user" | "admin" = roleRaw;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    redirect(withLocale(locale, "/admin/users?error=user-create-exists"));
  }

  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName || null,
      },
    });

  if (createError || !createdUser.user) {
    redirect(withLocale(locale, "/admin/users?error=user-create"));
  }

  const userId = createdUser.user.id;

  /**
   * Si tienes trigger en profiles al crear auth.users:
   * esto actualiza el registro.
   * Si NO tienes trigger, el upsert lo deja igualmente creado.
   */
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        display_name: displayName || null,
        role,
        is_active: isActive,
        must_change_password: true,
        last_password_reset_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (profileError) {
    // rollback básico para no dejar auth creado sin perfil
    await admin.auth.admin.deleteUser(userId);
    redirect(withLocale(locale, "/admin/users?error=user-create-profile"));
  }

  revalidatePath("/admin/users");
  redirect(withLocale(locale, "/admin/users?success=user-created"));
}
