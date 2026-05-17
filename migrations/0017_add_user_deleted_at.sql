-- Add soft-delete tombstone column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- Add CASCADE delete from messages → conversations.
-- Drop any existing FK on messages.conversation_id (regardless of name),
-- then create the authoritative constraint with a deterministic name.
DO $$ DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'conversation_id'
  LOOP
    EXECUTE 'ALTER TABLE messages DROP CONSTRAINT ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;
ALTER TABLE messages
  ADD CONSTRAINT messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Add CASCADE delete from conversation_participants → conversations.
-- Drop any existing FK on conversation_participants.conversation_id, then recreate.
DO $$ DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'conversation_participants'
      AND kcu.column_name = 'conversation_id'
  LOOP
    EXECUTE 'ALTER TABLE conversation_participants DROP CONSTRAINT ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;
ALTER TABLE conversation_participants
  ADD CONSTRAINT conv_participants_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
