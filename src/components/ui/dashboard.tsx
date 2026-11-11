import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type Tone = "neutral" | "brand" | "unknown" | "green" | "yellow" | "red" | "gray";

export function Badge({ children, tone = "neutral", dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return <span className={`badge tone-${tone}`}>{dot && <span className="status-dot" />}{children}</span>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

export function Panel({ title, description, aside, children, className = "" }: { title: string; description?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{aside}</div>{children}</section>;
}

export function MetricCard({ label, icon = "chart", hint = "尚無資料", tone = "neutral", value, valueLabel }: { label: string; icon?: IconName; hint?: string; tone?: Tone; value?: number; valueLabel?: string }) {
  return <section className="metric-card"><div className="metric-label"><span>{label}</span><span className={`metric-icon tone-${tone}`}><Icon name={icon} size={18} /></span></div><div className="metric-value" aria-label={valueLabel ?? (value === undefined ? "尚無資料" : `${value} 台`)}>{value ?? "—"}</div><p className="metric-hint">{hint}</p></section>;
}

export function EmptyState({ title = "尚無資料", description = "資料匯入後，將在此呈現分析結果。", icon = "database", compact = false }: { title?: string; description?: string; icon?: IconName; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><span className="empty-icon"><Icon name={icon} size={25} /></span><h3>{title}</h3><p>{description}</p></div>;
}

export function ChartPlaceholder({ title, description, kind = "trend" }: { title: string; description: string; kind?: "trend" | "ranking" }) {
  return <div className={`chart-placeholder chart-${kind}`}><div className="chart-grid" aria-hidden="true" /><EmptyState title={title} description={description} icon="chart" /></div>;
}

export function Notice({ children, title, tone = "neutral" }: { children: ReactNode; title?: string; tone?: "neutral" | "brand" | "unknown" }) {
  return <div className={`notice notice-${tone}`} role="note"><Icon name="info" size={19} /><div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>;
}

export function UnavailableButton({ label }: { label: string }) {
  return <button type="button" className="button unavailable" disabled>{label}<span>尚未開放</span></button>;
}

export function EmptyTable({ columns, title, description, caption }: { columns: string[]; title: string; description: string; caption: string }) {
  return <div className="table-scroll"><table><caption className="sr-only">{caption}</caption><thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><EmptyState title={title} description={description} icon="file" compact /></td></tr></tbody></table></div>;
}
