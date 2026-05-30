-- Migration: normalize legacy intimacy_requests.status='declined' to 'rejected'.
-- The schema (migration 009) documents 'rejected' as the canonical reject value, and
-- the stats query already filters on status='rejected'. The respond route used to
-- write 'declined' verbatim, which made those rows invisible to stats and rendered
-- as the default ("待回應") in the new tabbed history UI.

UPDATE intimacy_requests SET status = 'rejected' WHERE status = 'declined';
