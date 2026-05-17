-- Add soft-delete tombstone column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- Add CASCADE delete from messages → conversations
-- (orphaned rows cleaned up manually before adding constraint)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'messages_conversation_id_fkey'
      AND table_name = 'messages'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add CASCADE delete from conversation_participants → conversations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'conv_participants_conversation_id_fkey'
      AND table_name = 'conversation_participants'
  ) THEN
    ALTER TABLE conversation_participants ADD CONSTRAINT conv_participants_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;
END $$;
