
-- Sprint 2: Announcements

-- 1. Store announcement history.
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    message VARCHAR(255) NOT NULL,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_count INTEGER NOT NULL DEFAULT 0
        CHECK (recipient_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON announcements TO CURRENT_USER;

-- 2. Support announcement notifications.
ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'budget_warning',
        'budget_exceeded',
        'payment_reminder',
        'payment_overdue',
        'goal_reached',
        'unusual_spending',
        'price_rise',
        'announcement'
    ));

-- 3. Create a broadcast function.
CREATE OR REPLACE FUNCTION public.broadcast_announcement(
    p_message VARCHAR(255)
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
        RAISE EXCEPTION 'Announcement message cannot be empty';
    END IF;

    INSERT INTO public.notifications (
        user_id,
        type,
        message,
        dedupe_key
    )
    SELECT
        u.id,
        'announcement',
        p_message,
        'announcement:' || gen_random_uuid()::text
    FROM public.users AS u
    WHERE u.disabled_at IS NULL;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    RETURN inserted_count;
END;
$$;

-- Only the migration/application database role can invoke it.
REVOKE ALL ON FUNCTION public.broadcast_announcement(VARCHAR)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.broadcast_announcement(VARCHAR)
    TO CURRENT_USER;

-- Optional: If permissions permit (e.g. on unmanaged superuser instances), configure dedicated restricted role.
-- On managed cloud databases (Neon, RDS, Supabase), tenant users cannot grant BYPASSRLS or transfer function ownership.
DO $$
BEGIN
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_roles
            WHERE rolname = 'announcement_broadcaster'
        ) THEN
            CREATE ROLE announcement_broadcaster NOLOGIN;
        END IF;

        EXECUTE format('GRANT announcement_broadcaster TO %I', current_user);
        EXECUTE 'ALTER ROLE announcement_broadcaster BYPASSRLS';
        EXECUTE 'GRANT USAGE ON SCHEMA public TO announcement_broadcaster';
        EXECUTE 'GRANT SELECT (id, disabled_at) ON users TO announcement_broadcaster';
        EXECUTE 'GRANT INSERT ON notifications TO announcement_broadcaster';
        EXECUTE 'GRANT CREATE ON SCHEMA public TO announcement_broadcaster';
        EXECUTE 'ALTER FUNCTION public.broadcast_announcement(VARCHAR) OWNER TO announcement_broadcaster';
        EXECUTE 'REVOKE CREATE ON SCHEMA public FROM announcement_broadcaster';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping announcement_broadcaster role configuration on cloud environment: %', SQLERRM;
    END;
END
$$;
