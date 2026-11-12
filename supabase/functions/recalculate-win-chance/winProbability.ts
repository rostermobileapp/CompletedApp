/**
 * Roster — Game Win Probability ("Odds") Engine
 * ------------------------------------------------
 * Pure function: give it the current stats for both teams and it returns a
 * win probability. Re-run it whenever a score, player stat, goalie stat, or
 * RSVP changes and the prediction is automatically up to date.
 *
 * THE MODEL (3 stages)
 *
 *  Stage 1 — Expected goals for each team (hockey's natural currency)
 *      λ_A = Off_A × Def_B ÷ μ
 *      λ_B = Off_B × Def_A ÷ μ
 *    where
 *      μ      = average goals per team per game (league, or both teams combined)
 *      Off_X  = team X's goals-for rate × Lineup factor × Bench factor
 *      Def_X  = goals team X's goalie is expected to allow (recent + season GAA)
 *
 *    Lineup factor = (form-adjusted avg production of tonight's expected skaters)
 *                    ÷ (avg production of a typical night's lineup)
 *      • Production per player = (goals + 0.75·assists) per game, shrunk toward
 *        the team average so 1–2 game samples don't swing things.
 *      • Hot/cold streaks: a player's rate is blended 65% season / 35% last-4-games
 *        (same window as the Streaks feature). Hot players push it up, cold down.
 *      • RSVP weighting: In = 1, Maybe = 0.5, Out = 0, No reply = the player's
 *        historical attendance rate. So your top scorer RSVPing "Out" drops it;
 *        a weak player out barely moves it.
 *
 *  Stage 2 — Convert goals to a win chance (Poisson scoring model)
 *      P(A scores a) = e^(−λ_A) λ_A^a / a!   (same for B)
 *      P_win = Σ P(A=a)·P(B=b) over a > b,  P_tie = Σ over a = b
 *      Ties split 50/50 (shootout/OT leagues) unless allowTies = true.
 *
 *  Stage 3 — Momentum adjustments in log-odds space
 *      z = ln(P/(1−P))
 *        + 0.80 · (Win%_A − Win%_B)          overall record (shrunk toward .500)
 *        + 0.25 · (Streak_A − Streak_B)      streak, capped at ±5 games → ±1
 *        + 0.40 · H2H                        prior meetings, recency-weighted
 *
 *    Bench factor: −3% offense (and +3% goals allowed) per expected skater
 *    under 10, an extra −5% per skater under 7. Goalie Out = +25% goals allowed.
 *      P_final = 1 / (1 + e^(−z)), clamped to 5%–95% (it's beer league)
 *
 *  Extras for the "View Odds" pop-up
 *    • Projected score: most likely exact final in which the favorite wins
 *    • Win by 2+: each team's chance of a 2+ goal win
 *    • Over/under: line = floor(λ_A + λ_B) + 0.5; total goals ~ Poisson(λ_A + λ_B)
 *    • Top scorers: each player's projected points tonight =
 *        team expected goals × team points-per-goal × player's share,
 *        share = (attendance × form-adjusted points/game) ÷ Σ same over roster.
 *      Chance of at least 1 point = 1 − e^(−projected points).
 */

// ---------- Inputs ----------

export type Rsvp = "in" | "out" | "maybe" | "none";

export interface GameLine {
  goals: number;
  assists: number;
}

export interface SkaterInput {
  id: string;
  name?: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  /** Most recent games this player played, newest first (up to 4 used). */
  recentGames: GameLine[];
  rsvp: Rsvp;
}

export interface GoalieInput {
  id: string;
  name?: string;
  gamesPlayed: number;
  goalsAgainst: number;
  /** Goals allowed in his most recent games, newest first (up to 5 used). */
  recentGoalsAgainst: number[];
  rsvp: Rsvp;
}

export interface TeamInput {
  name?: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number; // include OT/shootout losses here if your league tracks them that way
  goalsFor: number;
  goalsAgainst: number;
  /** +3 = won last 3, −2 = lost last 2, 0 = none/tie */
  streak: number;
  skaters: SkaterInput[];
  /** Goalies on the roster; the one RSVP'd "in" (or first non-"out") is used. */
  goalies: GoalieInput[];
}

