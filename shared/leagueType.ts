import { z } from "zod";

export const LEAGUE_TYPES = ["adult", "high_school", "youth"] as const;
export const leagueTypeSchema = z.enum(LEAGUE_TYPES);
export const LEAGUE_TYPE_OPTIONS = [
  { value: "adult", label: "Adult" },
  { value: "high_school", label: "High School" },
  { value: "youth", label: "Youth" },
] as const;
