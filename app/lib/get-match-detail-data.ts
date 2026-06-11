import { SupabaseClient } from "@supabase/supabase-js";
import { Match } from "@/types/match";
import {
  getOutcome,
  getOutcomeContent,
  getPointsAndBreakdown,
  getPumaTeamsForMatch,
  normalizeMatchStatus,
  PredictionRow,
  TeamMeta,
} from "@/lib/match-detail";
import { getCommunityPredictionStats } from "@/lib/community-prediction-stats";

type MatchDetailTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export async function getMatchDetailData({
  supabaseServer,
  matchId,
  userId,
  t,
}: {
  supabaseServer: SupabaseClient;
  matchId: string;
  userId: string;
  t: MatchDetailTranslator;
}) {
  const { data: match, error: matchError } = await supabaseServer
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single<Match>();

  if (matchError || !match) return null;

  const { data: teamsData, error: teamsError } = await supabaseServer
    .from("teams")
    .select(
      "id, name, is_puma_team, sponsor_brand, sponsor_campaign_image, sponsor_kit_image, sponsor_card_text, sponsor_card_title"
    );

  if (teamsError) return null;

  const { data: predictionData } = await supabaseServer
    .from("predictions")
    .select("id, user_id, match_id, home_score_pred, away_score_pred, created_at")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .maybeSingle<PredictionRow>();

  const teams = (teamsData ?? []) as TeamMeta[];
  const prediction = predictionData ?? null;

  const { hasPumaTeam, isDualPuma, primaryPumaTeam, pumaTeams } =
    getPumaTeamsForMatch(match, teams);

  const isPumaMatch = Boolean(match.is_puma_match) || hasPumaTeam;
  const matchStatus = normalizeMatchStatus(match);

  const { data: communityPredictionData } =
    matchStatus === "scheduled"
      ? { data: [] }
      : await supabaseServer
          .from("predictions")
          .select("home_score_pred, away_score_pred")
          .eq("match_id", matchId);

  const communityPredictionStats =
    matchStatus === "scheduled"
      ? null
      : getCommunityPredictionStats(
          (communityPredictionData ?? []) as Pick<
            PredictionRow,
            "home_score_pred" | "away_score_pred"
          >[],
          match
        );

  const outcome = getOutcome({ matchStatus, match, prediction });
  const { totalPoints, breakdown } = getPointsAndBreakdown(outcome, isPumaMatch, t);
  const outcomeContent = getOutcomeContent(outcome, totalPoints, t);

  return {
    match,
    teams,
    prediction,
    hasPumaTeam,
    isDualPuma,
    primaryPumaTeam,
    pumaTeams,
    isPumaMatch,
    matchStatus,
    outcome,
    totalPoints,
    breakdown,
    outcomeContent,
    communityPredictionStats,
  };
}