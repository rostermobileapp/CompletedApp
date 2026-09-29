-- Historical RevenueCat native rows have unknown store environment.
-- Fail closed until a current subscriber fetch verifies their provenance.
ALTER TABLE revenuecat_native_entitlements
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN;
ALTER TABLE revenuecat_native_entitlements
  ALTER COLUMN is_sandbox DROP DEFAULT;
ALTER TABLE revenuecat_native_entitlements
  ALTER COLUMN is_sandbox DROP NOT NULL;