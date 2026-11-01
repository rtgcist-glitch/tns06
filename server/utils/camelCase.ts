/**
 * Supabase snake_case → camelCase conversion utilities
 * Used to convert database records for frontend compatibility
 */

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function convertKeysToCamel(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToCamel);
  if (typeof obj !== "object") return obj;
  
  const result: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const camelKey = toCamelCase(key);
    const value = record[key];
    // Recursively convert objects inside arrays as well
    if (Array.isArray(value)) {
      result[camelKey] = value.map(item => (typeof item === "object" && item !== null ? convertKeysToCamel(item) : item));
    } else if (typeof value === "object" && value !== null) {
      result[camelKey] = convertKeysToCamel(value);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}
