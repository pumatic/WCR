# football-data.org live match sync

The application exposes a protected endpoint:

`POST /api/cron/football-data`

It performs one football-data.org request for the 2026 World Cup, then:

- marks local `upcoming` matches as `live` once kickoff has passed;
- closes predictions for live or finished matches;
- updates live and final scores;
- marks provider-finished matches as `finished`;
- reports unmatched provider fixtures without updating them.

Fixtures are matched by normalized home/away team names and kickoff time within three hours.
The endpoint never creates matches automatically.

## 1. Configure Vercel secrets

Add these variables to Preview and Production environments:

- `FOOTBALL_DATA_API_TOKEN`: football-data.org API token.
- `CRON_SECRET`: a separate long random value used only to authorize the cron request.

Redeploy after adding or changing environment variables.

## 2. Test the endpoint

```bash
curl -X POST "https://YOUR_DOMAIN/api/cron/football-data" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Review `updated`, `unmatched`, and `unmatchedCount` in the response before scheduling it.

## 3. Schedule from Supabase

Enable the `pg_cron` and `pg_net` extensions, then run this once in the Supabase SQL editor.
Replace the domain and cron secret first.

```sql
select cron.schedule(
  'sync-football-data-world-cup',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_DOMAIN/api/cron/football-data',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_CRON_SECRET',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

The free football-data.org plan has delayed scores. Five-minute polling stays below its
request limit while remaining useful for testing. Upgrade the provider plan before relying
on the feed as genuinely live data.

## Operations

List the job:

```sql
select * from cron.job
where jobname = 'sync-football-data-world-cup';
```

Review recent runs:

```sql
select *
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'sync-football-data-world-cup'
)
order by start_time desc
limit 20;
```

Remove the job:

```sql
select cron.unschedule('sync-football-data-world-cup');
```
