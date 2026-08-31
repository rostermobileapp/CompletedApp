ALTER TABLE "scrimmages"
  ADD COLUMN IF NOT EXISTS "facility_id" varchar;

DO $$ BEGIN
  ALTER TABLE "scrimmages"
    ADD CONSTRAINT "scrimmages_facility_id_facilities_id_fk"
    FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_scrimmages_facility_id"
  ON "scrimmages" ("facility_id");

UPDATE "scrimmages" AS s
SET "facility_id" = f."id"
FROM "facilities" AS f
WHERE s."facility_id" IS NULL
  AND (
    lower(trim(s."location")) = lower(trim(f."name"))
    OR lower(trim(s."location")) = lower(trim(COALESCE(f."address", '')))
  );