import { createGulinHandler } from "@/lib/gulin/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createGulinHandler();

// 避免 Next.js 自動以 GET 處理 HEAD 而造成不必要的上游讀取。
export const HEAD = createGulinHandler();
