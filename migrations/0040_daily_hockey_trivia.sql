DO $$ BEGIN
  CREATE TYPE trivia_category AS ENUM (
    'nhl_history', 'stanley_cup', 'players_legends', 'records_stats',
    'teams_franchises', 'hockey_culture', 'movies_media', 'nicknames_slang', 'arenas_fans'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS daily_trivia (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  category trivia_category NOT NULL,
  question text NOT NULL,
  choices jsonb NOT NULL,
  correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL,
  difficulty varchar(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  format varchar(50),
  verification_status varchar(20) NOT NULL CHECK (verification_status IN ('verified', 'fallback')),
  verification_notes text,
  source_basis text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_trivia_choices_check CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4)
);

CREATE TABLE IF NOT EXISTS trivia_answers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trivia_date date NOT NULL,
  category trivia_category NOT NULL,
  chosen_index integer NOT NULL CHECK (chosen_index BETWEEN 0 AND 3),
  is_correct boolean NOT NULL,
  progress_awarded integer NOT NULL DEFAULT 0 CHECK (progress_awarded IN (0, 1)),
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_trivia_answers_user_date UNIQUE (user_id, trivia_date)
);
CREATE INDEX IF NOT EXISTS idx_trivia_answers_user_date ON trivia_answers(user_id, trivia_date);
CREATE INDEX IF NOT EXISTS idx_trivia_answers_category ON trivia_answers(user_id, category);

CREATE TABLE IF NOT EXISTS trivia_fallback (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) NOT NULL UNIQUE,
  category trivia_category NOT NULL,
  question text NOT NULL,
  choices jsonb NOT NULL,
  correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL,
  difficulty varchar(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  format varchar(50),
  verification_notes text NOT NULL,
  used_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trivia_fallback_choices_check CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4)
);
CREATE INDEX IF NOT EXISTS idx_trivia_fallback_used_on ON trivia_fallback(used_on);

CREATE TABLE IF NOT EXISTS trivia_category_patches (
  category trivia_category PRIMARY KEY,
  patch_id varchar NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  UNIQUE (patch_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trivia_tiers (
  tier integer PRIMARY KEY CHECK (tier BETWEEN 1 AND 8),
  correct_answers_required integer NOT NULL CHECK (correct_answers_required > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trivia_generation_attempts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date date NOT NULL,
  attempt integer NOT NULL,
  question jsonb,
  verdict varchar(20) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trivia_generation_attempts_date ON trivia_generation_attempts(target_date, attempt);