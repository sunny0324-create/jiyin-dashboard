import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function Brand({ onNavigate, subtitle = "智慧設備監控平台", subtitleLang }: { onNavigate?: () => void; subtitle?: string; subtitleLang?: "en" | "zh-Hant" }) {
  return (
    <Link href="/" className="brand" onClick={onNavigate} aria-label="極印智慧設備監控平台首頁">
      <span className="brand-symbol"><Icon name="layers" size={26} /></span>
      <span>
        <strong>極印<span className="brand-dot">.</span></strong>
        <span className="brand-subtitle" lang={subtitleLang}>{subtitle}</span>
      </span>
    </Link>
  );
}
