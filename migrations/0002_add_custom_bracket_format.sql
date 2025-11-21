-- Add custom_bracket to tournament_format enum
ALTER TYPE tournament_format ADD VALUE IF NOT EXISTS 'custom_bracket';
