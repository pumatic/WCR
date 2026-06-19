import { requireAuthenticatedUser } from "@/lib/auth-guard";
import { getLocale, getTranslations } from "next-intl/server";

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

type SnapshotMetaRow = {
  snapshot_key: string;
  snapshot_label: string | null;
  created_at: string;
};

type SnapshotRow = {
  user_id: string;
  position: number | null;
  total_points: number | null;
};

type MovementInfo = {
  positionChange: number | null;
  pointsChange: number | null;
  movementLabel: string;
  pointsLabel: string | null;
  isNew: boolean;
};

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function getDisplayName(row: RankingRow, fallbackUserLabel: string) {
  return row.display_name?.trim() || fallbackUserLabel;
}

function getPositionBadgeClass(position: number) {
  if (position === 1) {
    return "bg-yellow-400 text-neutral-950 ring-2 ring-yellow-200";
  }
  if (position === 2) {
    return "bg-slate-300 text-neutral-950 ring-2 ring-slate-200";
  }
  if (position === 3) {
    return "bg-amber-500 text-white ring-2 ring-amber-200";
  }
  return "bg-neutral-100 text-neutral-700";
}

function formatPointsLabel(points: number, t: Translator, compact = false) {
  if (compact) {
    return points === 1 ? t("pt", { count: 1 }) : t("pts", { count: points });
  }

  return points === 1
    ? t("pointCount_one", { count: 1 })
    : t("pointCount_other", { count: points });
}

function getPodiumCutoffPoints(rows: RankedRow[]) {
  if (rows.length === 0) return null;

  const uniquePointValues = [...new Set(rows.map((row) => row.total_points ?? 0))].sort(
    (a, b) => b - a
  );

  if (uniquePointValues.length < 3) {
    return uniquePointValues[uniquePointValues.length - 1] ?? null;
  }

  return uniquePointValues[2];
}

function getCompetitiveHint(rows: RankedRow[], index: number, t: Translator) {
  const currentRow = rows[index];
  if (!currentRow) return null;

  const currentPoints = currentRow.total_points ?? 0;
  const leader = rows[0];
  const previousRow = index > 0 ? rows[index - 1] : null;
  const nextRow = index < rows.length - 1 ? rows[index + 1] : null;
  const podiumPoints = getPodiumCutoffPoints(rows);

  if (index === 0) {
    if (!nextRow) return t("hintLeader");

    const cushion = currentPoints - (nextRow.total_points ?? 0);

    if (cushion <= 0) return t("hintLeader");
    if (cushion === 1) return t("hintLeadingBy_one", { count: 1 });
    return t("hintLeadingBy_other", { count: cushion });
  }

  if (previousRow) {
    const gapToPrevious = (previousRow.total_points ?? 0) - currentPoints;

    if (gapToPrevious <= 0) {
      return t("hintTiedAbove");
    }
  }

  if (podiumPoints !== null && currentPoints < podiumPoints) {
    const gapToPodium = Math.max(podiumPoints - currentPoints, 0);

    if (gapToPodium > 0) {
      return t("hintToPodium", { points: formatPointsLabel(gapToPodium, t, true) });
    }
  }

  if (leader && podiumPoints !== null && currentPoints >= podiumPoints) {
    const gapToLeader = Math.max((leader.total_points ?? 0) - currentPoints, 0);

    if (gapToLeader > 0) {
      return t("hintToLeader", { points: formatPointsLabel(gapToLeader, t, true) });
    }
  }

  if (previousRow) {
    const gapToPrevious = Math.max((previousRow.total_points ?? 0) - currentPoints, 0);

    if (gapToPrevious > 0) {
      return t("hintToCatchUp", { points: formatPointsLabel(gapToPrevious, t, true) });
    }
  }

  return null;
}

function getComparisonReference(snapshotReference: string | null, t: Translator) {
  return snapshotReference ?? t("lastCutoff");
}

