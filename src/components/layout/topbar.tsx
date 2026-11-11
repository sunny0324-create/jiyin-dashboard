"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/dashboard";
import { pages } from "./navigation";

export function Topbar() {
  const pathname = usePathname();
  const page = pages.find((item) => item.href === pathname);
  return (
    <header className="topbar">
      <nav className="breadcrumb" aria-label="導覽階層">
        <Link href="/">首頁</Link><Icon name="chevron" size={13} />
        <span>{page?.workspace ?? "工作區"}</span>
      </nav>
      <p className="topbar-source">{page?.source ?? "尚未接入資料來源"}</p>
      <div className="topbar-actions">
        <Badge tone="brand">介面預覽</Badge>
        <Link href="/settings/api" className="icon-button" aria-label="系統設定：API 連線設定" title="系統設定"><Icon name="settings" /></Link>
      </div>
    </header>
  );
}
