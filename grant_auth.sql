DO $block$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
  LOOP
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE %I TO authenticated', r.table_name);
  END LOOP;
  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public')
  LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE %I TO authenticated', r.sequence_name);
  END LOOP;
END $block$;
