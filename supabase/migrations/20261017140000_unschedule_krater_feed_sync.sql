-- Krater was removed on 2026-10-11. Production job
-- axe-companion-krater-feed-sync is already paused; unschedule it so
-- cron_health / listings stop probing a retired integration.
-- Does not delete auth.users or any feed rows.

do $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  if exists (
    select 1 from cron.job where jobname = 'axe-companion-krater-feed-sync'
  ) then
    perform cron.unschedule('axe-companion-krater-feed-sync');
  end if;
exception
  when undefined_table then
    null;
  when undefined_function then
    null;
end $$;

do $$
begin
  if to_regclass('axe_ops.cron_job') is null then
    return;
  end if;
  update axe_ops.cron_job
  set enabled = false
  where name in ('krater-feed-sync', 'axe-companion-krater-feed-sync')
     or path = '/api/cron/krater-feed-sync';
exception
  when undefined_table then
    null;
  when undefined_column then
    null;
end $$;
