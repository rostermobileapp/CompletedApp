CREATE TABLE IF NOT EXISTS message_reactions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id varchar NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji varchar NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT unique_message_user_emoji UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);