/** Prior meetings from Team A's perspective, newest first. */
export interface HeadToHeadGame {
  goalsForA: number;
  goalsForB: number;
}

export interface PredictOptions {
  /** League average goals per team per game, if you have league data. */
  leagueAvgGoals?: number;
  /** true = ties are a real result (show a tie %); false = split ties 50/50. */
  allowTies?: boolean;
}

// ---------- Tunable constants ----------

export const WEIGHTS = {
  assistWeight: 0.75, // an assist is worth 75% of a goal for production
  formWeight: 0.35, // last-4 games share of a player's rate (hot/cold)
  formWindow: 4,
  goalieRecentWindow: 5,
  goalieRecentShare: 0.6,
  playerShrinkGames: 3, // phantom team-average games added to each player
  teamShrinkGames: 3, // phantom league-average games added to team rates
  goalieShrinkGames: 2,
  noGoaliePenalty: 1.25, // goalie Out & no backup → allow 25% more
  fullBench: 10, // 2 full lines; each skater below this = tired legs
  shortBenchPenaltyPerSkater: 0.03,
  severeBench: 7, // below this it gets ugly fast
  severeBenchPenaltyPerSkater: 0.05,
  maybeAttendance: 0.5,
  record: 0.8,
  streak: 0.25,
  streakCap: 5,
  h2h: 0.4,
  h2hRecencyDecay: 0.6, // each older meeting counts 60% of the one after it
  h2hMarginCap: 3, // a 3+ goal win counts as a full result
  minProb: 0.05,
  maxProb: 0.95,
  defaultGoals: 3.5, // fallback μ when there's no data yet
};

// ---------- Helpers ----------

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const shrink = (total: number, n: number, prior: number, k: number) =>
  (total + k * prior) / (n + k);
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const production = (g: number, a: number) => g + WEIGHTS.assistWeight * a;

function poissonPmf(lambda: number, maxGoals: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  for (let k = 0; k <= maxGoals; k++) {
    out.push(p);
    p = (p * lambda) / (k + 1);
  }
  return out;
}

function attendanceProb(rsvp: Rsvp, historicalRate: number): number {
  switch (rsvp) {
    case "in":
      return 1;
    case "out":
      return 0;
    case "maybe":
      return WEIGHTS.maybeAttendance;
    default:
      return historicalRate;
  }
}

// ---------- Stage 1 pieces ----------

export interface PlayerProjection {
  id: string;
  name: string;
  projectedPoints: number;
  chanceOfPoint: number; // 0–1
  form: "hot" | "cold" | null;
}

interface LineupPlayer {
  id: string;
  name: string;
  att: number;
  pointRate: number; // form-adjusted points (G+A) per game
  form: "hot" | "cold" | null;
}

interface LineupResult {
  lineupFactor: number;
  benchFactor: number;
  expectedSkaters: number;
  missingProduction: { name: string; perGame: number }[];
  hotPlayers: string[];
  coldPlayers: string[];
  players: LineupPlayer[];
  teamPointsPerGoal: number;
}