function getMovementInfo(
  row: RankedRow,
  previousSnapshotMap: Map<string, { user_id: string; position: number; total_points: number }>,
  snapshotReference: string | null,
  t: Translator
): MovementInfo {
  const previous = previousSnapshotMap.get(row.user_id);
  const reference = getComparisonReference(snapshotReference, t);

  if (!previous) {
    return {
      positionChange: null,
      pointsChange: null,
      movementLabel: t("movementNew"),
      pointsLabel: t("movementNoPreviousComparison", { reference }),
      isNew: true,
    };
  }

  const currentPosition = row.position;
  const previousPosition = previous.position;
  const currentPoints = row.total_points ?? 0;
  const previousPoints = previous.total_points ?? 0;

  const positionDelta = previousPosition - currentPosition;
  const pointsDelta = currentPoints - previousPoints;

  let movementLabel = t("movementStay");

  if (positionDelta > 0) {
    movementLabel =
      positionDelta === 1
        ? t("movementUp_one", { count: 1 })
        : t("movementUp_other", { count: positionDelta });
  } else if (positionDelta < 0) {
    const fallen = Math.abs(positionDelta);
    movementLabel =
      fallen === 1
        ? t("movementDown_one", { count: 1 })
        : t("movementDown_other", { count: fallen });
  }

  let pointsLabel: string | null = t("movementSamePoints", { reference });

  if (pointsDelta > 0) {
    pointsLabel =
      pointsDelta === 1
        ? t("movementMorePoints_one", { reference, count: 1 })
        : t("movementMorePoints_other", { reference, count: pointsDelta });
  } else if (pointsDelta < 0) {
    const diff = Math.abs(pointsDelta);
    pointsLabel =
      diff === 1
        ? t("movementFewerPoints_one", { reference, count: 1 })
        : t("movementFewerPoints_other", { reference, count: diff });
  }

  return {
    positionChange: positionDelta,
    pointsChange: pointsDelta,
    movementLabel,
    pointsLabel,
    isNew: false,
  };
}

function getMovementTextClass(positionChange: number | null, isNew: boolean) {
  if (isNew) return "text-sky-700";
  if (positionChange === null || positionChange === 0) return "text-neutral-500";
  if (positionChange > 0) return "text-emerald-700";
  return "text-rose-700";
}

function getMovementPillClass(positionChange: number | null, isNew: boolean) {
  if (isNew) {
    return "border-amber-200 bg-amber-300 text-neutral-900";
  }

  if (positionChange === null || positionChange === 0) {
    return "border-neutral-200 bg-white text-neutral-900";
  }

  if (positionChange > 0) {
    return "border-amber-300 bg-amber-400 text-neutral-950";
  }

  return "border-orange-300 bg-orange-500 text-white";
}

function getMovementSummaryTextClass(positionChange: number | null, isNew: boolean) {
  if (isNew) return "text-amber-200";
  if (positionChange === null || positionChange === 0) return "text-amber-100";
  if (positionChange > 0) return "text-amber-200";
  return "text-orange-200";
}

function getPointsChangeTextClass(pointsChange: number | null) {
  if (pointsChange === null || pointsChange === 0) return "text-white/80";
  if (pointsChange > 0) return "text-amber-100";
  return "text-orange-100";
}

function getMovementSummaryText(
  movement: MovementInfo,
  snapshotReference: string | null,
  t: Translator
) {
  const reference = getComparisonReference(snapshotReference, t);

  if (movement.isNew) {
    return t("summaryEnteredRanking", { reference });
  }

  if (movement.positionChange === null || movement.positionChange === 0) {
    return t("summaryPositionUnchanged", { reference });
  }

  if (movement.positionChange > 0) {
    return movement.positionChange === 1
      ? t("summaryMovedUp_one", { count: 1, reference })
      : t("summaryMovedUp_other", { count: movement.positionChange, reference });
  }

  const fallen = Math.abs(movement.positionChange);
  return fallen === 1
    ? t("summaryMovedDown_one", { count: 1, reference })
    : t("summaryMovedDown_other", { count: fallen, reference });
}

