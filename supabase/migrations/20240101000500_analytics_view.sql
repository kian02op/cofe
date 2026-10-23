-- ============================================================================
-- Migration 0006 — analytics_daily aggregation view
-- security_invoker = RLS of analytics_events applies to the caller, so cafe
-- members can only aggregate their own rows. Far cheaper than fetching raw
-- events for date-range charts.
-- ============================================================================

create view public.analytics_daily
with (security_invoker = true) as
select
  cafe_id,
  event_type,
  product_id,
  category_id,
  visit_date,
  count(*)::int                 as events,
  count(distinct visitor_hash)::int as visits
from public.analytics_events
group by 1, 2, 3, 4, 5;

grant select on public.analytics_daily to authenticated;
