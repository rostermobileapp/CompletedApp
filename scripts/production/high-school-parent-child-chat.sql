-- Additive private parent/child messaging. Does not create user accounts,
-- change memberships, enable children, or grant browser roles table access.
BEGIN;
CREATE TABLE IF NOT EXISTS hs_onboarding.parent_child_messages(
  id uuid PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  author_kind text NOT NULL CHECK(author_kind IN('parent','child')),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id,author_kind,request_id));
CREATE INDEX IF NOT EXISTS hs_parent_child_message_history
  ON hs_onboarding.parent_child_messages(child_id,parent_auth_id,created_at DESC,id DESC);
ALTER TABLE hs_onboarding.parent_child_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.parent_child_messages FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
-- Preserve each child's own legacy Family messages, without copying siblings'
-- messages into private conversations or guessing recipients of shared posts.
INSERT INTO hs_onboarding.parent_child_messages(id,child_id,parent_auth_id,author_kind,body,request_id,created_at)
SELECT m.id,m.child_id,c.parent_auth_id,'child',m.body,m.id,m.created_at
FROM hs_onboarding.child_messages m
JOIN hs_onboarding.child_chats room ON room.id=m.chat_id AND room.kind='family'
JOIN hs_onboarding.children c ON c.id=m.child_id AND c.parent_auth_id=room.parent_auth_id
WHERE m.child_id IS NOT NULL
ON CONFLICT DO NOTHING;
COMMIT;