function getPointsChangeSummaryText(
  movement: MovementInfo,
  snapshotReference: string | null,
  t: Translator
) {
  if (movement.pointsChange === null) return null;

  const reference = getComparisonReference(snapshotReference, t);

  if (movement.pointsChange === 0) {
    return t("summaryPointsNoChange", { reference });
  }

  if (movement.pointsChange > 0) {
    return movement.pointsChange === 1
      ? t("summaryPointsMore_one", { count: 1, reference })
      : t("summaryPointsMore_other", { count: movement.pointsChange, reference });
  }

  const diff = Math.abs(movement.pointsChange);
  return diff === 1
    ? t("summaryPointsLess_one", { count: 1, reference })
    : t("summaryPointsLess_other", { count: diff, reference });
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

function getGapText(fromPoints: number | null, toPoints: number | null, t: Translator) {
  const diff = Math.abs((fromPoints ?? 0) - (toPoints ?? 0));

  if (diff === 0) return t("gapTied");
  if (diff === 1) return t("gap_one", { count: 1 });
  return t("gap_other", { count: diff });
}

function getTopRows(rows: RankedRow[], limit = 10) {
  return rows.slice(0, limit);
}

function getContextRows(rows: RankedRow[], userId: string, radius = 3) {
  const currentIndex = rows.findIndex((row) => row.user_id === userId);

  if (currentIndex === -1) return [];

  const start = Math.max(0, currentIndex - radius);
  const end = Math.min(rows.length, currentIndex + radius + 1);

  return rows.slice(start, end);
}

function getMomentumBadge(params: {
  positionChange: number | null;
  pointsChange: number | null;
  gapToAbove: number | null;
  gapToBelow: number | null;
  isPodium: boolean;
  t: Translator;
}) {
  const { positionChange, pointsChange, gapToAbove, gapToBelow, isPodium, t } = params;

  if ((positionChange ?? 0) > 0 || (pointsChange ?? 0) >= 3) {
    return {
      label: t("momentumHotStreak"),
      className: "border-rose-200 bg-rose-100 text-rose-700",
    };
  }

  if (gapToAbove === 1 || gapToBelow === 1) {
    return {
      label: t("momentumPressure"),
      className: "border-amber-200 bg-amber-100 text-amber-800",
    };
  }

  if ((positionChange ?? 0) === 0 || isPodium) {
    return {
      label: t("momentumHolding"),
      className: "border-sky-200 bg-sky-100 text-sky-700",
    };
  }

  return null;
}

function RankingListItem({
  row,
  userId,
  isPodium,
  competitiveHint,
  movement,
  movementClass,
  t,
}: {
  row: RankedRow;
  userId: string;
  isPodium: boolean;
  competitiveHint: string | null;
  movement: MovementInfo | null;
  movementClass: string;
  t: Translator;
}) {
  const isCurrentUser = row.user_id === userId;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-4 sm:px-6 ${
        isCurrentUser ? "bg-violet-50" : isPodium ? "bg-neutral-50" : "bg-white"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black shadow-sm sm:h-11 sm:w-11 ${getPositionBadgeClass(
            row.position
          )}`}
        >
          #{row.position}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p 
              data-ranking-user-name
              data-display-name={getDisplayName(row, t("userFallback"))}
              className="truncate text-sm font-bold text-neutral-900 sm:text-base">
              {getDisplayName(row, t("userFallback"))}
            </p>

            {isCurrentUser && (
              <span className="rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {t("you")}
              </span>
            )}

            {isPodium && !isCurrentUser && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                {t("top3")}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
            {row.exact_hits ?? 0} {t("exactHitsLower")} · {row.tendency_hits ?? 0}{" "}
            {t("tendencyHitsLower")}
            {(row.champion_bonus_points ?? 0) > 0 && (
              <span className="font-semibold text-amber-700"> · 🏆 {t("champion")}</span>
            )}
          </p>

          {competitiveHint && (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700/85 sm:text-[11px]">
              {competitiveHint}
            </p>
          )}

          {movement && (
            <div className="mt-1 flex flex-col gap-0.5">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${movementClass}`}
              >
                {movement.movementLabel}
              </p>

              <p className="text-[10px] font-medium text-neutral-500 sm:text-[11px]">
                {movement.pointsLabel}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-xl font-black text-neutral-900 sm:text-2xl">
          {row.total_points ?? 0}
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500 sm:text-xs">
          {t("pointsLabel")}
        </p>
      </div>
    </div>
  );
}

