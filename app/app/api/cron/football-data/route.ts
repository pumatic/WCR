import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getWorldCupMatches,
  kickoffsMatch,
  mapFootballDataStatus,
  teamsMatch,
} from "@/lib/football-data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type LocalMatch = {
  id: string;
  home_team: string;
  away_team: string;
  match_datetime: string | null;
  status: "upcoming" | "live" | "finished";
  home_score: number | null;
  away_score: number | null;
  is_prediction_open: boolean;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function syncMatches(dryRun: boolean) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  if (!dryRun) {
    const { error: kickoffUpdateError } = await supabase
      .from("matches")
      .update({
        status: "live",
        is_prediction_open: false,
      })
      .eq("status", "upcoming")
      .lte("match_datetime", now);

    if (kickoffUpdateError) {
      throw new Error(`Could not mark started matches live: ${kickoffUpdateError.message}`);
    }
  }

  const [{ data: localData, error: localError }, externalMatches] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, home_team, away_team, match_datetime, status, home_score, away_score, is_prediction_open"
      ),
    getWorldCupMatches(),
  ]);

  if (localError) {
    throw new Error(`Could not load local matches: ${localError.message}`);
  }

  const localMatches = (localData as LocalMatch[] | null) ?? [];
  const updated: Array<{
    localId: string;
    externalId: number;
    match: string;
    status: string;
    score: string | null;
  }> = [];
  const unmatched: Array<{
    externalId: number;
    match: string;
    kickoff: string;
    closestLocalMatches: Array<{
      localId: string;
      match: string;
      kickoff: string | null;
      kickoffDifferenceMinutes: number | null;
    }>;
  }> = [];

  for (const external of externalMatches) {
    const namedLocal = localMatches.find(
      (candidate) =>
        teamsMatch(candidate.home_team, candidate.away_team, external) &&
        kickoffsMatch(candidate.match_datetime, external.utcDate)
    );
    const hasExternalTeams = Boolean(
      external.homeTeam.name && external.awayTeam.name
    );
    const kickoffOnlyCandidates = hasExternalTeams
      ? []
      : localMatches.filter(
          (candidate) =>
            candidate.match_datetime &&
            new Date(candidate.match_datetime).getTime() ===
              new Date(external.utcDate).getTime()
        );
    const local =
      namedLocal ??
      (kickoffOnlyCandidates.length === 1 ? kickoffOnlyCandidates[0] : undefined);

    if (!local) {
      const externalKickoff = new Date(external.utcDate).getTime();
      const closestLocalMatches = localMatches
        .map((candidate) => {
          const candidateKickoff = candidate.match_datetime
            ? new Date(candidate.match_datetime).getTime()
            : Number.NaN;
          const difference = Number.isFinite(candidateKickoff)
            ? Math.abs(candidateKickoff - externalKickoff)
            : Number.POSITIVE_INFINITY;

          return {
            localId: candidate.id,
            match: `${candidate.home_team} vs ${candidate.away_team}`,
            kickoff: candidate.match_datetime,
            kickoffDifferenceMinutes: Number.isFinite(difference)
              ? Math.round(difference / 60_000)
              : null,
            difference,
          };
        })
        .sort((a, b) => a.difference - b.difference)
        .slice(0, 3)
        .map(({ difference: _difference, ...candidate }) => candidate);

      unmatched.push({
        externalId: external.id,
        match: `${external.homeTeam.name} vs ${external.awayTeam.name}`,
        kickoff: external.utcDate,
        closestLocalMatches,
      });
      continue;
    }

    const nextStatus = mapFootballDataStatus(external.status, external.utcDate);
    const externalHomeScore = external.score.fullTime?.home ?? null;
    const externalAwayScore = external.score.fullTime?.away ?? null;
    const payload: {
      status?: "upcoming" | "live" | "finished";
      is_prediction_open?: boolean;
      home_score?: number;
      away_score?: number;
    } = {};

    if (
      nextStatus &&
      !(local.status === "finished" && nextStatus !== "finished") &&
      nextStatus !== local.status
    ) {
      payload.status = nextStatus;
    }

    if (nextStatus === "live" || nextStatus === "finished") {
      payload.is_prediction_open = false;
    }

    if (externalHomeScore !== null && externalAwayScore !== null) {
      if (
        externalHomeScore !== local.home_score ||
        externalAwayScore !== local.away_score
      ) {
        payload.home_score = externalHomeScore;
        payload.away_score = externalAwayScore;
      }
    }

    if (Object.keys(payload).length === 0) continue;

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("matches")
        .update(payload)
        .eq("id", local.id);

      if (updateError) {
        throw new Error(
          `Could not update ${local.home_team} vs ${local.away_team}: ${updateError.message}`
        );
      }
    }

    updated.push({
      localId: local.id,
      externalId: external.id,
      match: `${local.home_team} vs ${local.away_team}`,
      status: payload.status ?? local.status,
      score:
        externalHomeScore !== null && externalAwayScore !== null
          ? `${externalHomeScore}-${externalAwayScore}`
          : null,
    });
  }

  return {
    dryRun,
    checkedAt: now,
    providerMatches: externalMatches.length,
    localMatches: localMatches.length,
    updated,
    unmatched: unmatched.slice(0, 20),
    unmatchedCount: unmatched.length,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";
    return NextResponse.json(await syncMatches(dryRun));
  } catch (error) {
    console.error("[football-data-sync]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown sync error",
      },
      { status: 500 }
    );
  }
}
