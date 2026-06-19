# As-of ranking snapshots

Daily ranking snapshots should represent the standings at the end of a selected Madrid day, even if scores are synced or corrected later.

This setup keeps the existing admin button working, but changes the SQL behind it so `day_YYYY_MM_DD` snapshots use a fixed cutoff:

- `day_2026_06_16` includes finished matches before `2026-06-17 00:00 Europe/Madrid`.
- Matches from the early morning of June 17 are excluded from the June 16 snapshot.
- If any match before the cutoff is not `finished` or is missing a score, the function raises an error instead of creating a bad snapshot.
- Re-running the same snapshot key replaces the previous rows, so corrections can be regenerated cleanly.

## Install or update the SQL functions

Run the contents of [`supabase/ranking-snapshot-as-of.sql`](../supabase/ranking-snapshot-as-of.sql) in the Supabase SQL editor.

The script creates:

- `generate_ranking_snapshot_as_of(snapshot_key, snapshot_label, cutoff_at, require_complete)`
- `generate_daily_ranking_snapshot(snapshot_date, require_complete)`
- a replacement `generate_ranking_snapshot(snapshot_key, snapshot_label)` compatible with the current app
- `ranking_snapshot_runs`, a small metadata table with cutoff and generation time

## Manually regenerate one day

For June 16, 2026:

```sql
select public.generate_daily_ranking_snapshot(date '2026-06-16', true);
```

If Supabase reports that earlier matches are incomplete, fix the affected match statuses/scores first, then run it again.

Only use `false` for the second argument if you knowingly want a snapshot even with incomplete earlier matches:

```sql
select public.generate_daily_ranking_snapshot(date '2026-06-16', false);
```

## Automate the daily snapshot

This job runs hourly and always regenerates yesterday's Madrid-day snapshot. That gives the football-data sync time to finish and also lets late score corrections update the previous day's snapshot without manual work.

```sql
select cron.schedule(
  'generate-daily-ranking-snapshot',
  '10 * * * *',
  $$
    select public.generate_daily_ranking_snapshot(
      ((now() at time zone 'Europe/Madrid')::date - 1),
      true
    );
  $$
);
```

This is intentionally separate from the live score sync job:

- live score sync: `sync-football-data-world-cup`
- daily snapshot: `generate-daily-ranking-snapshot`

## Pause or remove the snapshot cron

Pause:

```sql
update cron.job
set active = false
where jobname = 'generate-daily-ranking-snapshot';
```

Resume:

```sql
update cron.job
set active = true
where jobname = 'generate-daily-ranking-snapshot';
```

Remove:

```sql
select cron.unschedule('generate-daily-ranking-snapshot');
```

## Check recent runs

```sql
select *
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'generate-daily-ranking-snapshot'
)
order by start_time desc
limit 20;
```

Snapshot metadata:

```sql
select *
from public.ranking_snapshot_runs
order by generated_at desc;
```

## Suggested recovery flow after score sync errors

1. Pause `sync-football-data-world-cup` if the feed is actively writing bad data.
2. Correct the affected match in Admin > Gestion de partidos.
3. Re-run the affected daily snapshot with `generate_daily_ranking_snapshot(date 'YYYY-MM-DD', true)`.
4. Resume `sync-football-data-world-cup` after the provider data is trustworthy again.

For normal late corrections from football-data, step 3 is usually enough because snapshots are idempotent.