export default async function RankingPage() {
  const t = await getTranslations("ranking");
  const locale = await getLocale();
  const { supabase: supabaseServer, user } = await requireAuthenticatedUser();

  const { data, error } = await supabaseServer
    .from("prediction_scores")
    .select("user_id, display_name, total_points, exact_hits, tendency_hits, champion_bonus_points");

  if (error) {
    return (
      <main className="flex min-h-[40vh] w-full flex-col">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-sm">
            {t.rich("loadErrorMessage", {
              viewName: () => (
                <code className="rounded bg-red-100 px-1 py-0.5 text-xs">
                  prediction_scores
                </code>
              ),
            })}
          </p>
          <p className="mt-2 text-sm opacity-80">{error.message}</p>
        </div>
      </main>
    );
  }

  const ranking: RankingRow[] = [...(data ?? [])]
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

      return getDisplayName(a, t("userFallback")).localeCompare(
        getDisplayName(b, t("userFallback")),
        locale
      );
    });

  const rankedRows: RankedRow[] = ranking.map((row, index, rows) => {
    if (index === 0) {
      return {
        ...row,
        position: 1,
      };
    }

    const previousRow = rows[index - 1];
    const samePoints = (row.total_points ?? 0) === (previousRow.total_points ?? 0);

    return {
      ...row,
      position: samePoints ? index : index + 1,
    };
  });

  const { data: latestSnapshotMetaData } = await supabaseServer
    .from("ranking_snapshots")
    .select("snapshot_key, snapshot_label, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  const latestSnapshotMeta = (latestSnapshotMetaData?.[0] as SnapshotMetaRow | undefined) ?? null;
  const latestSnapshotKey = latestSnapshotMeta?.snapshot_key ?? null;
  const latestSnapshotLabel = latestSnapshotMeta?.snapshot_label ?? null;
  const snapshotReference = latestSnapshotLabel || latestSnapshotKey;

  const previousSnapshotRowsResponse = latestSnapshotKey
    ? await supabaseServer
        .from("ranking_snapshots")
        .select("user_id, position, total_points")
        .eq("snapshot_key", latestSnapshotKey)
    : null;

  const previousSnapshotRows: SnapshotRow[] =
    (previousSnapshotRowsResponse?.data as SnapshotRow[] | null) ?? [];

  const previousSnapshotMap = new Map<
    string,
    { user_id: string; position: number; total_points: number }
  >(
    previousSnapshotRows.map((row) => [
      row.user_id,
      {
        user_id: row.user_id,
        position: row.position ?? 0,
        total_points: row.total_points ?? 0,
      },
    ])
  );

  const currentUserRow = rankedRows.find((row) => row.user_id === user.id);
  const totalParticipants = rankedRows.length;
  const leader = rankedRows[0];
  const podiumCutoffPoints = getPodiumCutoffPoints(rankedRows);
  getTopRows(rankedRows, 10);
  const contextRows = getContextRows(rankedRows, user.id, 3);

  const isPodiumRow = (row: RankedRow) => {
    if (podiumCutoffPoints === null) return false;
    return (row.total_points ?? 0) >= podiumCutoffPoints;
  };

  const pointsToPodium =
    currentUserRow && podiumCutoffPoints !== null
      ? Math.max(podiumCutoffPoints - (currentUserRow.total_points ?? 0), 0)
      : null;

  const pointsToLeader =
    currentUserRow && leader
      ? Math.max((leader.total_points ?? 0) - (currentUserRow.total_points ?? 0), 0)
      : null;

  const currentUserSequentialIndex = rankedRows.findIndex((row) => row.user_id === user.id);

  const percentileAhead =
    currentUserRow && totalParticipants > 1 && currentUserSequentialIndex >= 0
      ? Math.round(
          ((totalParticipants - (currentUserSequentialIndex + 1)) / (totalParticipants - 1)) * 100
        )
      : 0;

  const currentUserMovement =
    currentUserRow && latestSnapshotKey
      ? getMovementInfo(currentUserRow, previousSnapshotMap, snapshotReference, t)
      : null;

  const currentUserMovementPillClass = currentUserMovement
    ? getMovementPillClass(currentUserMovement.positionChange, currentUserMovement.isNew)
    : "";

  const battleRows = currentUserRow
    ? getBattleRows(rankedRows, user.id)
    : {
        rowAbove: null,
        rowBelow: null,
      };

  const { rowAbove, rowBelow } = battleRows;

  const gapToAbove =
    currentUserRow && rowAbove
      ? Math.max((rowAbove.total_points ?? 0) - (currentUserRow.total_points ?? 0), 0)
      : null;

  const gapToBelow =
    currentUserRow && rowBelow
      ? Math.max((currentUserRow.total_points ?? 0) - (rowBelow.total_points ?? 0), 0)
      : null;

  const movementBadge =
    latestSnapshotKey &&
    currentUserMovement &&
    (currentUserMovement.isNew ||
      (currentUserMovement.positionChange !== null && currentUserMovement.positionChange !== 0))
      ? currentUserMovement
      : null;

  const currentUserMomentum =
    currentUserRow && currentUserMovement
      ? getMomentumBadge({
          positionChange: currentUserMovement.positionChange,
          pointsChange: currentUserMovement.pointsChange,
          gapToAbove,
          gapToBelow,
          isPodium: isPodiumRow(currentUserRow),
          t,
        })
      : null;

  const momentumBadge = movementBadge ? null : currentUserMomentum;

  return (
    <main className="flex w-full flex-col">
      <section className="mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
            {t("title")}
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-neutral-600">{t("intro")}</p>
          <p className="mt-2 max-w-2xl text-xs text-neutral-500">{t("pumaMatchBonus")}</p>

          {latestSnapshotKey && (
            <p className="mt-2 text-xs text-neutral-500">
              {t("comparisonWith", {
                reference: snapshotReference ?? t("lastCutoff"),
              })}
            </p>
          )}
        </div>
      </section>

      {currentUserRow ? (
        <>
          <section className="mb-3 overflow-hidden rounded-3xl border border-violet-900 bg-gradient-to-br from-violet-700 via-fuchsia-700 to-neutral-950 text-white shadow-xl">
            <div className="px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
                    {t("yourSituation")}
                  </p>

                  {movementBadge ? (
                    <div
                      className={`mt-3 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide shadow-sm animate-fade-in-up animate-soft-pulse ${currentUserMovementPillClass}`}
                    >
                      <span aria-hidden="true">
                        {movementBadge.positionChange! > 0 ? "↑" : "↓"}
                      </span>
                      <span>{movementBadge.movementLabel.replace(/^[↑↓→]\s*/, "")}</span>
                    </div>
                  ) : momentumBadge ? (
                    <div
                      className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide shadow-sm ${momentumBadge.className}`}
                    >
                      {momentumBadge.label}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-white/75">{t("youAre")}</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-4xl font-black leading-none sm:text-5xl">
                      #{currentUserRow.position}
                    </span>
                    <span className="pb-1 text-sm text-white/75">
                      {t("outOf", { total: totalParticipants })}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                  <p className="text-[11px] uppercase tracking-wide text-white/70">
                    {t("yourPoints")}
                  </p>
                  <p className="text-2xl font-black text-white">
                    {t("pts", { count: currentUserRow.total_points ?? 0 })}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-white/80">
                {isPodiumRow(currentUserRow)
                  ? t("insidePrizePositions")
                  : t("aheadOfParticipants", { percent: percentileAhead })}
              </p>

              {latestSnapshotKey && currentUserMovement && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 backdrop-blur-sm shadow-sm animate-fade-in-up">
                  <p
                    className={`text-sm font-semibold leading-snug ${getMovementSummaryTextClass(
                      currentUserMovement.positionChange,
                      currentUserMovement.isNew
                    )}`}
                  >
                    {getMovementSummaryText(currentUserMovement, snapshotReference, t)}
                  </p>

                  <p
                    className={`mt-1 text-xs font-medium ${getPointsChangeTextClass(
                      currentUserMovement.pointsChange
                    )}`}
                  >
                    {getPointsChangeSummaryText(currentUserMovement, snapshotReference, t)}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 bg-white/95 px-4 py-4 text-neutral-900 sm:px-6 xl:grid-cols-4">
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  {t("podium")}
                </p>
                <p className="mt-2 text-xl font-black">
                  {isPodiumRow(currentUserRow)
                    ? t("inside")
                    : t("pts", { count: pointsToPodium ?? 0 })}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {isPodiumRow(currentUserRow) ? t("podiumHintInside") : t("podiumHintOutside")}
                </p>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  {t("leader")}
                </p>
                <p className="mt-2 text-xl font-black">
                  {currentUserRow.position === 1
                    ? t("leaderIsYou")
                    : t("pts", { count: pointsToLeader ?? 0 })}
                </p>
                <p className="mt-1 text-xs text-neutral-500">{t("distanceToLeader")}</p>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  {t("exactHits")}
                </p>
                <p className="mt-2 text-xl font-black">{currentUserRow.exact_hits ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">{t("exactHitsHint")}</p>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  {t("tendencyHits")}
                </p>
                <p className="mt-2 text-xl font-black">{currentUserRow.tendency_hits ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">{t("tendencyHitsHint")}</p>
              </div>
            </div>
          </section>

          <section className="mb-6 overflow-hidden rounded-2xl border border-violet-300 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-700 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/80">
                  {t("pumaChallenge")}
                </p>
                <p className="mt-1 text-sm font-semibold sm:text-base">
                  {t("pumaChallengeText")}
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white sm:text-xs">
                Forever.Faster.
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <h2 className="text-lg font-bold">{t("notRankedTitle")}</h2>
          <p className="mt-2 text-sm">{t("notRankedText")}</p>
        </section>
      )}

      {currentUserRow && contextRows.length > 0 ? (
        <section className="mb-6 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-lg">
          <div className="border-b border-neutral-100 px-4 py-4 sm:px-6">
            <h2 className="text-lg font-bold text-neutral-900 sm:text-xl">{t("yourSurroundings")}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t("yourSurroundingsText")}</p>
          </div>

          <div className="divide-y divide-neutral-100">
            {contextRows.map((row) => {
              const globalIndex = rankedRows.findIndex((item) => item.user_id === row.user_id);
              const isPodium = isPodiumRow(row);
              const competitiveHint = getCompetitiveHint(rankedRows, globalIndex, t);
              const movement = latestSnapshotKey
                ? getMovementInfo(row, previousSnapshotMap, snapshotReference, t)
                : null;
              const movementClass = movement
                ? getMovementTextClass(movement.positionChange, movement.isNew)
                : "";

              return (
                <RankingListItem
                  key={row.user_id}
                  row={row}
                  userId={user.id}
                  isPodium={isPodium}
                  competitiveHint={competitiveHint}
                  movement={movement}
                  movementClass={movementClass}
                  t={t}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <details className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-lg">
        <summary className="cursor-pointer list-none border-b border-neutral-100 px-4 py-4 font-bold text-neutral-900 sm:px-6">
          <div className="font-bold text-neutral-900">{t("fullRankingTitle")}</div>
          <p className="mt-1 text-sm font-normal text-neutral-600">{t("fullRankingText")}</p>
        </summary>

        {rankedRows.length === 0 ? (
          <div className="px-6 py-8 text-sm text-neutral-600">{t("emptyRanking")}</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {rankedRows.map((row, index) => {
              const isPodium = isPodiumRow(row);
              const competitiveHint = getCompetitiveHint(rankedRows, index, t);
              const movement = latestSnapshotKey
                ? getMovementInfo(row, previousSnapshotMap, snapshotReference, t)
                : null;
              const movementClass = movement
                ? getMovementTextClass(movement.positionChange, movement.isNew)
                : "";

              return (
                <RankingListItem
                  key={row.user_id}
                  row={row}
                  userId={user.id}
                  isPodium={isPodium}
                  competitiveHint={competitiveHint}
                  movement={movement}
                  movementClass={movementClass}
                  t={t}
                />
              );
            })}
          </div>
        )}
      </details>
    </main>
  );
}