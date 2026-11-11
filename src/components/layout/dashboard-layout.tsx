import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="dashboard-shell"><a className="skip-link" href="#main-content">跳至主要內容</a><Sidebar /><div className="dashboard-body"><Topbar /><main id="main-content" className="main-content" tabIndex={-1}>{children}</main><footer className="page-footer"><span>極印智慧設備監控與稼動分析平台</span><span>谷林運算 × 極印快速成型</span></footer></div></div>;
}
