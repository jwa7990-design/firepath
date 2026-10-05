-- ============================================================
-- FirePath — let the content sync script write Learning Lab articles (step 3)
-- learning_articles was created without any privileges for service_role (the
-- server-only admin role), so js/populate-learning-articles.js got
-- "permission denied" and the table stayed empty. service_role is never used
-- by the public site; anon/authenticated keep read-only access (001).
-- ============================================================

grant select, insert, update on public.learning_articles to service_role;
