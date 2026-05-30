// strava.ts
// ───────────────────────────────────────────────────────────────────────────
// Robo Coleman — Strava read access (server-only).
//
// This module talks to the Strava API using long-lived OAuth credentials. Those
// credentials must never reach the browser, so the very first import is the
// `server-only` package: if this file is ever pulled into a client component,
// the build fails instead of leaking secrets. Everything below assumes a Node
// (server) runtime with access to process.env.
// ───────────────────────────────────────────────────────────────────────────

import 'server-only';

/**
 * Read a required secret from the environment, throwing a clear, named error if
 * it is missing. Keeping this in one place means every credential fails the same
 * obvious way rather than surfacing as a confusing `undefined` later on.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Exchange the long-lived refresh token for a short-lived access token.
 *
 * Strava access tokens expire every few hours, but the refresh token does not.
 * Rather than caching/expiring a token ourselves, we simply mint a fresh access
 * token on every call: POST the refresh token plus our app credentials to the
 * OAuth endpoint and read `access_token` back out. The refresh token never
 * leaves the server, and the access token lives only for the duration of the
 * subsequent request.
 */
async function getAccessToken(): Promise<string> {
  const clientId = requireEnv('STRAVA_CLIENT_ID');
  const clientSecret = requireEnv('STRAVA_CLIENT_SECRET');
  const refreshToken = requireEnv('STRAVA_REFRESH_TOKEN');

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Strava token refresh failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Strava token refresh succeeded but returned no access_token');
  }

  return data.access_token;
}

/** A single running activity, normalised into the units this app cares about. */
export type Run = {
  readonly id: number;
  readonly name: string;
  readonly date: string;
  readonly distanceKm: number;
  readonly movingTimeSec: number;
  readonly averageHeartrate?: number;
};

/**
 * The subset of Strava's activity payload we read. Strava returns much more than
 * this; we type only what we map so the shape stays honest.
 */
type StravaActivity = {
  id: number;
  name: string;
  start_date: string;
  distance: number; // metres
  moving_time: number; // seconds
  type?: string;
  sport_type?: string;
  average_heartrate?: number;
};

/** True for any activity Strava classifies as a run (legacy `type` or `sport_type`). */
function isRun(activity: StravaActivity): boolean {
  return (
    activity.type === 'Run' ||
    (activity.sport_type?.includes('Run') ?? false)
  );
}

/**
 * Fetch the most recent runs for the authenticated athlete.
 *
 * Mints a fresh access token, pulls the latest `perPage` activities, keeps only
 * the runs, and maps each into the clean `Run` shape — metres become kilometres,
 * moving time stays in seconds.
 */
export async function getRecentRuns(perPage = 30): Promise<Run[]> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Strava activities request failed: ${response.status} ${response.statusText}`,
    );
  }

  const activities = (await response.json()) as StravaActivity[];

  return activities.filter(isRun).map((activity) => ({
    id: activity.id,
    name: activity.name,
    date: activity.start_date,
    distanceKm: activity.distance / 1000,
    movingTimeSec: activity.moving_time,
    averageHeartrate: activity.average_heartrate,
  }));
}