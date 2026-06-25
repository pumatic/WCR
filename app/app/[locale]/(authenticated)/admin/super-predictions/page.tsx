import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth-guard";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { updateSuperAdminPredictionAction } from "./actions";

const SUPER_ADMIN_EMAIL = "albert.fernandez@puma.com";

type SearchParams = Promise<{
  userId?: string;
  matchId?: string;
  success?: string;
  error?: string;
}>;

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  home_score_pred: number | null;
  away_score_pred: number | null;
};

type MatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  match_datetime: string | null;
  status: "upcoming" | "live" | "finished";
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getAlert(success?: string, error?: string) {
  if (success === "prediction-updated") {
    return {
      type: "success" as const,
      message: "Prediccion actualizada correctamente.",
    };
  }

  if (!error) return null;

  const messages: Record<string, string> = {
    "invalid-input": "Introduce dos marcadores enteros entre 0 y 99.",
    "not-found": "No se encontro la prediccion o el partido seleccionado.",
    "match-not-editable": "Este partido no esta live ni finalizado.",
    "save-failed": "No se pudo guardar la prediccion.",
  };

  return {
    type: "error" as const,
    message: messages[error] ?? "No se pudo completar la operacion.",
  };
}

function isEditableMatch(match: MatchRow) {
  return match.status === "live" || match.status === "finished";
}

function formatKickoff(value: string | null) {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status: MatchRow["status"]) {
  const labels: Record<MatchRow["status"], string> = {
    upcoming: "Próximo",
    live: "Live",
    finished: "Finalizado",
  };

  return labels[status];
}

