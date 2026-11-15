/**
 * Solar energy received at a site, from the published share of time with the
 * Sun visible.
 *
 * The only number added to the dataset is the solar constant: the power of
 * sunlight at the distance of the Earth and the Moon from the Sun, 1361 W per
 * square metre. It is a physical constant, not a vehicle parameter. Nothing
 * about the lander is assumed: no panel size, no efficiency, no pointing loss.
 * The result is the energy that reaches one square metre kept facing the Sun.
 *
 * It is an upper bound: the published share counts the Sun as visible as soon
 * as any part of its disc is above the horizon.
 */
export const SOLAR_KW_PER_M2 = 1.361;
export const HOURS_30_DAYS = 30 * 24;
export const HOURS_YEAR = 365 * 24;

/** Energy in kWh per m² over `hours`, when the Sun is visible for `sunShare` (0..1) of that time. */
export const solarEnergyKwhPerM2 = (sunShare: number, hours: number): number => SOLAR_KW_PER_M2 * sunShare * hours;
