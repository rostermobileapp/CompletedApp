DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'referral_partner_status'
  ) THEN
    CREATE TYPE referral_partner_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
  END IF;
END $$;

ALTER TYPE referral_partner_status ADD VALUE IF NOT EXISTS 'suspended';