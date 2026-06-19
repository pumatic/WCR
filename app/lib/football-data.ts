export type FootballDataMatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: FootballDataMatchStatus;
  minute?: number | null;
  homeTeam: {
    id: number | null;
    name: string;
    shortName?: string | null;
    tla?: string | null;
  };
  awayTeam: {
    id: number | null;
    name: string;
    shortName?: string | null;
    tla?: string | null;
  };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
    regularTime?: {
      home: number | null;
      away: number | null;
    } | null;
  };
};

type FootballDataMatchesResponse = {
  matches: FootballDataMatch[];
};

const TEAM_ALIASES: Record<string, string> = {
  usa: "unitedstates",
  unitedstatesofamerica: "unitedstates",
  korearepublic: "southkorea",
  republicofkorea: "southkorea",
  iriran: "iran",
  coteivoire: "ivorycoast",
  caboverde: "capeverde",
  capeverdeislands: "capeverde",
  bosniaandherzegovina: "bosniaherzegovina",
  taarkiye: "turkey",
  turkiye: "turkey",
  drcongo: "congodr",
  democraticrepublicofthecongo: "congodr",
};

export function normalizeTeamName(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return TEAM_ALIASES[normalized] ?? normalized;
}

export function teamsMatch(
  localHome: string,
  localAway: string,
  external: FootballDataMatch
) {
  return (
    normalizeTeamName(localHome) === normalizeTeamName(external.homeTeam.name) &&
    normalizeTeamName(localAway) === normalizeTeamName(external.awayTeam.name)
  );
}

export function kickoffsMatch(localKickoff: string | null, externalKickoff: string) {
  if (!localKickoff) return false;

  const localTime = new Date(localKickoff).getTime();
  const externalTime = new Date(externalKickoff).getTime();

  if (!Number.isFinite(localTime) || !Number.isFinite(externalTime)) {
    return false;
  }

  return Math.abs(localTime - externalTime) <= 3 * 60 * 60 * 1000;
}

export function mapFootballDataStatus(
  status: FootballDataMatchStatus,
  kickoff: string
): "upcoming" | "live" | "finished" | null {
  if (status === "FINISHED" || status === "AWARDED") return "finished";

  if (status === "IN_PLAY" || status === "PAUSED") return "live";

  if (status === "SCHEDULED" || status === "TIMED") {
    return new Date(kickoff).getTime() <= Date.now() ? "live" : "upcoming";
  }

  return null;
}

export async function getWorldCupMatches() {
  const apiToken = process.env.FOOTBALL_DATA_API_TOKEN;

  if (!apiToken) {
    throw new Error("Missing FOOTBALL_DATA_API_TOKEN");
  }

  const response = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
    {
      headers: {
        "X-Auth-Token": apiToken,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `football-data.org returned ${response.status}: ${detail.slice(0, 300)}`
    );
  }

  const payload = (await response.json()) as FootballDataMatchesResponse;
  return payload.matches ?? [];
}
