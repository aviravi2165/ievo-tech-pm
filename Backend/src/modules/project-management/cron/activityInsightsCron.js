'use strict';

const cron = require('node-cron');
const { runActivityInsightsJob } = require('../services/activityInsightsService');

// Schedule comes entirely from config, never a literal in code — an
// operator can change how often these post (or turn it off) by editing
// .env and restarting, with no code change. See env.example for the
// documented default and format.
const SCHEDULE_ENV_VAR = 'ACTIVITY_INSIGHTS_CRON_SCHEDULE';

function startActivityInsightsCron() {
  const schedule = process.env[SCHEDULE_ENV_VAR];

  if (!schedule) {
    console.log(`[activityInsights] ${SCHEDULE_ENV_VAR} not set — activity insights cron is disabled.`);
    return null;
  }
  if (!cron.validate(schedule)) {
    console.error(`[activityInsights] ${SCHEDULE_ENV_VAR}="${schedule}" is not a valid cron expression — activity insights cron is disabled.`);
    return null;
  }

  const task = cron.schedule(schedule, () => {
    runActivityInsightsJob().catch(err =>
      console.error('[activityInsights] job run failed:', err.message)
    );
  });
  console.log(`[activityInsights] cron scheduled: "${schedule}"`);
  return task;
}

module.exports = { startActivityInsightsCron };
