"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Brand } from "./brand";
import { navigation } from "./navigation";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Brand onNavigate={() => setOpen(false)} />
        <button
          type="button"
          className="icon-button mobile-menu"
          aria-label={open ? "收合導覽列" : "展開導覽列"}
          aria-expanded={open}
          aria-controls="dashboard-navigation"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
      <div id="dashboard-navigation" className={`sidebar-content ${open ? "is-open" : ""}`}>
        <nav aria-label="主要導覽">
          <Link href="/" className="nav-link nav-home" onClick={() => setOpen(false)}>
            <Icon name="home" size={19} /><span>首頁</span><span className="nav-home-hint">工作區入口</span>
          </Link>
          {navigation.map((section) => (
            <div className="nav-group" key={section.group}>
              <p className="nav-group-label">{section.group}</p>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${pathname === item.href ? "is-active" : ""}`}
                  aria-current={pathname === item.href ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={item.icon} size={19} /><span>{item.label}</span>
                  {pathname === item.href && <span className="active-mark" />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><Icon name="info" size={16} /><div>介面預覽模式<p>尚未接入企業資料</p></div></div>
          <p className="sidebar-version">平台介面 v0.1</p>
        </div>
      </div>
    </aside>
  );
}
