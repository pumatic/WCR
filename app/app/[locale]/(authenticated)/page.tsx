import Link from "next/link";
import { getTranslations } from "next-intl/server";
import MatchCard from "@/components/MatchCard";
import CountryFlag from "@/components/CountryFlag";
import { Match } from "@/types/match";
import { requireAuthenticatedUser } from "@/lib/auth-guard";

type TeamMeta = {
  id: string;
  name: string;
  flag_code: string | null;
  is_puma_team: boolean | null;
};

type MatchWithMeta = Match & {
  matchday?: string | number | null;
  round?: string | null;
  group_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  is_puma_match?: boolean | null;
  match_number?: number | null;
  is_prediction_open?: boolean | null;
  is_visible?: boolean | null;
};

type PredictionRow = {
  match_id: string;
  home_score_pred: number | null;
  away_score_pred: number | null;
  created_at: string;
};

type ChampionPredictionRow = {
  id: string;
  predicted_team_id: string;
};

type GroupState = "active" | "upcoming" | "finished";

type RankingRow = {
  user_id: string;
  display_name: string | null;
  total_points: number | null;
  exact_hits: number | null;
  tendency_hits: number | null;
  champion_bonus_points: number | null;
};

type RankedRow = RankingRow & {
  position: number;
};

const DEADLINE_BUFFER_HOURS = 1;
const SOON_THRESHOLD_HOURS = 6;

