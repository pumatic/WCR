"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { buttonStyles } from "@/lib/ui";

type PredictionFormProps = {
  matchId: string;
  userId: string;
  matchDatetime: string | null;
  initialHomeScore?: number | null;
  initialAwayScore?: number | null;
};

export default function PredictionForm({
  matchId,
  userId,
  matchDatetime,
  initialHomeScore = null,
  initialAwayScore = null,
}: PredictionFormProps) {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const t = useTranslations("predictionForm");

  const [homeScore, setHomeScore] = useState(
    initialHomeScore !== null ? String(initialHomeScore) : ""
  );
  const [awayScore, setAwayScore] = useState(
    initialAwayScore !== null ? String(initialAwayScore) : ""
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHomeScore(initialHomeScore !== null ? String(initialHomeScore) : "");
    setAwayScore(initialAwayScore !== null ? String(initialAwayScore) : "");
  }, [initialHomeScore, initialAwayScore]);

  const PREDICTION_LOCK_BUFFER_MS = 60 * 60 * 1000;

  const predictionDeadline = matchDatetime
    ? new Date(matchDatetime).getTime() - PREDICTION_LOCK_BUFFER_MS
    : null;

  const isLocked = matchDatetime
    ? new Date(matchDatetime).getTime() <= Date.now()
    : false;

  const isEditing =
    initialHomeScore !== null || initialAwayScore !== null;

  async function handleSave() {
    setMessage(null);
    setError(null);

    if (isLocked) {
      setError(t("errors.locked"));
      return;
    }

    if (homeScore === "" || awayScore === "") {
      setError(t("errors.missingScores"));
      return;
    }

    const parsedHome = Number(homeScore);
    const parsedAway = Number(awayScore);

    if (
      Number.isNaN(parsedHome) ||
      Number.isNaN(parsedAway) ||
      !Number.isInteger(parsedHome) ||
      !Number.isInteger(parsedAway) ||
      parsedHome < 0 ||
      parsedAway < 0
    ) {
      setError(t("errors.invalidScores"));
      return;
    }

    setLoading(true);

    try {
      const { error: upsertError } = await supabase
        .from("predictions")
        .upsert(
          {
            user_id: userId,
            match_id: matchId,
            home_score_pred: parsedHome,
            away_score_pred: parsedAway,
          },
          {
            onConflict: "user_id,match_id",
          }
        );

      if (upsertError) {
        setError(
          t("errors.saveFailed", { message: upsertError.message })
        );
        return;
      }

      setMessage(
        isEditing ? t("success.updated") : t("success.saved")
      );

      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-sm text-slate-600">
          {t("description")}
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={homeScore}
          onChange={(e) => setHomeScore(e.target.value)}
          disabled={isLocked || loading}
          aria-label={t("aria.homeScore")}
          className="h-14 w-16 rounded-2xl border border-slate-300 bg-white px-3 text-center text-2xl font-bold text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:h-16 sm:w-20"
          placeholder="0"
        />

        <span className="text-2xl font-bold text-slate-400">-</span>

        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={awayScore}
          onChange={(e) => setAwayScore(e.target.value)}
          disabled={isLocked || loading}
          aria-label={t("aria.awayScore")}
          className="h-14 w-16 rounded-2xl border border-slate-300 bg-white px-3 text-center text-2xl font-bold text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:h-16 sm:w-20"
          placeholder="0"
        />
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || isLocked}
          className={`${buttonStyles.primary} min-w-[220px] px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {loading
            ? t("buttons.saving")
            : isEditing
              ? t("buttons.update")
              : t("buttons.save")}
        </button>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}