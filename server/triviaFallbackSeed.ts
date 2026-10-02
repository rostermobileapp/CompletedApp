import type { TriviaCategory, TriviaDifficulty } from "@shared/trivia";

export type TriviaFallbackQuestion = {
  slug: string;
  category: TriviaCategory;
  question: string;
  choices: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: TriviaDifficulty;
  verificationNotes: string;
};

// Stable, broadly documented hockey facts intended as continuity questions.
// The specific facts and source notes are retained with each inventory row.
const RAW_TRIVIA_FALLBACK_QUESTIONS: TriviaFallbackQuestion[] = [
  { slug: "nhl-founded-1917", category: "nhl_history", question: "In what year was the NHL founded?", choices: ["1909", "1917", "1924", "1930"], correctIndex: 1, explanation: "The National Hockey League was founded in Montreal on November 26, 1917.", difficulty: "easy", verificationNotes: "NHL official history: the league was founded in 1917." },
  { slug: "first-nhl-season", category: "nhl_history", question: "How many teams played in the NHL's first season?", choices: ["4", "6", "8", "10"], correctIndex: 0, explanation: "The NHL began with four clubs in its inaugural 1917–18 season.", difficulty: "easy", verificationNotes: "NHL historical records list four clubs for 1917–18." },
  { slug: "first-us-nhl-franchise", category: "nhl_history", question: "Which was the first U.S.-based NHL franchise?", choices: ["Boston Bruins", "New York Rangers", "Chicago Black Hawks", "Detroit Cougars"], correctIndex: 0, explanation: "The Boston Bruins joined the NHL in 1924 as its first U.S.-based team.", difficulty: "medium", verificationNotes: "NHL and Boston Bruins franchise histories identify Boston, founded in 1924, as the league's first U.S. team." },
  { slug: "nhl-original-six-name", category: "nhl_history", question: "Which nickname describes the NHL's six teams from 1942 to 1967?", choices: ["Founders Six", "Original Six", "Classic Six", "Heritage Six"], correctIndex: 1, explanation: "The six clubs that made up the NHL from 1942 until expansion in 1967 are known as the Original Six.", difficulty: "easy", verificationNotes: "NHL history commonly identifies the 1942–1967 era as the Original Six era." },

  { slug: "stanley-cup-donor", category: "stanley_cup", question: "Who donated the Stanley Cup in 1892?", choices: ["Frederick Stanley", "James Norris", "George V", "Frank Calder"], correctIndex: 0, explanation: "Lord Stanley of Preston, then Canada's governor general, donated the trophy that became the Stanley Cup.", difficulty: "easy", verificationNotes: "Hockey Hall of Fame and Stanley Cup histories identify Lord Stanley as donor." },
  { slug: "first-cup-winner", category: "stanley_cup", question: "Which club first won the Stanley Cup in 1893?", choices: ["Montreal HC", "Ottawa HC", "Quebec HC", "Winnipeg Victorias"], correctIndex: 0, explanation: "The Montreal Hockey Club won the first Stanley Cup in 1893.", difficulty: "medium", verificationNotes: "Hockey Hall of Fame Cup history records Montreal Hockey Club as the first champion in 1893." },
  { slug: "first-nhl-cup-winner", category: "stanley_cup", question: "Which team won the first Stanley Cup awarded to an NHL champion in 1918?", choices: ["Toronto Arenas", "Montreal Canadiens", "Ottawa Senators", "Boston Bruins"], correctIndex: 0, explanation: "The Toronto Arenas won the 1918 Stanley Cup, the first awarded to an NHL champion.", difficulty: "medium", verificationNotes: "NHL historical records list Toronto as the 1918 Stanley Cup champion." },
  { slug: "cup-engraving", category: "stanley_cup", question: "What happens to the oldest band of the Stanley Cup when it is full?", choices: ["It is retired", "It is melted down", "It is moved to the top", "It is painted over"], correctIndex: 0, explanation: "The oldest band is removed and displayed at the Hockey Hall of Fame as a new band is added.", difficulty: "medium", verificationNotes: "Hockey Hall of Fame's Stanley Cup Keeper of the Cup history explains band rotation." },

  { slug: "wayne-gretzky-number", category: "players_legends", question: "Which number did Wayne Gretzky wear for most of his NHL career?", choices: ["9", "19", "99", "29"], correctIndex: 2, explanation: "Wayne Gretzky wore number 99, which the NHL retired league-wide in his honor.", difficulty: "easy", verificationNotes: "NHL official player history; number 99 was retired league-wide in 2000." },
  { slug: "gordie-howe-position", category: "players_legends", question: "What position did Gordie Howe primarily play?", choices: ["Right wing", "Goaltender", "Center", "Defense"], correctIndex: 0, explanation: "Gordie Howe was a right wing throughout his celebrated NHL career.", difficulty: "easy", verificationNotes: "Hockey Hall of Fame and NHL player biographies list Howe as a right wing." },
  { slug: "jean-beliveau-cups", category: "players_legends", question: "How many Stanley Cups did Jean Beliveau win as a player?", choices: ["5", "7", "10", "12"], correctIndex: 2, explanation: "Jean Beliveau won 10 Stanley Cups as a player with Montreal.", difficulty: "medium", verificationNotes: "Hockey Hall of Fame and NHL biographies credit Beliveau with 10 Stanley Cup championships as a player." },

  { slug: "first-50-goal-season", category: "records_stats", question: "Who first scored 50 goals in an NHL season?", choices: ["Babe Dye", "Maurice Richard", "Gordie Howe", "Jean Beliveau"], correctIndex: 1, explanation: "Maurice Richard became the first NHL player to score 50 goals in a season in 1944–45.", difficulty: "medium", verificationNotes: "NHL historical records identify Richard's 50 goals in 1944–45 as the first 50-goal season." },
  { slug: "gretzky-single-season-goals", category: "records_stats", question: "How many goals did Wayne Gretzky score in his 1981–82 record season?", choices: ["76", "84", "92", "100"], correctIndex: 2, explanation: "Gretzky scored 92 goals in 1981–82, an NHL single-season record.", difficulty: "medium", verificationNotes: "NHL season records list Wayne Gretzky's 92 goals in 1981–82 as the single-season record." },
  { slug: "three-goals-hat-trick", category: "records_stats", question: "How many goals make a hat trick in hockey?", choices: ["2", "3", "4", "5"], correctIndex: 1, explanation: "A player scores a hat trick by scoring three goals in one game.", difficulty: "easy", verificationNotes: "Standard hockey scoring terminology." },

  { slug: "red-wings-original-name", category: "teams_franchises", question: "What was the Detroit Red Wings' original name?", choices: ["Detroit Cougars", "Detroit Falcons", "Detroit Vipers", "Detroit Nationals"], correctIndex: 0, explanation: "The franchise now known as the Detroit Red Wings began play as the Detroit Cougars in 1926.", difficulty: "medium", verificationNotes: "Detroit Red Wings and NHL franchise histories identify the 1926 club as the Detroit Cougars." },
  { slug: "canadiens-habs-nickname", category: "teams_franchises", question: "What nickname is commonly used for the Montreal Canadiens?", choices: ["The Habs", "The Bolts", "The Isles", "The Avs"], correctIndex: 0, explanation: "The Montreal Canadiens are widely known by the nickname the Habs.", difficulty: "easy", verificationNotes: "Montreal Canadiens and Hockey Hall of Fame histories document the club's Habs nickname." },
  { slug: "blackhawks-first-cup", category: "teams_franchises", question: "In what year did the Chicago Black Hawks win their first Stanley Cup?", choices: ["1927", "1934", "1941", "1961"], correctIndex: 1, explanation: "Chicago won its first Stanley Cup in 1934.", difficulty: "medium", verificationNotes: "NHL and franchise histories list Chicago's first Stanley Cup championship in 1934." },
  { slug: "maple-leafs-original-name", category: "teams_franchises", question: "What was Toronto's NHL franchise called immediately before it became the Maple Leafs in 1927?", choices: ["Toronto St. Patricks", "Toronto Arenas", "Toronto Torontos", "Toronto Bulldogs"], correctIndex: 0, explanation: "The franchise was known as the Toronto St. Patricks immediately before adopting the Maple Leafs name in 1927.", difficulty: "medium", verificationNotes: "Toronto Maple Leafs and NHL franchise histories record the Toronto St. Patricks name before 1927." },

  { slug: "hockey-faceoff", category: "hockey_culture", question: "What is the puck drop that starts play called?", choices: ["Faceoff", "Icing", "Change", "Rink toss"], correctIndex: 0, explanation: "A faceoff is used to start play and resume it after many stoppages.", difficulty: "easy", verificationNotes: "Official NHL rulebook definition of faceoff." },
  { slug: "hockey-penalty-box", category: "hockey_culture", question: "Where does a penalized player serve time off the ice?", choices: ["Penalty box", "Sin bin door", "Blue room", "Goal crease"], correctIndex: 0, explanation: "A penalized player serves the required time in the penalty box.", difficulty: "easy", verificationNotes: "Standard hockey rules and rink terminology." },
  { slug: "hockey-icing", category: "hockey_culture", question: "What is icing in hockey?", choices: ["A puck sent down ice past the goal line", "A goalie freezing the puck", "A delayed offside", "A stick infraction"], correctIndex: 0, explanation: "Icing generally occurs when a team shoots the puck from its side of center beyond the opposing goal line without it being touched.", difficulty: "medium", verificationNotes: "NHL Rule  icing definition; phrasing summarizes the standard rule." },

  { slug: "movie-mighty-ducks", category: "movies_media", question: "What is the youth hockey team called in The Mighty Ducks?", choices: ["The Ducks", "The Hawks", "The Rangers", "The Chiefs"], correctIndex: 0, explanation: "Coach Gordon Bombay leads the youth team called the Ducks in the 1992 film.", difficulty: "easy", verificationNotes: "1992 film The Mighty Ducks plot and official Disney synopsis." },
  { slug: "movie-slap-shot-coach", category: "movies_media", question: "Which actor plays player-coach Reggie Dunlop in Slap Shot?", choices: ["Paul Newman", "Burt Reynolds", "Kurt Russell", "Robert Redford"], correctIndex: 0, explanation: "Paul Newman stars as Reggie Dunlop in the 1977 hockey comedy Slap Shot.", difficulty: "easy", verificationNotes: "Slap Shot (1977) film credits list Paul Newman as Reggie Dunlop." },
  { slug: "movie-miracle-coach", category: "movies_media", question: "Who coached the U.S. team in the film Miracle?", choices: ["Herb Brooks", "Pat Quinn", "Scotty Bowman", "Herb Carnegie"], correctIndex: 0, explanation: "Herb Brooks coached the 1980 U.S. Olympic men's hockey team portrayed in Miracle.", difficulty: "easy", verificationNotes: "The film Miracle (2004) depicts Herb Brooks coaching the 1980 U.S. Olympic team." },

  { slug: "slang-five-hole", category: "nicknames_slang", question: "In hockey slang, what is the 'five-hole'?", choices: ["Space between a goalie's legs", "Top corner of the net", "Gap between defenders", "Center faceoff dot"], correctIndex: 0, explanation: "The five-hole is the opening between a goaltender's legs.", difficulty: "easy", verificationNotes: "Standard hockey terminology used by NHL and Hockey Hall of Fame explainers." },
  { slug: "slang-lamp-lighter", category: "nicknames_slang", question: "In hockey slang, what does 'light the lamp' mean?", choices: ["Score a goal", "Change lines", "Win a faceoff", "Block a shot"], correctIndex: 0, explanation: "To light the lamp is to score, referring to the goal light that signals a goal.", difficulty: "easy", verificationNotes: "Common hockey slang; goal lamp lights after a goal." },
  { slug: "nickname-super-mario", category: "nicknames_slang", question: "Which hockey star is often called 'Super Mario'?", choices: ["Mario Lemieux", "Mario Tremblay", "Mario Marois", "Mario Gosselin"], correctIndex: 0, explanation: "Pittsburgh Penguins legend Mario Lemieux is widely known as Super Mario.", difficulty: "easy", verificationNotes: "Mario Lemieux's Hockey Hall of Fame and NHL biographies document the nickname." },

  { slug: "arena-montreal", category: "arenas_fans", question: "What is the Montreal Canadiens' home arena called?", choices: ["Bell Centre", "Scotiabank Arena", "Madison Square Garden", "TD Garden"], correctIndex: 0, explanation: "The Canadiens play their home games at the Bell Centre in Montreal.", difficulty: "easy", verificationNotes: "Montreal Canadiens official venue information." },
  { slug: "arena-edmonton", category: "arenas_fans", question: "What is the Edmonton Oilers' home arena called?", choices: ["Rogers Place", "Rogers Arena", "Canada Life Centre", "Climate Pledge Arena"], correctIndex: 0, explanation: "The Oilers' home arena in Edmonton is Rogers Place.", difficulty: "easy", verificationNotes: "Edmonton Oilers official venue information." },
  { slug: "arena-toronto", category: "arenas_fans", question: "What is the Toronto Maple Leafs' home arena called?", choices: ["Scotiabank Arena", "Bell Centre", "Little Caesars Arena", "United Center"], correctIndex: 0, explanation: "The Maple Leafs play at Scotiabank Arena in Toronto.", difficulty: "easy", verificationNotes: "Toronto Maple Leafs official venue information." },
];