function lineupStrength(team: TeamInput): LineupResult {
  const skaters = team.skaters;
  const teamGP = Math.max(team.gamesPlayed, 1);

  // Team average production per player-game (the shrinkage target).
  const totalProd = skaters.reduce((s, p) => s + production(p.goals, p.assists), 0);
  const totalGP = skaters.reduce((s, p) => s + p.gamesPlayed, 0);
  const teamAvgRate = totalGP > 0 ? totalProd / totalGP : 0.5;
  const totalPts = skaters.reduce((s, p) => s + p.goals + p.assists, 0);
  const teamAvgPts = totalGP > 0 ? totalPts / totalGP : 0.6;
  const players: LineupPlayer[] = [];

  let tonightW = 0,
    tonightSum = 0,
    typicalW = 0,
    typicalSum = 0;
  const missing: { name: string; perGame: number }[] = [];
  const hot: string[] = [];
  const cold: string[] = [];

  for (const p of skaters) {
    const seasonRate = shrink(
      production(p.goals, p.assists),
      p.gamesPlayed,
      teamAvgRate,
      WEIGHTS.playerShrinkGames
    );

    // Hot/cold form (only once a full window exists, matching Streaks)
    let rate = seasonRate;
    let pointRate = shrink(p.goals + p.assists, p.gamesPlayed, teamAvgPts, WEIGHTS.playerShrinkGames);
    let form: "hot" | "cold" | null = null;
    const recent = p.recentGames.slice(0, WEIGHTS.formWindow);
    if (recent.length >= WEIGHTS.formWindow) {
      const recentRate =
        recent.reduce((s, g) => s + production(g.goals, g.assists), 0) / recent.length;
      rate = (1 - WEIGHTS.formWeight) * seasonRate + WEIGHTS.formWeight * recentRate;
      const recentPts = recent.reduce((s, g) => s + g.goals + g.assists, 0) / recent.length;
      pointRate = (1 - WEIGHTS.formWeight) * pointRate + WEIGHTS.formWeight * recentPts;
      if (recentRate > seasonRate * 1.25 && recentRate - seasonRate >= 0.25) {
        hot.push(p.name ?? p.id);
        form = "hot";
      }
      if (recentRate < seasonRate * 0.75 && seasonRate - recentRate >= 0.25) {
        cold.push(p.name ?? p.id);
        form = "cold";
      }
    }

    const histAttendance = clamp(p.gamesPlayed / teamGP, 0.2, 1);
    const att = attendanceProb(p.rsvp, histAttendance);
    players.push({ id: p.id, name: p.name ?? p.id, att, pointRate, form });

    tonightW += att;
    tonightSum += att * rate;
    typicalW += histAttendance;
    typicalSum += histAttendance * seasonRate;

    if (p.rsvp === "out" && p.gamesPlayed > 0)
      missing.push({ name: p.name ?? p.id, perGame: seasonRate });
  }

  const tonightAvg = tonightW > 0 ? tonightSum / tonightW : teamAvgRate;
  const typicalAvg = typicalW > 0 ? typicalSum / typicalW : teamAvgRate;
  const lineupFactor =
    typicalAvg > 0 ? clamp(tonightAvg / typicalAvg, 0.6, 1.4) : 1;

  const shortBy = Math.max(0, WEIGHTS.fullBench - tonightW);
  const severeBy = Math.max(0, WEIGHTS.severeBench - tonightW);
  const benchFactor = clamp(
    1 -
      WEIGHTS.shortBenchPenaltyPerSkater * shortBy -
      WEIGHTS.severeBenchPenaltyPerSkater * severeBy,
    0.6,
    1
  );

  missing.sort((a, b) => b.perGame - a.perGame);
  // Points credited per team goal (≈1 goal + assists), shrunk toward 2.0
  const teamPointsPerGoal = (totalPts + 2 * 5) / (team.goalsFor + 5);
  return {
    players,
    teamPointsPerGoal,
    lineupFactor,
    benchFactor,
    expectedSkaters: tonightW,
    missingProduction: missing,
    hotPlayers: hot,
    coldPlayers: cold,
  };
}

function goalieExpectedGA(team: TeamInput, mu: number): { gaa: number; goalie: string | null } {
  const teamGA = shrink(team.goalsAgainst, team.gamesPlayed, mu, WEIGHTS.teamShrinkGames);
  const g =
    team.goalies.find((x) => x.rsvp === "in") ??
    team.goalies.find((x) => x.rsvp === "none" || x.rsvp === "maybe");

  if (!g) return { gaa: teamGA * WEIGHTS.noGoaliePenalty, goalie: null };

  const season = shrink(g.goalsAgainst, g.gamesPlayed, teamGA, WEIGHTS.teamShrinkGames);
  const recentGames = g.recentGoalsAgainst.slice(0, WEIGHTS.goalieRecentWindow);
  const recent = shrink(
    recentGames.reduce((s, x) => s + x, 0),
    recentGames.length,
    season,
    WEIGHTS.goalieShrinkGames
  );
  let gaa = WEIGHTS.goalieRecentShare * recent + (1 - WEIGHTS.goalieRecentShare) * season;
  if (g.rsvp === "maybe") gaa = 0.5 * gaa + 0.5 * teamGA * WEIGHTS.noGoaliePenalty;
  return { gaa, goalie: g.name ?? g.id };
}

