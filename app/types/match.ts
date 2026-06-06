export type MatchStatus = "upcoming" | "live" | "finished";

export type Match = {
  id: string;
  stage: string | null;
  home_team: string;
  away_team: string;
  is_puma_match: boolean | null;
  match_time: string | null;
  home_flag?: string | null;
  away_flag?: string | null;
  match_datetime: string | null;
  stadium: string | null;
  home_score: string | null;
  away_score: string | null;
  status?: MatchStatus | null;
  city: string | null;
};