function formatDateLabel(value: string | null | undefined, locale: string) {
  if (!value) return locale === "es" ? "Fecha pendiente" : "Date pending";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "es" ? "Fecha pendiente" : "Date pending";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return locale === "es" ? "Fecha pendiente" : "Date pending";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "es" ? "Fecha pendiente" : "Date pending";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatChampionDeadline(
  value: string | null | undefined,
  locale: string,
) {
  if (!value) {
    return locale === "es" ? "Fecha por confirmar" : "Date to be confirmed";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "es" ? "Fecha por confirmar" : "Date to be confirmed";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getPredictionDeadline(value: string | null | undefined) {
  if (!value) return null;

  const matchDate = new Date(value);

  if (Number.isNaN(matchDate.getTime())) return null;

  return new Date(
    matchDate.getTime() - DEADLINE_BUFFER_HOURS * 60 * 60 * 1000,
  );
}

function getHoursUntilDeadline(value: string | null | undefined) {
  const deadline = getPredictionDeadline(value);

  if (!deadline) return null;

  const now = new Date();
  return (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function getMatchStatus(
  value: string | null | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  const hoursLeft = getHoursUntilDeadline(value);

  if (hoursLeft === null) {
    return {
      label: t("datePending"),
      tone: "slate" as const,
      isEditable: false,
    };
  }

  if (hoursLeft <= 0) {
    return {
      label: t("closed"),
      tone: "red" as const,
      isEditable: false,
    };
  }

  if (hoursLeft <= SOON_THRESHOLD_HOURS) {
    return {
      label: t("closingSoon"),
      tone: "amber" as const,
      isEditable: true,
    };
  }

  return {
    label: t("editable"),
    tone: "green" as const,
    isEditable: true,
  };
}

function getTimeLeftLabel(
  value: string | null | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  const hoursLeft = getHoursUntilDeadline(value);

  if (hoursLeft === null || hoursLeft <= 0) return null;

  if (hoursLeft < 1) {
    const minutes = Math.max(1, Math.floor(hoursLeft * 60));
    return t("closesInMinutes", { count: minutes });
  }

  if (hoursLeft < 24) {
    const roundedHours = Math.floor(hoursLeft);
    return t("closesInHours", { count: roundedHours });
  }

  const days = Math.floor(hoursLeft / 24);
  const hours = Math.floor(hoursLeft % 24);

  if (hours === 0) {
    return t("closesInDays", { count: days });
  }

  return t("closesInDaysHours", { days, hours });
}

function getStatusClasses(tone: "green" | "amber" | "red" | "slate") {
  switch (tone) {
    case "green":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "red":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function formatStageLabel(stage: string | null | undefined, locale: string) {
  if (!stage) return locale === "es" ? "Fecha pendiente" : "Date pending";

  const trimmed = stage.trim();

  if (/^Group\s+[A-Z]$/i.test(trimmed)) {
    return locale === "es"
      ? trimmed.replace(/^Group\s+/i, "Grupo ")
      : trimmed.replace(/^Group\s+/i, "Group ");
  }

  return trimmed;
}

function getMatchdayLabel(
  match: MatchWithMeta,
  locale: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (match.stage) {
    return formatStageLabel(match.stage, locale);
  }

  if (
    match.matchday !== undefined &&
    match.matchday !== null &&
    match.matchday !== ""
  ) {
    return t("matchdayLabel", { value: String(match.matchday) });
  }

  if (match.round) {
    return match.round;
  }

  if (match.group_name) {
    return t("groupLabel", { value: match.group_name });
  }

  return formatDateLabel(match.match_datetime, locale);
}

function getDateKey(value: string | null | undefined) {
  if (!value) return "sin-fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "sin-fecha";

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeTeamName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getDisplayName(
  row: { display_name: string | null },
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  return row.display_name?.trim() || t("fallbackUserName");
}

function formatPointsLabel(
  points: number,
  t: Awaited<ReturnType<typeof getTranslations>>,
  compact = false,
) {
  if (compact) {
    return t("pointsCompact", { count: points });
  }

  return t("pointsLabel", { count: points });
}

function getBattleRows(rows: RankedRow[], userId: string) {
  const currentIndex = rows.findIndex((row) => row.user_id === userId);

  if (currentIndex === -1) {
    return {
      currentIndex: -1,
      rowAbove: null,
      currentRow: null,
      rowBelow: null,
    };
  }

  return {
    currentIndex,
    rowAbove: currentIndex > 0 ? rows[currentIndex - 1] : null,
    currentRow: rows[currentIndex] ?? null,
    rowBelow: currentIndex < rows.length - 1 ? rows[currentIndex + 1] : null,
  };
}

function getGapText(
  fromPoints: number | null,
  toPoints: number | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  const diff = Math.abs((fromPoints ?? 0) - (toPoints ?? 0));

  if (diff === 0) return t("tied");
  if (diff === 1) return t("onePoint");

  return t("pointsLabel", { count: diff });
}

function buildPumaTeamNameSet(teams: TeamMeta[]) {
  return new Set(
    teams
      .filter((team) => team.is_puma_team)
      .map((team) => normalizeTeamName(team.name)),
  );
}

function enrichMatchesWithPumaFlag(
  matches: MatchWithMeta[],
  pumaTeamNames: Set<string>,
): MatchWithMeta[] {
  return matches.map((match) => {
    const isPumaMatch =
      pumaTeamNames.has(normalizeTeamName(match.home_team)) ||
      pumaTeamNames.has(normalizeTeamName(match.away_team));

    return {
      ...match,
      is_puma_match: isPumaMatch,
    };
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("home");

  const {
    supabase: supabaseServer,
    user,
  } = await requireAuthenticatedUser();

  const { data: matchesData, error: matchesError } = await supabaseServer
    .from("matches")
    .select("*")
    .eq("is_visible", true)
    .order("match_datetime", { ascending: true });

  const { data: teamsData, error: teamsError } = await supabaseServer
    .from("teams")
    .select("id, name, flag_code, is_puma_team");

  if (matchesError || teamsError) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            {t("loadError")} {matchesError?.message ?? teamsError?.message}
          </div>
        </div>
      </main>
    );
  }

  const rawMatches: MatchWithMeta[] = (matchesData ?? []) as MatchWithMeta[];
  const teams: TeamMeta[] = (teamsData ?? []) as TeamMeta[];

  const pumaTeamNames = buildPumaTeamNameSet(teams);

  const visibleRawMatches = rawMatches.filter(
    (match) => match.is_visible !== false,
  );

  const matches = enrichMatchesWithPumaFlag(visibleRawMatches, pumaTeamNames);

  const { data: predictions } = await supabaseServer
    .from("predictions")
    .select("match_id, home_score_pred, away_score_pred, created_at")
    .eq("user_id", user.id);

  const { data: championPrediction } = await supabaseServer
    .from("champion_predictions")
    .select("id, predicted_team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: championDeadlineRow } = await supabaseServer
    .from("app_settings")
    .select("value")
    .eq("key", "champion_prediction_deadline")
    .maybeSingle();

  const championDeadline = championDeadlineRow?.value ?? null;

  const championDeadlineDate = championDeadline
    ? new Date(championDeadline)
    : null;

  const isChampionPredictionOpen =
    championDeadlineDate && !Number.isNaN(championDeadlineDate.getTime())
      ? championDeadlineDate.getTime() > Date.now()
      : false;

  const selectedChampionTeam = championPrediction
    ? teams.find(
        (team) =>
          team.id ===
          (championPrediction as ChampionPredictionRow).predicted_team_id,
      ) ?? null
    : null;

  const { data: rankingData } = await supabaseServer
    .from("prediction_scores")
    .select(
      "user_id, display_name, total_points, exact_hits, tendency_hits, champion_bonus_points",
    );

  const predictionsByMatch = new Map(
    ((predictions ?? []) as PredictionRow[]).map((prediction) => [
      prediction.match_id,
      prediction,
    ]),
  );

  const editableMatches = matches.filter(
    (match) =>
      match.is_prediction_open !== false &&
      getMatchStatus(match.match_datetime, t).isEditable,
  );

  const pendingEditableMatches = editableMatches.filter(
    (match) => !predictionsByMatch.has(match.id),
  );

  const closingTodayCount = pendingEditableMatches.filter((match) => {
    const deadline = getPredictionDeadline(match.match_datetime);
    if (!deadline) return false;

    const nowKey = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const deadlineKey = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(deadline);

    return nowKey === deadlineKey;
  }).length;

  const groupedMap = new Map<
    string,
    {
      label: string;
      matches: MatchWithMeta[];
      firstDate: string | null | undefined;
    }
  >();

  for (const match of pendingEditableMatches) {
    const label = getMatchdayLabel(match, locale, t);
    const key = `${label}__${getDateKey(match.match_datetime)}`;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        label,
        matches: [],
        firstDate: match.match_datetime,
      });
    }

    groupedMap.get(key)?.matches.push(match);
  }

  const groups = Array.from(groupedMap.values()).sort((a, b) => {
    const aTime = a.firstDate
      ? new Date(a.firstDate).getTime()
      : Number.MAX_SAFE_INTEGER;
    const bTime = b.firstDate
      ? new Date(b.firstDate).getTime()
      : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;
  });

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      state: "active" as GroupState,
    }))
    .filter((group) => group.matches.length > 0);

  const activeGroupIndex = visibleGroups.findIndex(
    (group) => group.state === "active",
  );

  const normalizedActiveGroupIndex =
    activeGroupIndex >= 0 ? activeGroupIndex : 0;

  const totalPendingMatches = visibleGroups.reduce(
    (total, group) => total + group.matches.length,
    0,
  );

  const ranking: RankingRow[] = [...(rankingData ?? [])]
    .map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name,
      total_points: row.total_points ?? 0,
      exact_hits: row.exact_hits ?? 0,
      tendency_hits: row.tendency_hits ?? 0,
      champion_bonus_points: row.champion_bonus_points ?? 0,
    }))
    .sort((a, b) => {
      const pointsDiff = (b.total_points ?? 0) - (a.total_points ?? 0);
      if (pointsDiff !== 0) return pointsDiff;

      const exactDiff = (b.exact_hits ?? 0) - (a.exact_hits ?? 0);
      if (exactDiff !== 0) return exactDiff;

      const tendencyDiff = (b.tendency_hits ?? 0) - (a.tendency_hits ?? 0);
      if (tendencyDiff !== 0) return tendencyDiff;

      return getDisplayName(a, t).localeCompare(getDisplayName(b, t), locale);
    });

  const rankedRows: RankedRow[] = ranking.map((row, index, rows) => {
    if (index === 0) {
      return {
        ...row,
        position: 1,
      };
    }

    const previousRow = rows[index - 1];
    const samePoints =
      (row.total_points ?? 0) === (previousRow.total_points ?? 0);

    return {
      ...row,
      position: samePoints ? index : index + 1,
    };
  });

  const currentUserRow =
    rankedRows.find((row) => row.user_id === user.id) ?? null;

  const battleRows = currentUserRow
    ? getBattleRows(rankedRows, user.id)
    : {
        currentIndex: -1,
        rowAbove: null,
        currentRow: null,
        rowBelow: null,
      };

  const { rowAbove, rowBelow } = battleRows;

  const gapToAbove =
    currentUserRow && rowAbove
      ? Math.max(
          (rowAbove.total_points ?? 0) - (currentUserRow.total_points ?? 0),
          0,
        )
      : null;

  const gapToBelow =
    currentUserRow && rowBelow
      ? Math.max(
          (currentUserRow.total_points ?? 0) - (rowBelow.total_points ?? 0),
          0,
        )
      : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mb-8 overflow-hidden rounded-[1.75rem] bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-6 py-7 text-white shadow-lg md:px-8 md:py-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.35em] text-white/80 md:text-xs">
          PUMA Southern Europe
        </p>

        <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
          World Cup Royale
        </h1>

        <p className="mt-3 max-w-2xl text-sm text-white/90 md:text-lg">
          {t("heroSubtitle")}
        </p>
      </section>

      <section className="mb-6 rounded-[1.5rem] border border-orange-200 bg-white p-5 shadow-sm md:p-6">
        {!championPrediction && isChampionPredictionOpen ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-500">
                {t("specialPrediction")}
              </p>

              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                {t("predictChampionTitle")}
              </h2>

              <p className="mt-2 text-sm text-slate-600 md:text-base">
                {t.rich("predictChampionText", {
                  strong: (chunks) => (
                    <span className="font-bold text-slate-900">{chunks}</span>
                  ),
                })}
              </p>

              <p className="mt-2 text-xs font-medium text-slate-500">
                {t("availableUntil", {
                  date: formatChampionDeadline(championDeadline, locale),
                })}
              </p>
            </div>

            <Link
              href={`/${locale}/champion`}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {t("chooseChampion")}
            </Link>
          </div>
        ) : championPrediction && selectedChampionTeam ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <CountryFlag
                code={selectedChampionTeam.flag_code}
                teamName={selectedChampionTeam.name}
                alt={
                  locale === "es"
                    ? `Bandera de ${selectedChampionTeam.name}`
                    : `${selectedChampionTeam.name} flag`
                }
                className="mt-1"
              />

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-500">
                  {t("specialPrediction")}
                </p>

                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                  {t("yourChampion", { team: selectedChampionTeam.name })}
                </h2>

                <p className="mt-2 text-sm text-slate-600 md:text-base">
                  {isChampionPredictionOpen
                    ? t("championStillEditable")
                    : t("championClosedFinal")}
                </p>

                <p className="mt-2 text-xs font-medium text-slate-500">
                  {isChampionPredictionOpen
                    ? t("availableUntil", {
                        date: formatChampionDeadline(championDeadline, locale),
                      })
                    : t("predictionClosed")}
                </p>
              </div>
            </div>

            {isChampionPredictionOpen ? (
              <Link
                href={`/${locale}/champion`}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {t("changeChampion")}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              {t("specialPrediction")}
            </p>

            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              {t("championClosedTitle")}
            </h2>

            <p className="text-sm text-slate-600 md:text-base">
              {t("championClosedText")}
            </p>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-[1.5rem] border border-orange-100 bg-white p-5 shadow-sm md:p-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-500">
            {t("activeMatchday")}
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            {visibleGroups[normalizedActiveGroupIndex]?.label ??
              t("upcomingMatches")}
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            {t("pendingSummary", {
              pending: pendingEditableMatches.length,
              closingToday: closingTodayCount,
            })}
          </p>
        </div>
      </section>

      {currentUserRow && (rowAbove || rowBelow) ? (
        <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-white px-5 py-4 md:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-violet-600">
                  {t("battleBadge")}
                </p>

                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                  {rowAbove
                    ? gapToAbove === 0
                      ? t("battleHeadlineTied", {
                          position: rowAbove.position,
                        })
                      : t("battleHeadlineBehind", {
                          points: formatPointsLabel(gapToAbove ?? 0, t),
                          position: rowAbove.position,
                        })
                    : t("battleHeadlineLeader")}
                </h2>

                <p className="mt-2 text-sm text-slate-600">
                  {rowAbove
                    ? t("battleDescriptionAbove")
                    : rowBelow
                      ? t("battleDescriptionLeaderWithPressure")
                      : t("battleDescriptionNoNearby")}
                </p>
              </div>

              <Link
                href={`/${locale}/ranking`}
                className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
              >
                {t("viewRanking")}
              </Link>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:p-5">
            {rowAbove ? (
              <div className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("justAbove")}
                  </p>
                  <p className="truncate text-base font-bold text-slate-900">
                    #{rowAbove.position} · {getDisplayName(rowAbove, t)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-2xl font-black text-slate-900">
                    {rowAbove.total_points ?? 0}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    {t("gapPrefix") ? `${t("gapPrefix")} ` : ""}
                    {getGapText(
                      rowAbove.total_points,
                      currentUserRow.total_points,
                      t,
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-bold text-emerald-700">
                  {t("battleTopCard")}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between rounded-[1.25rem] border border-violet-200 bg-violet-50 px-4 py-3 shadow-sm">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
                  {t("you")}
                </p>
                <p className="truncate text-base font-bold text-slate-900">
                  #{currentUserRow.position} · {getDisplayName(currentUserRow, t)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-2xl font-black text-slate-900">
                  {currentUserRow.total_points ?? 0}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  {t("yourPoints")}
                </p>
              </div>
            </div>

            {rowBelow ? (
              <div className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("justBelow")}
                  </p>
                  <p className="truncate text-base font-bold text-slate-900">
                    #{rowBelow.position} · {getDisplayName(rowBelow, t)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-2xl font-black text-slate-900">
                    {rowBelow.total_points ?? 0}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    {t("aheadByPrefix") ? `${t("aheadByPrefix")} ` : ""}
                    {getGapText(
                      currentUserRow.total_points,
                      rowBelow.total_points,
                      t,
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">
                  {t("battleBottomCard")}
                </p>
              </div>
            )}
          </div>

          {rowAbove ? (
            <div className="px-4 pb-4 md:px-5 md:pb-5">
              <div className="rounded-2xl bg-violet-600 px-4 py-3 text-white">
                <p className="text-sm font-semibold">
                  {gapToAbove !== null && gapToAbove > 0
                    ? t("battleNeedPoints", {
                        points: formatPointsLabel(gapToAbove, t),
                      })
                    : t("battleTieBreaker")}
                </p>

                {gapToBelow !== null ? (
                  <p className="mt-1 text-xs text-white/80">
                    {gapToBelow === 0
                      ? t("battleAlsoTiedBelow")
                      : t("battleCushionBelow", {
                          points: formatPointsLabel(gapToBelow, t),
                        })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mb-6">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {t("upcomingMatches")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t("pendingMatchesCount", { count: totalPendingMatches })}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        {visibleGroups.map((group, index) => {
          const prioritizedMatches = [...group.matches].sort((a, b) => {
            const aPuma = a.is_puma_match ? 1 : 0;
            const bPuma = b.is_puma_match ? 1 : 0;

            if (aPuma !== bPuma) return bPuma - aPuma;

            const aTime = a.match_datetime
              ? new Date(a.match_datetime).getTime()
              : 0;
            const bTime = b.match_datetime
              ? new Date(b.match_datetime).getTime()
              : 0;

            return aTime - bTime;
          });

          return (
            <div
              key={`${group.label}-${index}`}
              className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 px-5 py-4 md:px-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xl font-bold tracking-tight text-slate-900">
                        {group.label}
                      </h4>

                      <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
                        {t("active")}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {t("pendingGroupMatchesCount", {
                        count: prioritizedMatches.length,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-4 md:p-6">
                {prioritizedMatches.map((match) => {
                  const status = getMatchStatus(match.match_datetime, t);
                  const timeLeftLabel = getTimeLeftLabel(
                    match.match_datetime,
                    t,
                  );

                  return (
                    <div
                      key={match.id}
                      className="rounded-[1.25rem] border border-slate-100 bg-slate-50/70 p-3 md:p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${getStatusClasses(
                            status.tone,
                          )}`}
                        >
                          {status.label}
                        </span>

                        {timeLeftLabel ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            {timeLeftLabel}
                          </span>
                        ) : null}

                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {t("pending")}
                        </span>

                        {match.match_datetime ? (
                          <span className="text-xs font-medium text-slate-500">
                            {formatDateTime(match.match_datetime, locale)}
                          </span>
                        ) : null}
                      </div>

                      <MatchCard
                        match={match}
                        navigationMode="quick"
                        ctaLabel={t("predict")}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}