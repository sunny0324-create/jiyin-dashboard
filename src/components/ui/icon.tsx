import type { SVGProps } from "react";

const paths = {
  home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8",
  machine: "M4 21V5h16v16H4Zm0-16 3-3h10l3 3M7 8h10v8H7V8Zm1 11h3m5 0h1M9 11h6m-3-2v5",
  chart: "M4 3v17h17M8 16v-5m5 5V6m5 10V9",
  event: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
  environment: "M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0ZM12 8v9m0 0v2m5-12h3m-3 4h2",
  upload: "M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7",
  shield: "m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5l8-3Zm-4 9 3 3 5-6",
  settings: "M9 3h6l1 4 4 1v6l-4 2-1 4H9l-1-4-4-2V8l4-1 1-4Zm3 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  link: "m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  disconnected: "M3 3 21 21M8 7a4 4 0 0 0-3 1l-3 3a4 4 0 0 0 6 6l2-2m4-6 2-2a4 4 0 0 1 6 6l-1 1M9 15l3-3",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  arrowUpRight: "M6 18 18 6M6 6h12v12",
  chevron: "m9 5 7 7-7 7",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  file: "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 12h8m-8 4h8",
  info: "M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  box: "m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5m-9 5L3 7m9 5v10M7 4.8l9 5",
  database: "M21 6c0 2-4 4-9 4S3 8 3 6s4-4 9-4 9 2 9 4ZM3 6v12c0 2 4 4 9 4s9-2 9-4V6M3 12c0 2 4 4 9 4s9-2 9-4",
  calendar: "M4 5h16v16H4V5Zm3-3v6m10-6v6M4 10h16m-11 4h2m3 0h2m-7 4h2",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
