import CountryFlag from "@/components/CountryFlag";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ProfileRow = {
  id: string;
  role: "user" | "admin";
  is_active: boolean;
};

type ChampionPredictionRow = {
  user_id: string;
  predicted_team_id: string;
  created_at: string | null;
  updated_at: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  flag_code: string | null;
};

type ChampionPredictionSummary = {
  teamId: string;
  teamName: string;
  flagCode: string | null;
  count: number;
  percentage: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
  }).format(value);
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "info" | "warning";
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white",
    success: "border-emerald-200 bg-emerald-50",
    info: "border-sky-200 bg-sky-50",
    warning: "border-amber-200 bg-amber-50",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-semibold text-slate-700">
        Todavía no hay pronósticos de campeón.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Cuando los usuarios elijan ganador, este panel mostrará el reparto por
        selección.
      </p>
    </div>
  );
}

export default async function AdminChampionKpisPage() {
  const supabase = getSupabaseAdminClient();

  const [
    { data: profiles, error: profilesError },
    { data: championPredictions, error: championPredictionsError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, is_active"),
    supabase
      .from("champion_predictions")
      .select("user_id, predicted_team_id, created_at, updated_at"),
    supabase.from("teams").select("id, name, flag_code"),
  ]);

  if (profilesError) {
    throw new Error(`No se pudieron cargar los usuarios: ${profilesError.message}`);
  }

  if (championPredictionsError) {
    throw new Error(
      `No se pudieron cargar los pronósticos de campeón: ${championPredictionsError.message}`
    );
  }

  if (teamsError) {
    throw new Error(`No se pudieron cargar los equipos: ${teamsError.message}`);
  }

  const safeProfiles = (profiles as ProfileRow[] | null) ?? [];
  const safeChampionPredictions =
    (championPredictions as ChampionPredictionRow[] | null) ?? [];
  const safeTeams = (teams as TeamRow[] | null) ?? [];

  const activeUsers = safeProfiles.filter(
    (profile) => profile.role === "user" && profile.is_active
  ).length;

  const teamsById = new Map(safeTeams.map((team) => [team.id, team]));
  const usersWithChampionPrediction = new Set(
    safeChampionPredictions.map((prediction) => prediction.user_id)
  );
  const championPredictionCount = usersWithChampionPrediction.size;
  const participationPct =
    activeUsers > 0 ? (championPredictionCount / activeUsers) * 100 : 0;

  const predictionCounts = new Map<string, number>();
  for (const prediction of safeChampionPredictions) {
    predictionCounts.set(
      prediction.predicted_team_id,
      (predictionCounts.get(prediction.predicted_team_id) ?? 0) + 1
    );
  }

  const championRows: ChampionPredictionSummary[] = Array.from(
    predictionCounts.entries()
  )
    .map(([teamId, count]) => {
      const team = teamsById.get(teamId);

      return {
        teamId,
        teamName: team?.name ?? "Equipo desconocido",
        flagCode: team?.flag_code ?? null,
        count,
        percentage:
          safeChampionPredictions.length > 0
            ? (count / safeChampionPredictions.length) * 100
            : 0,
      };
    })
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      return a.teamName.localeCompare(b.teamName, "es-ES");
    });

  const topChampion = championRows[0] ?? null;
  const hasChampionPredictions = championRows.length > 0;

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
          KPIs campeón
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-950">
              Pronóstico de campeón
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Revisa qué selección está siendo elegida como ganadora del torneo
              y cuánto consenso hay entre los usuarios activos.
            </p>
          </div>

          {topChampion && (
            <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
              <CountryFlag
                code={topChampion.flagCode}
                teamName={topChampion.teamName}
                alt={`Bandera de ${topChampion.teamName}`}
                className="h-10 w-10"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                  Favorito actual
                </p>
                <p className="text-lg font-extrabold text-slate-950">
                  {topChampion.teamName}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Participación campeón"
          value={`${formatPercent(participationPct)}%`}
          hint={`${formatNumber(championPredictionCount)} de ${formatNumber(activeUsers)} usuarios activos`}
          tone="info"
        />
        <StatCard
          label="Pronósticos registrados"
          value={formatNumber(safeChampionPredictions.length)}
          hint="Total de elecciones de ganador"
        />
        <StatCard
          label="Equipos elegidos"
          value={formatNumber(championRows.length)}
          hint="Selecciones con al menos un voto"
          tone="warning"
        />
        <StatCard
          label="Concentración líder"
          value={topChampion ? `${formatPercent(topChampion.percentage)}%` : "0%"}
          hint={topChampion ? `${topChampion.teamName}: ${formatNumber(topChampion.count)} votos` : "Sin datos todavía"}
          tone="success"
        />
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Distribución
            </p>
            <h3 className="mt-1 text-2xl font-extrabold text-slate-950">
              Porcentaje por campeón elegido
            </h3>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {formatNumber(safeChampionPredictions.length)} pronósticos
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {!hasChampionPredictions && <EmptyState />}

          {championRows.map((row) => (
            <div key={row.teamId} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <CountryFlag
                    code={row.flagCode}
                    teamName={row.teamName}
                    alt={`Bandera de ${row.teamName}`}
                    className="h-8 w-8 shrink-0"
                  />
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {row.teamName}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold text-slate-950">
                    {formatPercent(row.percentage)}%
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatNumber(row.count)} votos
                  </p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-violet-600"
                  style={{
                    width: `${Math.max(row.percentage, row.count > 0 ? 3 : 0)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-extrabold text-slate-950">
          Tabla de selecciones favoritas
        </h3>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Selección</th>
                <th className="px-4 py-3 text-right">Votos</th>
                <th className="px-4 py-3 text-right">Porcentaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {!hasChampionPredictions && (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={3}>
                    Sin pronósticos de campeón todavía.
                  </td>
                </tr>
              )}

              {championRows.map((row) => (
                <tr key={row.teamId}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CountryFlag
                        code={row.flagCode}
                        teamName={row.teamName}
                        alt={`Bandera de ${row.teamName}`}
                        className="h-7 w-7"
                      />
                      <span className="font-semibold text-slate-900">
                        {row.teamName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatNumber(row.count)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-violet-700">
                    {formatPercent(row.percentage)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