// ---------- Stage 3 pieces ----------

const recordPct = (t: TeamInput) => (t.wins + 0.5 * t.ties + 2.5) / (t.gamesPlayed + 5);
const streakScore = (t: TeamInput) =>
  clamp(t.streak, -WEIGHTS.streakCap, WEIGHTS.streakCap) / WEIGHTS.streakCap;

function headToHeadScore(h2h: HeadToHeadGame[]): number {
  if (!h2h.length) return 0;
  let wSum = 0,
    rSum = 0,
    w = 1;
  for (const g of h2h) {
    const r = clamp((g.goalsForA - g.goalsForB) / WEIGHTS.h2hMarginCap, -1, 1);
    rSum += w * r;
    wSum += w;
    w *= WEIGHTS.h2hRecencyDecay;
  }
  const confidence = h2h.length / (h2h.length + 1.5); // 1 game ≈ 40%, 3 games ≈ 67%
  return (rSum / wSum) * confidence;
}

function projectScorers(l: LineupResult, teamXG: number, top = 3): PlayerProjection[] {
  const weightSum = l.players.reduce((s, p) => s + p.att * p.pointRate, 0);
  if (weightSum <= 0) return [];
  const teamPoints = teamXG * l.teamPointsPerGoal;
  return l.players
    .filter((p) => p.att > 0)
    .map((p) => {
      const projectedPoints = (teamPoints * p.att * p.pointRate) / weightSum;
      return {
        id: p.id,
        name: p.name,
        projectedPoints,
        chanceOfPoint: 1 - Math.exp(-projectedPoints),
        form: p.form,
      };
    })
    .sort((a, b) => b.projectedPoints - a.projectedPoints)
    .slice(0, top);
}

// ---------- Main ----------

export interface Prediction {
  winProbA: number; // 0–1, ties already split unless allowTies
  winProbB: number;
  tieProb: number; // 0 unless allowTies
  expectedGoalsA: number;
  expectedGoalsB: number;
  moneylineA: string; // "−150" / "+130" style, for fun
  moneylineB: string;
  projectedScore: { a: number; b: number };
  winBy2A: number;
  winBy2B: number;
  overUnder: { line: number; overProb: number };
  topScorersA: PlayerProjection[];
  topScorersB: PlayerProjection[];
  breakdown: {
    mu: number;
    lineupA: LineupResult;
    lineupB: LineupResult;
    goalieGAA_A: number;
    goalieGAA_B: number;
    goalieA: string | null;
    goalieB: string | null;
    goalModelProbA: number;
    recordAdj: number; // log-odds shifts toward A (+) or B (−)
    streakAdj: number;
    h2hAdj: number;
  };
}

