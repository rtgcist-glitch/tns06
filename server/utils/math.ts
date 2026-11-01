/**
 * Precision Math Utilities (0.1 + 0.2 safe rounding)
 */

export function roundToTwoDecimals(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