export default async function SuperAdminPredictionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { user } = await requireAuthenticatedUser({ requireAdmin: true });

  const { locale } = await params;
  const query = await searchParams;
  const selectedUserId = query.userId ?? "";
  const selectedMatchId = query.matchId ?? "";
  const alert = getAlert(query.success, query.error);
  const admin = getSupabaseAdminClient();

  const { data: currentAdmin, error: currentAdminError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();

  const isSuperAdmin =
    normalizeEmail(user.email) === SUPER_ADMIN_EMAIL ||
    normalizeEmail(currentAdmin?.email) === SUPER_ADMIN_EMAIL;

  if (currentAdminError || !isSuperAdmin) {
    redirect(`/${locale}/admin`);
  }

  const { data: usersData, error: usersError } = await admin
    .from("profiles")
    .select("id, display_name, email, is_active")
    .order("display_name", { ascending: true });

  if (usersError) {
    throw new Error(`Error cargando usuarios: ${usersError.message}`);
  }

  const users = (usersData as ProfileRow[] | null) ?? [];
  let eligiblePredictions: Array<{ prediction: PredictionRow; match: MatchRow }> = [];

  if (selectedUserId) {
    const { data: predictionsData, error: predictionsError } = await admin
      .from("predictions")
      .select("id, user_id, match_id, home_score_pred, away_score_pred")
      .eq("user_id", selectedUserId);

    if (predictionsError) {
      throw new Error(`Error cargando predicciones: ${predictionsError.message}`);
    }

    const predictions = (predictionsData as PredictionRow[] | null) ?? [];
    const matchIds = [...new Set(predictions.map((prediction) => prediction.match_id))];

    if (matchIds.length > 0) {
      const { data: matchesData, error: matchesError } = await admin
        .from("matches")
        .select("id, home_team, away_team, match_datetime, status")
        .in("id", matchIds)
        .in("status", ["live", "finished"])
        .order("match_datetime", { ascending: false });

      if (matchesError) {
        throw new Error(`Error cargando partidos: ${matchesError.message}`);
      }

      const matches = ((matchesData as MatchRow[] | null) ?? []).filter(isEditableMatch);
      const matchesById = new Map(matches.map((match) => [match.id, match]));

      eligiblePredictions = predictions.flatMap((prediction) => {
        const match = matchesById.get(prediction.match_id);
        return match ? [{ prediction, match }] : [];
      });
    }
  }

  const selected = eligiblePredictions.find(
    ({ match }) => match.id === selectedMatchId
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/admin`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          Volver a administracion
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">
          Super admin
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Editar predicciones live o finalizadas
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Esta seccion solo esta disponible para {SUPER_ADMIN_EMAIL}. Permite
          corregir predicciones de usuarios en partidos live o ya finalizados,
          dejando registro en auditoria.
        </p>
      </div>

      {alert && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            alert.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {alert.message}
        </div>
      )}

      <section className="rounded-[1.75rem] border border-violet-200 bg-white p-6 shadow-sm">
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cambiar una prediccion de un partido finalizado puede alterar rankings
          actuales. Si ese dia ya tiene snapshot, habra que regenerarlo si quieres
          que el historico refleje esta correccion.
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <form method="get">
            <label
              htmlFor="super-prediction-user"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Usuario
            </label>
            <div className="flex gap-2">
              <select
                id="super-prediction-user"
                name="userId"
                defaultValue={selectedUserId}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecciona un usuario</option>
                {users.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name || profile.email || "Usuario"}
                    {!profile.is_active ? " (inactivo)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Cargar
              </button>
            </div>
          </form>

          <form method="get">
            <input type="hidden" name="userId" value={selectedUserId} />
            <label
              htmlFor="super-prediction-match"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Partido live/finalizado con prediccion
            </label>
            <div className="flex gap-2">
              <select
                id="super-prediction-match"
                name="matchId"
                defaultValue={selectedMatchId}
                disabled={!selectedUserId || eligiblePredictions.length === 0}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="">
                  {selectedUserId
                    ? "Selecciona un partido"
                    : "Primero selecciona un usuario"}
                </option>
                {eligiblePredictions.map(({ prediction, match }) => (
                  <option key={prediction.id} value={match.id}>
                    [{formatStatus(match.status)}] {match.home_team} vs {match.away_team} - {formatKickoff(match.match_datetime)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!selectedUserId || eligiblePredictions.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cargar
              </button>
            </div>
            {selectedUserId && eligiblePredictions.length === 0 && (
              <p className="mt-2 text-sm text-amber-700">
                Este usuario no tiene predicciones en partidos live o finalizados.
              </p>
            )}
          </form>
        </div>
      </section>

      {selected && (
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Partido seleccionado
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {selected.match.home_team} vs {selected.match.away_team}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {formatKickoff(selected.match.match_datetime)} - {formatStatus(selected.match.status)}
              </p>
            </div>
            <div className="rounded-xl bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800">
              Actual: {selected.prediction.home_score_pred ?? "-"} -{" "}
              {selected.prediction.away_score_pred ?? "-"}
            </div>
          </div>

          <form action={updateSuperAdminPredictionAction} className="mt-6">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="user_id" value={selectedUserId} />
            <input type="hidden" name="match_id" value={selected.match.id} />
            <input type="hidden" name="prediction_id" value={selected.prediction.id} />

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label
                  htmlFor="home-score-pred"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {selected.match.home_team}
                </label>
                <input
                  id="home-score-pred"
                  name="home_score_pred"
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  required
                  defaultValue={selected.prediction.home_score_pred ?? ""}
                  className="h-14 w-24 rounded-xl border border-slate-300 px-3 text-center text-xl font-bold"
                />
              </div>

              <span className="pb-4 text-xl font-bold text-slate-400">-</span>

              <div>
                <label
                  htmlFor="away-score-pred"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {selected.match.away_team}
                </label>
                <input
                  id="away-score-pred"
                  name="away_score_pred"
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  required
                  defaultValue={selected.prediction.away_score_pred ?? ""}
                  className="h-14 w-24 rounded-xl border border-slate-300 px-3 text-center text-xl font-bold"
                />
              </div>

              <button
                type="submit"
                className="h-11 rounded-lg bg-violet-700 px-5 text-sm font-semibold text-white hover:bg-violet-800"
              >
                Guardar correccion super admin
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}