export function toMoneyline(p: number): string {
  const raw = p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p;
  const rounded = Math.round(raw / 5) * 5;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function predictGame(
  A: TeamInput,
  B: TeamInput,
  h2h: HeadToHeadGame[] = [],
  opts: PredictOptions = {}
): Prediction {
  // μ — average goals per team per game
  const totalGoals = A.goalsFor + A.goalsAgainst + B.goalsFor + B.goalsAgainst;
  const totalTeamGames = 2 * (A.gamesPlayed + B.gamesPlayed);
  const mu =
    opts.leagueAvgGoals ??
    shrink(totalGoals, totalTeamGames, WEIGHTS.defaultGoals, 4);

  // Stage 1
  const lineupA = lineupStrength(A);
  const lineupB = lineupStrength(B);
  const offA =
    shrink(A.goalsFor, A.gamesPlayed, mu, WEIGHTS.teamShrinkGames) *
    lineupA.lineupFactor *
    lineupA.benchFactor;
  const offB =
    shrink(B.goalsFor, B.gamesPlayed, mu, WEIGHTS.teamShrinkGames) *
    lineupB.lineupFactor *
    lineupB.benchFactor;
  const gA = goalieExpectedGA(A, mu);
  const gB = goalieExpectedGA(B, mu);

  // A tired (short) bench also gives up more goals
  const lambdaA = Math.max(0.3, (offA * gB.gaa) / mu / lineupB.benchFactor);
  const lambdaB = Math.max(0.3, (offB * gA.gaa) / mu / lineupA.benchFactor);

  // Stage 2 — Poisson
  const maxGoals = 25;
  const pa = poissonPmf(lambdaA, maxGoals);
  const pb = poissonPmf(lambdaB, maxGoals);
  let pWin = 0,
    pTie = 0,
    pLoss = 0,
    by2A = 0,
    by2B = 0;
  let bestA = { a: 1, b: 0, p: -1 },
    bestB = { a: 0, b: 1, p: -1 };
  for (let a = 0; a <= maxGoals; a++)
    for (let b = 0; b <= maxGoals; b++) {
      const p = pa[a] * pb[b];
      if (a > b) pWin += p;
      else if (a === b) pTie += p;
      else pLoss += p;
      if (a - b >= 2) by2A += p;
      if (b - a >= 2) by2B += p;
      if (a > b && p > bestA.p) bestA = { a, b, p };
      if (b > a && p > bestB.p) bestB = { a, b, p };
    }
  const norm = pWin + pTie + pLoss;
  pWin /= norm;
  pTie /= norm;
  pLoss /= norm;
  by2A /= norm;
  by2B /= norm;

  const totalXG = lambdaA + lambdaB;
  const ouLine = Math.floor(totalXG) + 0.5;
  const pt = poissonPmf(totalXG, 60);
  let under = 0;
  for (let k = 0; k <= Math.floor(ouLine); k++) under += pt[k];
  const goalModelProbA = pWin / (pWin + pLoss); // decisive-result share

  // Stage 3 — momentum in log-odds
  const recordAdj = WEIGHTS.record * (recordPct(A) - recordPct(B));
  const streakAdj = WEIGHTS.streak * (streakScore(A) - streakScore(B));
  const h2hAdj = WEIGHTS.h2h * headToHeadScore(h2h);
  const z = logit(clamp(goalModelProbA, 0.01, 0.99)) + recordAdj + streakAdj + h2hAdj;
  const pA = clamp(sigmoid(z), WEIGHTS.minProb, WEIGHTS.maxProb);

  let winProbA: number, winProbB: number, tieProb: number;
  if (opts.allowTies) {
    tieProb = pTie;
    winProbA = pA * (1 - pTie);
    winProbB = (1 - pA) * (1 - pTie);
  } else {
    tieProb = 0;
    winProbA = pA;
    winProbB = 1 - pA;
  }

  return {
    winProbA,
    winProbB,
    tieProb,
    expectedGoalsA: lambdaA,
    expectedGoalsB: lambdaB,
    moneylineA: toMoneyline(pA),
    moneylineB: toMoneyline(1 - pA),
    projectedScore: pA >= 0.5 ? { a: bestA.a, b: bestA.b } : { a: bestB.a, b: bestB.b },
    winBy2A: by2A,
    winBy2B: by2B,
    overUnder: { line: ouLine, overProb: 1 - under },
    topScorersA: projectScorers(lineupA, lambdaA),
    topScorersB: projectScorers(lineupB, lambdaB),
    breakdown: {
      mu,
      lineupA,
      lineupB,
      goalieGAA_A: gA.gaa,
      goalieGAA_B: gB.gaa,
      goalieA: gA.goalie,
      goalieB: gB.goalie,
      goalModelProbA,
      recordAdj,
      streakAdj,
      h2hAdj,
    },
  };
}
