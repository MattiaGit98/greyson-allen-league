export function backupFileTimestamp(date: Date) {
  return date.toISOString().replace(/T/, "_").replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}
