import { Match } from "@/types/match";
import { PredictionRow, parseScore } from "@/lib/match-detail";

export type CommunityPredictionScoreline = {
  home: number;
  away: number;
  count: number;
  percentage: number;
};

export type CommunityPredictionOutcome = {
  key: "homeWin" | "draw" | "awayWin";
  count: number;
  percentage: number;
};

export type CommunityPredictionStats = {
  totalPredictions: number;
  topScoreline: CommunityPredictionScoreline | null;
  scorelines: CommunityPredictionScoreline[];
  outcomes: CommunityPredictionOutcome[];
  exactResultHits: {
    count: number;
    percentage: number;
  } | null;
};

function toPercentage(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function getPredictedOutcome(
  home: number,
  away: number
): CommunityPredictionOutcome["key"] {
  if (home > away) return "homeWin";
  if (home < away) return "awayWin";
  return "draw";
}

export function getCommunityPredictionStats(
  predictions: Pick<PredictionRow, "home_score_pred" | "away_score_pred">[],
  match: Match
): CommunityPredictionStats {
  const validPredictions = predictions.filter(
    (
      prediction
    ): prediction is { home_score_pred: number; away_score_pred: number } =>
      prediction.home_score_pred !== null && prediction.away_score_pred !== null
  );
  const totalPredictions = validPredictions.length;

  const scorelineCounts = new Map<string, CommunityPredictionScoreline>();
  const outcomeCounts: Record<CommunityPredictionOutcome["key"], number> = {
    homeWin: 0,
    draw: 0,
    awayWin: 0,
  };

  validPredictions.forEach((prediction) => {
    const key = `${prediction.home_score_pred}-${prediction.away_score_pred}`;
    const existing = scorelineCounts.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      scorelineCounts.set(key, {
        home: prediction.home_score_pred,
        away: prediction.away_score_pred,
        count: 1,
        percentage: 0,
      });
    }

    outcomeCounts[
      getPredictedOutcome(
        prediction.home_score_pred,
        prediction.away_score_pred
      )
    ] += 1;
  });

  const scorelines = Array.from(scorelineCounts.values())
    .map((scoreline) => ({
      ...scoreline,
      percentage: toPercentage(scoreline.count, totalPredictions),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return `${left.home}-${left.away}`.localeCompare(
        `${right.home}-${right.away}`
      );
    });

  const actualHome = parseScore(match.home_score);
  const actualAway = parseScore(match.away_score);
  const exactHitCount =
    actualHome !== null && actualAway !== null
      ? scorelineCounts.get(`${actualHome}-${actualAway}`)?.count ?? 0
      : null;

  return {
    totalPredictions,
    topScoreline: scorelines[0] ?? null,
    scorelines: scorelines.slice(0, 5),
    outcomes: [
      {
        key: "homeWin",
        count: outcomeCounts.homeWin,
        percentage: toPercentage(outcomeCounts.homeWin, totalPredictions),
      },
      {
        key: "draw",
        count: outcomeCounts.draw,
        percentage: toPercentage(outcomeCounts.draw, totalPredictions),
      },
      {
        key: "awayWin",
        count: outcomeCounts.awayWin,
        percentage: toPercentage(outcomeCounts.awayWin, totalPredictions),
      },
    ],
    exactResultHits:
      exactHitCount === null
        ? null
        : {
            count: exactHitCount,
            percentage: toPercentage(exactHitCount, totalPredictions),
          },
  };
}