const SOURCE_URL_BY_SLUG: Record<string, string> = {
  "nhl-founded-1917": "https://en.wikipedia.org/wiki/National_Hockey_League",
  "first-nhl-season": "https://en.wikipedia.org/wiki/1917%E2%80%9318_NHL_season",
  "first-us-nhl-franchise": "https://en.wikipedia.org/wiki/Boston_Bruins",
  "nhl-original-six-name": "https://en.wikipedia.org/wiki/Original_Six",
  "stanley-cup-donor": "https://en.wikipedia.org/wiki/Stanley_Cup",
  "first-cup-winner": "https://en.wikipedia.org/wiki/List_of_Stanley_Cup_champions",
  "first-nhl-cup-winner": "https://en.wikipedia.org/wiki/1917%E2%80%9318_NHL_season",
  "cup-engraving": "https://en.wikipedia.org/wiki/Stanley_Cup",
  "wayne-gretzky-number": "https://en.wikipedia.org/wiki/Wayne_Gretzky",
  "gordie-howe-position": "https://en.wikipedia.org/wiki/Gordie_Howe",
  "jean-beliveau-cups": "https://en.wikipedia.org/wiki/Jean_B%C3%A9liveau",
  "first-50-goal-season": "https://en.wikipedia.org/wiki/Maurice_Richard",
  "gretzky-single-season-goals": "https://en.wikipedia.org/wiki/Wayne_Gretzky",
  "three-goals-hat-trick": "https://en.wikipedia.org/wiki/Hat-trick",
  "red-wings-original-name": "https://en.wikipedia.org/wiki/Detroit_Red_Wings",
  "canadiens-habs-nickname": "https://en.wikipedia.org/wiki/Montreal_Canadiens",
  "blackhawks-first-cup": "https://en.wikipedia.org/wiki/Chicago_Blackhawks",
  "maple-leafs-original-name": "https://en.wikipedia.org/wiki/Toronto_Maple_Leafs",
  "hockey-faceoff": "https://en.wikipedia.org/wiki/Face-off",
  "hockey-penalty-box": "https://en.wikipedia.org/wiki/Penalty_(ice_hockey)",
  "hockey-icing": "https://en.wikipedia.org/wiki/Icing_(ice_hockey)",
  "movie-mighty-ducks": "https://en.wikipedia.org/wiki/The_Mighty_Ducks",
  "movie-slap-shot-coach": "https://en.wikipedia.org/wiki/Slap_Shot_(film)",
  "movie-miracle-coach": "https://en.wikipedia.org/wiki/Miracle_(2004_film)",
  "slang-five-hole": "https://en.wikipedia.org/wiki/Goaltender_(ice_hockey)",
  "slang-lamp-lighter": "https://en.wikipedia.org/wiki/Goal_(ice_hockey)",
  "nickname-super-mario": "https://en.wikipedia.org/wiki/Mario_Lemieux",
  "arena-montreal": "https://en.wikipedia.org/wiki/Bell_Centre",
  "arena-edmonton": "https://en.wikipedia.org/wiki/Rogers_Place",
  "arena-toronto": "https://en.wikipedia.org/wiki/Scotiabank_Arena",
};

