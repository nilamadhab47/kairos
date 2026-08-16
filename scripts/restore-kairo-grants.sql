-- Restore the `kairo` app role's access to the `public` schema.
-- Must be run as a superuser (Railway's `postgres` role).
--
-- Usage:
--   psql "<Railway DATABASE_PUBLIC_URL for postgres role>" \
--     -f scripts/restore-kairo-grants.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kairo') THEN
    RAISE EXCEPTION 'role "kairo" does not exist on this cluster';
  END IF;
END$$;

GRANT USAGE, CREATE ON SCHEMA public TO kairo;
GRANT ALL ON ALL TABLES IN SCHEMA public TO kairo;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO kairo;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO kairo;

-- Anything created later (by future migrations run as the superuser) will
-- also be visible to kairo, so we don't lose access on the next deploy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kairo;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kairo;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO kairo;

-- Confirm.
\echo === kairo grants on public ===
SELECT nspname,
       has_schema_privilege('kairo', nspname, 'USAGE')  AS usage,
       has_schema_privilege('kairo', nspname, 'CREATE') AS create_
FROM pg_namespace WHERE nspname = 'public';

\echo === kairo can read User table ===
SELECT has_table_privilege('kairo', '"User"', 'SELECT') AS can_select_user;
