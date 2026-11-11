export const GULIN_ACCESS_WINDOW = {
  timeZone: "Asia/Taipei",
  opensAt: "09:00:00",
  closesAt: "17:00:00",
} as const;

const taipeiClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: GULIN_ACCESS_WINDOW.timeZone,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// 以伺服器傳入的絕對時間判斷；不使用程序本地時區或瀏覽器時間。
export function isGulinAccessAllowed(now: Date = new Date()): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  const parts = taipeiClock.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return hour >= 9 && hour < 17;
}