export const TRIVIA_FALLBACK_QUESTIONS: TriviaFallbackQuestion[] = RAW_TRIVIA_FALLBACK_QUESTIONS.map((question) => ({
  ...question,
  verificationNotes: `${question.verificationNotes} Source: ${SOURCE_URL_BY_SLUG[question.slug]}`,
}));

if (TRIVIA_FALLBACK_QUESTIONS.length !== 30) {
  throw new Error(`Expected 30 fallback questions, found ${TRIVIA_FALLBACK_QUESTIONS.length}.`);
}
for (const question of TRIVIA_FALLBACK_QUESTIONS) {
  if (question.choices.length !== 4 || question.correctIndex < 0 || question.correctIndex > 3) {
    throw new Error(`Invalid fallback choices or answer key for ${question.slug}.`);
  }
  if (!SOURCE_URL_BY_SLUG[question.slug]?.startsWith("https://")) {
    throw new Error(`Fallback ${question.slug} is missing a reviewable source URL.`);
  }
}

const SUPERSEDED_FALLBACK_QUESTIONS = [
  {
    oldSlug: "first-nhl-game",
    oldQuestion: "Which two teams played in the NHL's first game in 1917?",
    replacementSlug: "first-us-nhl-franchise",
  },
  {
    oldSlug: "stanley-cup-name",
    oldQuestion: "The Stanley Cup is named after which person?",
    replacementSlug: "first-nhl-cup-winner",
  },
  {
    oldSlug: "gordie-howe-nickname",
    oldQuestion: "Which nickname is strongly associated with Gordie Howe?",
    replacementSlug: "gordie-howe-position",
  },
  {
    oldSlug: "maurice-richard-nickname",
    oldQuestion: "What was Maurice Richard's famous nickname?",
    replacementSlug: "jean-beliveau-cups",
  },
  {
    oldSlug: "first-50-in-50",
    oldQuestion: "Who first scored 50 goals in 50 NHL games?",
    replacementSlug: "gretzky-single-season-goals",
  },
  {
    oldSlug: "original-six-boston",
    oldQuestion: "Which Original Six team plays in Boston?",
    replacementSlug: "red-wings-original-name",
  },
  {
    oldSlug: "original-six-montreal",
    oldQuestion: "Which Original Six team plays in Montreal?",
    replacementSlug: "canadiens-habs-nickname",
  },
  {
    oldSlug: "original-six-chicago",
    oldQuestion: "Which Original Six team is based in Chicago?",
    replacementSlug: "blackhawks-first-cup",
  },
  {
    oldSlug: "original-six-toronto",
    oldQuestion: "Which Original Six team is based in Toronto?",
    replacementSlug: "maple-leafs-original-name",
  },
  {
    oldSlug: "movie-mighty-ducks-coach",
    oldQuestion: "Who plays coach Gordon Bombay in The Mighty Ducks?",
    replacementSlug: "movie-slap-shot-coach",
  },
] as const;

