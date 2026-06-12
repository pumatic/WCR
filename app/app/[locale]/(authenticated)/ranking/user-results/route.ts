import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-guard";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type UserPredictionRow = {
  prediction_id: string;
  user_id: string;
  match_id: string;
  home_score_pred: number | null;
  away_score_pred: number | null;
  stage: string | null;
  match_datetime: string | null;
  home_team: string;
  away_team: string;
  is_puma_match: boolean | null;
  home_score: number | null;
  away_score: number | null;
  status?: "live" | "finished";
};

function hasResult(row: UserPredictionRow) {
  return row.home_score !== null && row.away_score !== null;
}

function hasStarted(row: UserPredictionRow) {
  if (!row.match_datetime) return false;

  const matchTime = new Date(row.match_datetime).getTime();
  return !Number.isNaN(matchTime) && matchTime <= Date.now();
}

function getScoring(row: UserPredictionRow) {
  if (
    row.status !== "finished" ||
    row.home_score === null ||
    row.away_score === null ||
    row.home_score_pred === null ||
    row.away_score_pred === null
  ) {
    return {
      points: null,
      outcome: "pending" as const,
    };
  }

  const exactHit =
    row.home_score_pred === row.home_score && row.away_score_pred === row.away_score;

  const predictionDiff = row.home_score_pred - row.away_score_pred;
  const resultDiff = row.home_score - row.away_score;

  const tendencyHit =
    !exactHit &&
    ((predictionDiff > 0 && resultDiff > 0) ||
      (predictionDiff < 0 && resultDiff < 0) ||
      (predictionDiff === 0 && resultDiff === 0));

  const basePoints = exactHit ? 3 : tendencyHit ? 1 : 0;
  const pumaBonus = basePoints > 0 && row.is_puma_match ? 1 : 0;

  return {
    points: basePoints + pumaBonus,
    outcome: exactHit ? "exact" as const : tendencyHit ? "tendency" as const : "miss" as const,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const displayName = searchParams.get("displayName")?.trim();

  if (!displayName) {
    return NextResponse.json({ error: "Missing displayName" }, { status: 400 });
  }

  await requireAuthenticatedUser();
  const supabase = getSupabaseAdminClient();

  const { data: matchingUsers, error: userError } = await supabase
    .from("prediction_scores")
    .select("user_id, display_name")
    .eq("display_name", displayName)
    .limit(2);

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!matchingUsers || matchingUsers.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (matchingUsers.length > 1) {
    return NextResponse.json({ error: "Multiple users share this display name" }, { status: 409 });
  }

  const rankingUser = matchingUsers[0];

  const { data: visibleMatches, error: matchesError } = await supabase
    .from("matches")
    .select("id, status, home_score, away_score")
    .in("status", ["live", "finished"]);

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  const matchById = new Map(
    (visibleMatches ?? []).map((match) => [match.id, match])
  );
  const visibleMatchIds = [...matchById.keys()];

  if (visibleMatchIds.length === 0) {
    return NextResponse.json({
      user: {
        id: rankingUser.user_id,
        displayName: rankingUser.display_name ?? displayName,
      },
      results: [],
    });
  }

  const { data, error } = await supabase
    .from("my_predictions_view")
    .select(
      "prediction_id, user_id, match_id, home_score_pred, away_score_pred, stage, match_datetime, home_team, away_team, is_puma_match, home_score, away_score"
    )
    .eq("user_id", rankingUser.user_id)
    .in("match_id", visibleMatchIds)
    .order("match_datetime", { ascending: false })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = ((data ?? []) as UserPredictionRow[])
    .map((viewRow) => {
      const match = matchById.get(viewRow.match_id);
      if (!match) return null;

      const row = {
        ...viewRow,
        status: match.status as "live" | "finished",
        home_score: match.home_score,
        away_score: match.away_score,
      };
      const scoring = getScoring(row);

      return {
        id: row.prediction_id,
        matchId: row.match_id,
        stage: row.stage,
        matchDatetime: row.match_datetime,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        isPumaMatch: row.is_puma_match ?? false,
        prediction: {
          home: row.home_score_pred,
          away: row.away_score_pred,
        },
        result: {
          home: row.home_score,
          away: row.away_score,
        },
        status: row.status,
        points: scoring.points,
        outcome: scoring.outcome,
      };
    })
    .filter((result) => result !== null);

  return NextResponse.json({
    user: {
      id: rankingUser.user_id,
      displayName: rankingUser.display_name ?? displayName,
    },
    results,
  });
}