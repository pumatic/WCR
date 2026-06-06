import { useTranslations } from "next-intl";
import PredictionForm from "@/components/PredictionForm";
import type { MatchStatus } from "@/lib/match-detail";

type PredictionRow = {
  id?: string;
  home_score_pred: number | null;
  away_score_pred: number | null;
  points?: number | null;
  exact_hit?: boolean | null;
};

type PredictionSectionProps = {
  matchId: string;
  matchDatetime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  userId: string | null;
  prediction: PredictionRow | null;
  matchStatus: MatchStatus;
};

function isValidDate(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function hasMatchStarted(matchDatetime: string | null) {
  if (!isValidDate(matchDatetime)) return false;
  return new Date(matchDatetime as string).getTime() <= Date.now();
}

function getPredictionOutcomeLabel(
  prediction: PredictionRow | null,
  t: ReturnType<typeof useTranslations>
) {
  if (!prediction) return null;

  const points = prediction.points ?? 0;

  if (points <= 0) {
    return {
      label: t("outcome.noPoints"),
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (prediction.exact_hit) {
    return {
      label: t("outcome.exact", { points }),
      badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }

  return {
    label: t("outcome.tendency", { points }),
    badgeClass: "bg-sky-100 text-sky-700 border-sky-200",
  };
}

function TeamScoreRow({
  homeTeam,
  awayTeam,
  homeValue,
  awayValue,
  t,
}: {
  homeTeam: string;
  awayTeam: string;
  homeValue: number | null;
  awayValue: number | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:gap-4 sm:px-5">
      <div className="min-w-0 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
          {t("labels.home")}
        </p>
        <p className="mt-2 text-sm font-semibold leading-tight text-slate-800 sm:text-base">
          {homeTeam}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xl font-extrabold text-slate-900 sm:h-14 sm:w-14">
          {homeValue ?? "-"}
        </div>

        <span className="text-lg font-bold text-slate-400 sm:text-xl">-</span>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xl font-extrabold text-slate-900 sm:h-14 sm:w-14">
          {awayValue ?? "-"}
        </div>
      </div>

      <div className="min-w-0 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
          {t("labels.away")}
        </p>
        <p className="mt-2 text-sm font-semibold leading-tight text-slate-800 sm:text-base">
          {awayTeam}
        </p>
      </div>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm md:p-6">
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
          {eyebrow}
        </p>
      ) : null}

      <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>

      {description ? (
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      ) : null}

      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function LoggedOutState() {
  const t = useTranslations("predictionSection");

  return (
    <SectionCard
      eyebrow={t("loggedOut.eyebrow")}
      title={t("loggedOut.title")}
      description={t("loggedOut.description")}
    />
  );
}

function OpenPredictionState({
  matchId,
  userId,
  matchDatetime,
  prediction,
}: {
  matchId: string;
  userId: string;
  matchDatetime: string | null;
  prediction: PredictionRow | null;
}) {
  const t = useTranslations("predictionSection");

  return (
    <SectionCard
      eyebrow={t("open.eyebrow")}
      title={prediction ? t("open.editTitle") : t("open.newTitle")}
      description={t("open.description")}
    >
      <PredictionForm
        matchId={matchId}
        userId={userId}
        matchDatetime={matchDatetime}
        initialHomeScore={prediction?.home_score_pred ?? null}
        initialAwayScore={prediction?.away_score_pred ?? null}
      />
    </SectionCard>
  );
}

function ClosedPendingState({
  prediction,
  homeTeam,
  awayTeam,
}: {
  prediction: PredictionRow | null;
  homeTeam: string;
  awayTeam: string;
}) {
  const t = useTranslations("predictionSection");

  return (
    <SectionCard
      eyebrow={t("closed.eyebrow")}
      title={
        prediction
          ? t("closed.withPredictionTitle")
          : t("closed.withoutPredictionTitle")
      }
      description={t("closed.description")}
    >
      {prediction ? (
        <div className="space-y-4">
          <TeamScoreRow
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeValue={prediction.home_score_pred}
            awayValue={prediction.away_score_pred}
            t={t}
          />

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t("closed.savedMessage")}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
          {t("closed.missedMessage")}
        </div>
      )}
    </SectionCard>
  );
}

function FinishedState({
  prediction,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
}: {
  prediction: PredictionRow | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
}) {
  const t = useTranslations("predictionSection");
  const outcome = getPredictionOutcomeLabel(prediction, t);

  const points = prediction?.points ?? 0;
  const hasPumaBonus = prediction
    ? prediction.exact_hit
      ? points > 3
      : points > 1
    : false;

  const basePoints = prediction
    ? prediction.exact_hit
      ? hasPumaBonus
        ? 3
        : points
      : hasPumaBonus
        ? 1
        : points
    : 0;

  return (
    <SectionCard
      eyebrow={t("finished.eyebrow")}
      title={t("finished.title")}
      description={t("finished.description")}
    >
      <div className="space-y-5">
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">
            {t("finished.realResult")}
          </p>
          <TeamScoreRow
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeValue={homeScore}
            awayValue={awayScore}
            t={t}
          />
        </div>

        {prediction ? (
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-700">
                {t("finished.yourPrediction")}
              </p>

              {outcome ? (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${outcome.badgeClass}`}
                >
                  {outcome.label}
                </span>
              ) : null}
            </div>

            <TeamScoreRow
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeValue={prediction.home_score_pred}
              awayValue={prediction.away_score_pred}
              t={t}
            />

            {prediction ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">
                    {t("finished.pointsEarned", { points })}
                  </div>

                  {hasPumaBonus ? (
                    <div className="rounded-xl bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-800">
                      {t("finished.pumaBonus", { points: points - basePoints })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">
              {t("finished.noPredictionTitle")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {t("finished.noPredictionDescription")}
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export default function PredictionSection({
  matchId,
  matchDatetime,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  userId,
  prediction,
  matchStatus,
}: PredictionSectionProps) {
  if (!userId) {
    return <LoggedOutState />;
  }

  const started = hasMatchStarted(matchDatetime);

  if (matchStatus === "finished") {
    return (
      <FinishedState
        prediction={prediction}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeScore={homeScore}
        awayScore={awayScore}
      />
    );
  }

  if (matchStatus === "live" || started) {
    return (
      <ClosedPendingState
        prediction={prediction}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    );
  }

  return (
    <OpenPredictionState
      matchId={matchId}
      userId={userId}
      matchDatetime={matchDatetime}
      prediction={prediction}
    />
  );
}
