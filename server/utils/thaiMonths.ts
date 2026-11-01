/**
 * Thai month name & Buddhist year helpers
 */

export function getMonthThaiName(m: number): string {
  const months = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return months[m] || String(m);
}

export function getCurrentBuddhistYear(): number {
  return new Date().getFullYear() + 543;
}

export function getCurrentMonth(): number {
  return new Date().getMonth() + 1;
}
