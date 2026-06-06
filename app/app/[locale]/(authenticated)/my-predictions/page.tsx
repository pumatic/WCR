import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAuthenticatedUser } from "@/lib/auth-guard";
import { buttonStyles } from "@/lib/ui";
import CountryFlag from "@/components/CountryFlag";

type MyPredictionRow = {
  prediction_id: string;
  user_id: string;
  match_id: string;
  home_score_pred: number | null;
  away_score_pred: number | null;
  created_at: string | null;
  stage: string | null;
  match_datetime: string;
  home_team: string;
  away_team: string;
  is_puma_match: boolean | null;
  home_flag: string | null;
  away_flag: string | null;
  home_score: number | null;
  away_score: number | null;
  status?: "upcoming" | "live" | "finished" | null;
  points: number | null;
  exact_hit: boolean | null;
};

type PredictionSectionKey = "pending" | "closed" | "resolved";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

type MatchStatusRow = {
  id: string;
  status: "upcoming" | "live" | "finished" | null;
  home_score: number | null;
  away_score: number | null;
};

const DEADLINE_BUFFER_HOURS = 1;

function formatDate(dateString: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function getPredictionDeadline(dateString: string) {
  const matchDate = new Date(dateString);

  if (Number.isNaN(matchDate.getTime())) return null;

  return new Date(
    matchDate.getTime() - DEADLINE_BUFFER_HOURS * 60 * 60 * 1000,
  );
}

function getPredictionStatus(row: MyPredictionRow) {
  if (row.status === "finished") {
    return "resolved" as const;
  }

  if (row.status === "live") {
    return "closed" as const;
  }

  const hasResult = row.home_score !== null && row.away_score !== null;
  if (hasResult) return "resolved" as const;

  const deadline = getPredictionDeadline(row.match_datetime);
  if (!deadline) return "closed" as const;

  const now = Date.now();

  if (now >= deadline.getTime()) return "closed" as const;
  return "pending" as const;
}

function getStatusLabel(status: PredictionSectionKey, t: Translator) {
  switch (status) {
    case "pending":
      return t("sections.pending");
    case "closed":
      return t("sections.closed");
    case "resolved":
      return t("sections.resolved");
  }
}

function getStatusChipLabel(status: PredictionSectionKey, t: Translator) {
  switch (status) {
    case "pending":
      return t("chips.pending");
    case "closed":
      return t("chips.closed");
    case "resolved":
      return t("chips.resolved");
  }
}

function getStatusClasses(status: PredictionSectionKey) {
  switch (status) {
    case "resolved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "closed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getRowScoring(row: MyPredictionRow) {
  if (
    row.status !== "finished" ||
    row.home_score === null ||
    row.away_score === null ||
    row.home_score_pred === null ||
    row.away_score_pred === null
  ) {
    return {
      exactHit: false,
      tendencyHit: false,
      basePoints: 0,
      pumaBonus: 0,
      totalPoints: 0,
    };
  }

  const homeScorePred = row.home_score_pred;
  const awayScorePred = row.away_score_pred;
  const homeScore = row.home_score;
  const awayScore = row.away_score;

  const exactHit =
    homeScorePred === homeScore &&
    awayScorePred === awayScore;

  const predDiff = homeScorePred - awayScorePred;
  const realDiff = homeScore - awayScore;

  const tendencyHit =
    !exactHit &&
    (
      (predDiff > 0 && realDiff > 0) ||
      (predDiff < 0 && realDiff < 0) ||
      (predDiff === 0 && realDiff === 0)
    );

  const basePoints = exactHit ? 3 : tendencyHit ? 1 : 0;
  const pumaBonus = basePoints > 0 && row.is_puma_match ? 1 : 0;

  return {
    exactHit,
    tendencyHit,
    basePoints,
    pumaBonus,
    totalPoints: basePoints + pumaBonus,
  };
}

function getResolutionText(row: MyPredictionRow, t: Translator) {
  if (row.status === "live") return t("resolution.pending");

  const hasResult = row.home_score !== null && row.away_score !== null;
  if (!hasResult) return t("resolution.pending");

  const scoring = getRowScoring(row);

  if (scoring.exactHit) {
    return scoring.pumaBonus > 0
      ? t("resolution.exactWithPuma")
      : t("resolution.exact");
  }

  if (scoring.tendencyHit) {
    return scoring.pumaBonus > 0
      ? t("resolution.tendencyWithPuma")
      : t("resolution.tendency");
  }

  return t("resolution.miss");
}

function getResolutionClasses(row: MyPredictionRow) {
  if (row.status === "live") return "border border-amber-200 bg-amber-50 text-amber-700";

  const hasResult = row.home_score !== null && row.away_score !== null;
  if (!hasResult) return "border border-amber-200 bg-amber-50 text-amber-700";

  const scoring = getRowScoring(row);

  if (scoring.exactHit) return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (scoring.tendencyHit) return "border border-violet-200 bg-violet-50 text-violet-700";
  return "border border-slate-200 bg-slate-50 text-slate-700";
}

function getStatCardClasses(type: "total" | "pending" | "closed" | "points") {
  switch (type) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "closed":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "points":
      return "border-0 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white";
    default:
      return "border-slate-200 bg-white text-slate-900";
  }
}

function sortRowsByDateAsc(a: MyPredictionRow, b: MyPredictionRow) {
  return new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime();
}

function sortRowsByDateDesc(a: MyPredictionRow, b: MyPredictionRow) {
  return new Date(b.match_datetime).getTime() - new Date(a.match_datetime).getTime();
}

function groupRowsByStatus(rows: MyPredictionRow[]) {
  const groups: Record<PredictionSectionKey, MyPredictionRow[]> = {
    pending: [],
    closed: [],
    resolved: [],
  };

  for (const row of rows) {
    const status = getPredictionStatus(row);
    groups[status].push(row);
  }

  groups.pending.sort(sortRowsByDateAsc);
  groups.closed.sort(sortRowsByDateAsc);
  groups.resolved.sort(sortRowsByDateDesc);

  return groups;
}

function PredictionCard({
  row,
  status,
  locale,
  t,
}: {
  row: MyPredictionRow;
  status: PredictionSectionKey;
  locale: string;
  t: Translator;
}) {
  const scoring = getRowScoring(row);
  const hasVisibleResult =
    row.home_score !== null &&
    row.away_score !== null &&
    (row.status === "live" || row.status === "finished" || !row.status);

  return (
    <Link
      href={`/${locale}/match/${row.match_id}`}
      className="group block rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {row.stage ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {row.stage}
              </span>
            ) : null}

            {row.is_puma_match ? (
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white shadow-sm">
                PUMA Match
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <CountryFlag
                code={row.home_flag}
                teamName={row.home_team}
                alt={row.home_team}
                className="h-6 w-6"
              />
              <span className="text-lg font-bold text-slate-900 md:text-xl">
                {row.home_team}
              </span>
            </div>

            <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              VS
            </span>

            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900 md:text-xl">
                {row.away_team}
              </span>
              <CountryFlag
                code={row.away_flag}
                teamName={row.away_team}
                alt={row.away_team}
                className="h-6 w-6"
              />
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-500">{formatDate(row.match_datetime, locale)}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getStatusClasses(
              status,
            )}`}
          >
            {getStatusChipLabel(status, t)}
          </span>

          {status === "resolved" ? (
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
              {scoring.totalPoints} pts
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {t("card.yourPrediction")}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {row.home_score_pred ?? "-"} - {row.away_score_pred ?? "-"}
          </div>
        </div>

        <div
          className={`rounded-2xl p-4 text-center ${
            hasVisibleResult
              ? "bg-slate-100"
              : "border border-amber-200 bg-amber-50"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {t("card.realResult")}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {hasVisibleResult
              ? `${row.home_score} - ${row.away_score}`
              : "-"}
          </div>
        </div>

        <div
          className={`rounded-2xl p-4 text-center ${getResolutionClasses(row)}`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
            {t("card.status")}
          </div>
          <div className="mt-2 text-sm font-bold">{getResolutionText(row, t)}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <span className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-orange-600">
          {t("card.viewDetail")}
        </span>
      </div>
    </Link>
  );
}

export default async function MyPredictionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("myPredictions");

  const { supabase: supabaseServer, user } = await requireAuthenticatedUser();

  const { data, error } = await supabaseServer
    .from("my_predictions_view")
    .select("*")
    .eq("user_id", user.id)
    .order("match_datetime", { ascending: false });

  if (error) {
    return (
      <main className="flex min-h-[40vh] w-full flex-col">
        <section className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-red-700">
            {t("loadError")} {error.message}
          </div>
        </section>
      </main>
    );
  }

  const viewRows = (data ?? []) as MyPredictionRow[];
  const matchIds = [...new Set(viewRows.map((row) => row.match_id))];

  const { data: matchStatusRows, error: matchStatusError } = matchIds.length
    ? await supabaseServer
        .from("matches")
        .select("id, status, home_score, away_score")
        .in("id", matchIds)
    : { data: [], error: null };

  if (matchStatusError) {
    return (
      <main className="flex min-h-[40vh] w-full flex-col">
        <section className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-red-700">
            {t("loadError")} {matchStatusError.message}
          </div>
        </section>
      </main>
    );
  }

  const matchStatusById = new Map(
    ((matchStatusRows ?? []) as MatchStatusRow[]).map((match) => [
      match.id,
      match,
    ]),
  );

  const rows = viewRows.map((row) => {
    const match = matchStatusById.get(row.match_id);

    return {
      ...row,
      status: match?.status ?? row.status ?? null,
      home_score: match?.home_score ?? row.home_score,
      away_score: match?.away_score ?? row.away_score,
    };
  });

  const groupedByStatus = groupRowsByStatus(rows);

  const total = rows.length;
  const pending = groupedByStatus.pending.length;
  const closed = groupedByStatus.closed.length;
  const resolved = groupedByStatus.resolved.length;
  const totalPoints = rows.reduce((acc, row) => acc + getRowScoring(row).totalPoints, 0);

  const sections: PredictionSectionKey[] = ["pending", "closed", "resolved"];

  return (
    <main className="flex w-full flex-col">
      <section className="mb-6">
        <div className="rounded-[1.75rem] bg-white p-6 shadow-lg ring-1 ring-slate-200 md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-slate-400 md:text-xs">
            {t("eyebrow")}
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {t("title")}
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            {t("subtitle")}
          </p>
        </div>
      </section>

      {rows.length > 0 ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div
              className={`rounded-2xl border p-4 shadow-sm ${getStatCardClasses("total")}`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                {t("stats.total")}
              </div>
              <div className="mt-2 text-3xl font-extrabold">{total}</div>
              <div className="mt-1 text-xs opacity-70">{t("stats.totalHint")}</div>
            </div>

            <div
              className={`rounded-2xl border p-4 shadow-sm ${getStatCardClasses("pending")}`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                {t("stats.editable")}
              </div>
              <div className="mt-2 text-3xl font-extrabold">{pending}</div>
              <div className="mt-1 text-xs opacity-70">{t("stats.editableHint")}</div>
            </div>

            <div
              className={`rounded-2xl border p-4 shadow-sm ${getStatCardClasses("closed")}`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                {t("stats.inPlay")}
              </div>
              <div className="mt-2 text-3xl font-extrabold">{closed}</div>
              <div className="mt-1 text-xs opacity-70">{t("stats.inPlayHint")}</div>
            </div>

            <div
              className={`rounded-2xl p-4 shadow-sm ${getStatCardClasses("points")}`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                {t("stats.points")}
              </div>
              <div className="mt-2 text-3xl font-extrabold text-white">
                {totalPoints}
              </div>
              <div className="mt-1 text-xs text-white/80">
                {t("stats.resolvedHint", { count: resolved })}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            {sections.map((sectionKey, index) => {
              const sectionRows = groupedByStatus[sectionKey];

              if (sectionRows.length === 0) return null;

              return (
                <details
                  key={sectionKey}
                  open={index === 0}
                  className="group rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[1.5rem] px-5 py-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 md:text-xl">
                        {getStatusLabel(sectionKey, t)}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {t("sectionMatchCount", { count: sectionRows.length })}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          sectionKey,
                        )}`}
                      >
                        {sectionRows.length}
                      </span>

                      <span className="text-sm font-medium text-slate-400 transition duration-200 group-open:rotate-180">
                        ▼
                      </span>
                    </div>
                  </summary>

                  <div className="border-t border-slate-100 px-4 pb-4 pt-4 md:px-5">
                    <div className="space-y-4">
                      {sectionRows.map((row) => (
                        <PredictionCard
                          key={row.prediction_id}
                          row={row}
                          status={sectionKey}
                          locale={locale}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </section>
        </>
      ) : (
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {t("empty.title")}
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            {t("empty.subtitle")}
          </p>
          <Link href={`/${locale}`} className={buttonStyles.primary}>
            {t("empty.cta")}
          </Link>
        </section>
      )}
    </main>
  );
}
