import { toZonedTime } from "date-fns-tz";
import { LEAGUE_TIMEZONE } from "./schedule";
import { ZANDVLEI } from "./venues";

/**
 * When the sun goes down over the pitch.
 *
 * The league plays outside with no floodlights, so the latest a game can start is set
 * by the sun rather than by anybody's diary — and in Cape Town that moves by well over
 * an hour across the year: about 17:45 in June, about 20:00 at Christmas. A fixed list
 * of "later" kickoffs would either offer a 19:00 game in winter that ends in the dark,
 * or never offer one in summer when it is perfectly light.
 *
 * NOAA's low-precision formula: good to a minute or two, which is far finer than a
 * kickoff time that moves in half hours, and needs no library or network.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */

const RAD = Math.PI / 180;

/** The zenith at which the top of the sun touches the horizon, allowing for refraction. */
const SUNSET_ZENITH = 90.833;

/**
 * Sunset on the league-local calendar day that `day` falls on.
 *
 * Defaults to Zandvlei, because that is where the league plays unless somebody says
 * otherwise, and a different pitch on the same peninsula moves sunset by seconds.
 */
export function sunsetOn(
  day: Date,
  place: { lat: number; lon: number } = { lat: ZANDVLEI.lat!, lon: ZANDVLEI.lon! },
): Date {
  const local = toZonedTime(day, LEAGUE_TIMEZONE);
  const year = local.getFullYear();
  const month = local.getMonth();
  const date = local.getDate();

  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = Math.round((Date.UTC(year, month, date) - startOfYear) / 86_400_000) + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - startOfYear) / 86_400_000;

  // Fractional year, at midday.
  const g = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1);

  const eqTimeMinutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));

  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const lat = place.lat * RAD;
  const cosHourAngle =
    Math.cos(SUNSET_ZENITH * RAD) / (Math.cos(lat) * Math.cos(declination)) -
    Math.tan(lat) * Math.tan(declination);
  // Clamped for the polar case, which Cape Town will never see, so a bad coordinate
  // produces a strange time rather than NaN.
  const hourAngle = Math.acos(Math.min(1, Math.max(-1, cosHourAngle))) / RAD;

  const sunsetUtcMinutes = 720 - 4 * (place.lon - hourAngle) - eqTimeMinutes;

  return new Date(Date.UTC(year, month, date) + Math.round(sunsetUtcMinutes * 60_000));
}
