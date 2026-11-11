import type { IconName } from "@/components/ui/icon";

export const navigation: { group: string; items: { href: string; label: string; title: string; icon: IconName; source: string }[] }[] = [
  { group: "即時監控", items: [
    { href: "/realtime", label: "3D 機台監控", title: "設備即時監控中心", icon: "machine", source: "谷林即時 API · 尚未串接" },
  ] },
  { group: "歷史分析", items: [
    { href: "/analytics", label: "稼動率分析", title: "歷史稼動率分析", icon: "chart", source: "歷史 Excel · 尚未匯入" },
    { href: "/events", label: "異常事件分析", title: "異常事件分析", icon: "event", source: "歷史事件資料 · 尚未匯入" },
    { href: "/environment", label: "環境監測", title: "環境監測", icon: "environment", source: "歷史環境資料 · 尚未匯入" },
  ] },
  { group: "資料管理", items: [
    { href: "/data/import", label: "Excel 匯入", title: "Excel 資料匯入", icon: "upload", source: "谷林匯出 Excel · 功能尚未開放" },
    { href: "/data/quality", label: "資料品質", title: "資料品質管理", icon: "shield", source: "匯入批次與品質紀錄 · 尚無資料" },
    { href: "/settings/api", label: "API 連線設定", title: "API 連線設定", icon: "link", source: "谷林即時 API · 尚未設定" },
  ] },
];

export const pages = navigation.flatMap((section) => section.items.map((item) => ({ ...item, workspace: section.group })));
