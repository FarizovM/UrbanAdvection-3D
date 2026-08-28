-- Additional additive fields used by the five-minute demo observation generator.
-- Existing monitoring observations remain unchanged.

ALTER TABLE monitoring_observations
    ADD COLUMN IF NOT EXISTS pm10_ug_m3 double precision,
    ADD COLUMN IF NOT EXISTS co2_ppm double precision,
    ADD COLUMN IF NOT EXISTS humidity_pct double precision;