/**
 * Revise only exact, known seed questions that were replaced for accuracy or
 * duplication reasons. Customized rows are untouched; used_on is preserved.
 */
export async function migrateSupersededTriviaFallbackQuestions(): Promise<void> {
  const [{ db }, { triviaFallback }, { and, eq, sql }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("drizzle-orm"),
  ]);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('trivia_fallback_fact_revisions'))`);
    for (const superseded of SUPERSEDED_FALLBACK_QUESTIONS) {
      const replacement = TRIVIA_FALLBACK_QUESTIONS.find((question) => question.slug === superseded.replacementSlug);
      if (!replacement) throw new Error(`Missing reviewed replacement fallback ${superseded.replacementSlug}.`);
      const [legacy] = await tx.select().from(triviaFallback).where(and(
        eq(triviaFallback.slug, superseded.oldSlug),
        eq(triviaFallback.question, superseded.oldQuestion),
      )).limit(1);
      if (!legacy) continue;

      const [alreadyRevised] = await tx.select().from(triviaFallback)
        .where(eq(triviaFallback.slug, replacement.slug)).limit(1);
      if (alreadyRevised) {
        const usedOn = [legacy.usedOn, alreadyRevised.usedOn]
          .filter((date): date is string => date !== null)
          .sort()
          .pop() ?? null;
        await tx.update(triviaFallback).set({ usedOn })
          .where(eq(triviaFallback.id, alreadyRevised.id));
        await tx.delete(triviaFallback).where(eq(triviaFallback.id, legacy.id));
        continue;
      }

      await tx.update(triviaFallback).set({
        slug: replacement.slug,
        category: replacement.category,
        question: replacement.question,
        choices: replacement.choices,
        correctIndex: replacement.correctIndex,
        explanation: replacement.explanation,
        difficulty: replacement.difficulty,
        format: null,
        verificationNotes: replacement.verificationNotes,
      }).where(eq(triviaFallback.id, legacy.id));
    }
  });
}

/**
 * Add only missing seed rows. Existing rows (including used_on and any
 * administrator edits) are left untouched on later runs.
 */
export async function seedTriviaFallbackQuestions(): Promise<number> {
  const [{ db }, { triviaFallback }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
  ]);
  await migrateSupersededTriviaFallbackQuestions();
  let inserted = 0;
  for (const question of TRIVIA_FALLBACK_QUESTIONS) {
    const result = await db.insert(triviaFallback).values({
      ...question,
      format: null,
      verificationNotes: question.verificationNotes,
    }).onConflictDoNothing({ target: triviaFallback.slug }).returning({ slug: triviaFallback.slug });
    if (result.length) inserted += 1;
  }
  return inserted;
}