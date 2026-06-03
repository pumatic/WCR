import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MADRID_OFFSET = "+02:00";

type MatchSeed = {
  match_number: number;
  stage: string;
  home_team: string;
  away_team: string;
  home_flag: string | null;
  away_flag: string | null;
  source_match_date: string;
  source_kickoff_time: string;
  group_round?: number;
};

function isPlaceholderTeam(name: string | null | undefined) {
  if (!name) return true;

  const value = name.trim();

  if (/^[12][A-L]$/i.test(value)) return true;
  if (/^3[A-L]+$/i.test(value)) return true;
  if (/^Winner\s+\d+$/i.test(value)) return true;
  if (/^Loser\s+\d+$/i.test(value)) return true;
  if (/^Bronze/i.test(value)) return true;

  return false;
}

function normalizeStage(stage: string) {
  switch (stage) {
    case "Round of 32":
      return "Dieciseisavos de final";
    case "Round of 16":
      return "Octavos de final";
    case "Quarter-finals":
      return "Cuartos de final";
    case "Semi-finals":
      return "Semifinales";
    case "Third-place play-off":
      return "Tercer y cuarto puesto";
    case "Final":
      return "Final";
    default:
      return stage;
  }
}

function getIsoDatetime(date: string, time: string) {
  return `${date}T${time}:00${MADRID_OFFSET}`;
}

async function main() {
  const shouldApply = process.argv.includes("--apply");

  const dataPath = path.resolve(
    process.cwd(),
    "data/worldcup-2026-matches-official.json"
  );

  const raw = fs.readFileSync(dataPath, "utf-8");
  const matches = JSON.parse(raw) as MatchSeed[];

  const invalidMatches = matches.filter(
    (match) => !match.source_match_date || !match.source_kickoff_time
  );

  if (invalidMatches.length > 0) {
    throw new Error(
      `Hay ${invalidMatches.length} partidos sin source_match_date o source_kickoff_time`
    );
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("name, is_puma_team");

  if (teamsError) throw teamsError;

  const pumaTeams = new Set(
    (teams ?? []).filter((t) => t.is_puma_team).map((t) => t.name)
  );

  const rows = matches.map((match) => {
    const hasRealTeams =
      !isPlaceholderTeam(match.home_team) &&
      !isPlaceholderTeam(match.away_team);

    const isPumaMatch =
      pumaTeams.has(match.home_team) || pumaTeams.has(match.away_team);

    return {
      stage: normalizeStage(match.stage),
      match_number: match.match_number,
      match_datetime: getIsoDatetime(
        match.source_match_date,
        match.source_kickoff_time
      ),
      home_team: match.home_team,
      away_team: match.away_team,
      is_puma_match: isPumaMatch,
      match_time: match.source_kickoff_time,
      home_flag: match.home_flag,
      away_flag: match.away_flag,
      home_score: null,
      away_score: null,
      status: "upcoming",
      is_prediction_open: hasRealTeams,
      is_visible: hasRealTeams,
    };
  });

  console.log(`Partidos preparados: ${rows.length}`);
  console.log(`Primer partido: ${rows[0].match_datetime}`);
  console.log(`Último partido: ${rows[rows.length - 1].match_datetime}`);

  if (!shouldApply) {
    console.log("DRY RUN: no se ha insertado nada.");
    console.log("Para aplicar: npm run prod:matches -- --apply");
    return;
  }

  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) throw deleteError;

  const { error } = await supabase.from("matches").insert(rows);

  if (error) throw error;

  console.log(`✅ Partidos productivos cargados: ${rows.length}`);
}

main().catch((error) => {
  console.error("💥 Error fatal:", error);
  process.exit(1);
});