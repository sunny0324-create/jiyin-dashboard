"use client";

import { useState } from "react";
import { Icon } from "./icon";

export function AnalysisFilters({ events = false }: { events?: boolean }) {
  const [period, setPeriod] = useState("每日");
  const [area, setArea] = useState("全部區域");
  const [machine, setMachine] = useState("全部設備");
  const [category, setCategory] = useState("全部類別");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const machineIds = area === "A 區" ? ["A1", "A2", "A3", "A4"] : area === "B 區" ? ["B1", "B2", "B3", "B4"] : ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
  const invalidRange = Boolean(start && end && start > end);

  return (
    <section className="filter-panel" aria-label="分析篩選介面預覽">
      <div className="filter-heading"><span><Icon name="calendar" size={17} />分析條件</span>{!events && <div className="segmented-control" role="group" aria-label="統計粒度">{["每日", "每週", "每月"].map((value) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? "selected" : ""} onClick={() => setPeriod(value)}>{value}</button>)}</div>}</div>
      <div className="filter-fields">
        <label>開始日期<input type="date" value={start} max={end || undefined} aria-invalid={invalidRange} aria-describedby="filter-status" onChange={(event) => setStart(event.target.value)} /></label>
        <label>結束日期<input type="date" value={end} min={start || undefined} aria-invalid={invalidRange} aria-describedby="filter-status" onChange={(event) => setEnd(event.target.value)} /></label>
        <label>區域<select value={area} onChange={(event) => { setArea(event.target.value); setMachine("全部設備"); }}><option>全部區域</option><option>A 區</option><option>B 區</option></select></label>
        {events ? <label>事件類別<select value={category} onChange={(event) => setCategory(event.target.value)}>{["全部類別", "加工完成通知", "環境警示", "其他待分類事件"].map((value) => <option key={value}>{value}</option>)}</select></label> : <label>設備<select value={machine} onChange={(event) => setMachine(event.target.value)}><option>全部設備</option>{machineIds.map((id) => <option key={id}>{id}</option>)}</select></label>}
      </div>
      <p id="filter-status" className={`filter-summary ${invalidRange ? "form-error" : ""}`} aria-live="polite">{invalidRange ? "日期區間有誤：結束日期不得早於開始日期。" : `條件預覽：${start || "未指定起日"} ～ ${end || "未指定迄日"} / ${area} / ${events ? category : `${machine} / ${period}`}。尚無資料可篩選。`}</p>
    </section>
  );
}
