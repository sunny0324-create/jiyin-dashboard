import "../scripts/register-typescript.mjs";

// 單元測試不載入 .env.local；即使漏傳模擬 transport，也不得連出網路。
globalThis.fetch = async () => {
  throw new Error("離線測試禁止使用真實 fetch。");
};

