// app/match/[id]/page.tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAuthenticatedUser } from "@/lib/auth-guard";
import PredictionSection from "@/components/PredictionSection";
import CloseMatchDetailButton from "@/components/CloseMatchDetailButton";
import MatchHeaderCard from "@/components/match/MatchHeaderCard";
import PumaHighlightCard from "@/components/match/PumaHighlightCard";
import MatchOutcomeCard from "@/components/match/MatchOutcomeCard";
import MatchPointsBreakdownCard from "@/components/match/MatchPointsBreakdownCard";
import { getMatchDetailData } from "@/lib/get-match-detail-data";
import {
  getPumaCardText,
  getStatusLabel,
  parseScore,
  PredictionSectionRow,
} from "@/lib/match-detail";

type Props = {
  params: Promise<{
    locale: string;
    id: string;
  }>;
};

function ScoreBox({
  value,
}: {
  value: string | number | null | undefined;
}) {
  const displayValue =
    value == null || String(value).trim() === "" ? "-" : String(value);

  return (
    <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-[84px] sm:w-[84px]">
      <span className="text-3xl font-extrabold text-slate-900">
        {displayValue}
      </span>
    </div>
  );
}

export default async function MatchDetailPage({ params }: Props) {
  const { locale, id } = await params;
  await getTranslations("match");

  const {
    supabase: supabaseServer,
    user,
  } = await requireAuthenticatedUser();

  const t = await getTranslations("matchDetail");

  const data = await getMatchDetailData({
    supabaseServer,
    matchId: id,
    userId: user.id,
    t,
  });

  if (!data) {
    notFound();
  }

  const {
    match,
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
  } = data;

  const predictionForSection: PredictionSectionRow | null = prediction
    ? {
        id: prediction.id,
        home_score_pred: prediction.home_score_pred,
        away_score_pred: prediction.away_score_pred,
        points: matchStatus === "finished" ? totalPoints : null,
        exact_hit: outcome === "exact",
      }
    : null;

  return (
    <main className="flex w-full flex-col gap-6">
      <div className="flex justify-end">
        <CloseMatchDetailButton />
      </div>

      <MatchHeaderCard
        matchStatusLabel={getStatusLabel(matchStatus, t)}
        isPumaMatch={isPumaMatch}
        stage={match.stage}
        matchDatetime={match.match_datetime}
        homeTeam={match.home_team}
        awayTeam={match.away_team}
        homeFlag={match.home_flag}
        awayFlag={match.away_flag}
        stadium={match.stadium}
        city={match.city}
        scoreSlot={
          <div className="flex items-center justify-center gap-3">
            <ScoreBox value={match.home_score} />
            <div className="text-xl font-bold text-slate-400">-</div>
            <ScoreBox value={match.away_score} />
          </div>
        }
      />

      {hasPumaTeam ? (
        <PumaHighlightCard
          isDualPuma={isDualPuma}
          pumaTeams={pumaTeams}
          primaryPumaTeam={primaryPumaTeam}
          text={getPumaCardText(pumaTeams, primaryPumaTeam, isDualPuma)}
        />
      ) : null}

      <MatchOutcomeCard
        badge={outcomeContent.badge}
        title={outcomeContent.title}
        subtitle={outcomeContent.subtitle}
        description={outcomeContent.description}
        containerClass={outcomeContent.containerClass}
        badgeClass={outcomeContent.badgeClass}
      />

      <PredictionSection
        matchId={match.id}
        matchDatetime={match.match_datetime}
        homeTeam={match.home_team}
        awayTeam={match.away_team}
        homeScore={parseScore(match.home_score)}
        awayScore={parseScore(match.away_score)}
        userId={user.id}
        prediction={predictionForSection}
        matchStatus={matchStatus}
      />

      {matchStatus === "finished" ? (
        <MatchPointsBreakdownCard
          breakdown={breakdown}
          totalPoints={totalPoints}
        />
      ) : null}
    </main>
  );
}