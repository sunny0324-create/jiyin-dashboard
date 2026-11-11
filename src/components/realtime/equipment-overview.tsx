"use client";

import { useState } from "react";
import { Badge, EmptyState, MetricCard, Panel, type Tone } from "@/components/ui/dashboard";
import { Icon } from "@/components/ui/icon";

const areas = [
  { id: "A", machines: ["A1", "A2", "A3", "A4"] },
  { id: "B", machines: ["B1", "B2", "B3", "B4"] },
] as const;

type MachineId = (typeof areas)[number]["machines"][number];

const statuses: { label: string; tone: Tone }[] = [
  { label: "加工中", tone: "green" },
  { label: "待機／完成", tone: "yellow" },
  { label: "異常", tone: "red" },
  { label: "未開機", tone: "gray" },
  { label: "未知／未連線", tone: "unknown" },
];

export function EquipmentOverview() {
  const [selected, setSelected] = useState<MachineId | null>(null);
  const machineCount = areas.reduce((total, area) => total + area.machines.length, 0);

  function selectMachine(id: MachineId) {
    setSelected(id);
    document.getElementById("equipment-details")?.focus();
  }

  return (
    <>
      <section className="equipment-summary" aria-labelledby="equipment-summary-title">
        <div className="section-heading">
          <h2 id="equipment-summary-title">設備狀態摘要</h2>
          <span>狀態統計待 API 連線後提供</span>
        </div>
        <div className="equipment-summary-grid">
          <MetricCard label="監控設備總數" icon="machine" value={machineCount} valueLabel="已確認的 8 台監控設備" hint="已確認設備範圍 · 台" />
          {statuses.map((status) => (
            <MetricCard key={status.label} label={`${status.label}設備數`} icon={status.tone === "unknown" ? "disconnected" : "machine"} tone={status.tone} hint="尚未連線" valueLabel="尚未連線，無法取得設備數" />
          ))}
        </div>
      </section>

      <div className="monitor-workspace">
        <Panel title="3D 機台監控場景" description="A、B 區設備的視覺化工作區" aside={<Badge>場景預留</Badge>} className="scene-panel">
          <div className="scene-placeholder">
            <div className="scene-grid" aria-hidden="true" />
            <span className="scene-label">設備監控 / A・B 區</span>
            <div className="scene-center">
              <span className="scene-placeholder-icon"><Icon name="layers" size={36} /></span>
              <h3>3D 視覺化功能將於後續開發階段加入。</h3>
              <p>此處將呈現設備場景，目前尚無即時資料。</p>
              <span>功能尚未開放</span>
            </div>
          </div>
        </Panel>

        <section id="equipment-details" className="panel detail-panel" aria-label="設備詳細資訊" tabIndex={-1}>
          <div className="panel-header"><h2>設備詳細資訊</h2><Icon name="machine" size={18} /></div>
          <div className="equipment-details" aria-live="polite" aria-atomic="true">
            {selected ? (
              <div className="selected-machine">
                <span className="machine-icon"><Icon name="machine" size={31} /></span>
                <div><h3>{selected}</h3><p>{selected[0]} 區 · 工業級 SLA</p></div>
                <Badge tone="unknown" dot>尚未連線</Badge>
              </div>
            ) : (
              <EmptyState compact title="尚未選取設備" description="點選下方設備卡片，查看設備詳細資訊。" icon="machine" />
            )}
            <dl className="detail-list">
              <div><dt>設備編號</dt><dd>{selected ?? "—"}</dd></div>
              <div><dt>所屬區域</dt><dd>{selected ? `${selected[0]} 區` : "—"}</dd></div>
              <div><dt>目前燈態</dt><dd>{selected ? "未知" : "—"}</dd></div>
              <div><dt>最後更新時間</dt><dd>—</dd></div>
              <div><dt>感測器數值</dt><dd>{selected ? "尚無資料" : "—"}</dd></div>
              <div><dt>資料來源</dt><dd>API 尚未串接</dd></div>
              <div><dt>資料連線狀態</dt><dd>{selected ? "尚未連線" : "待選取設備"}</dd></div>
            </dl>
            <p className="detail-note">連線前不判定加工、待機、異常或未開機狀態，不提供感測器推估值。</p>
          </div>
        </section>
      </div>

      <section className="equipment-quick-overview" aria-labelledby="quick-overview-title">
        <div className="equipment-section-heading">
          <div><h2 id="quick-overview-title">設備快速總覽 <span className="count-label">8 台設備</span></h2><p>選取設備，於上方詳細資訊面板檢視；目前皆尚未連線。</p></div>
          <div className="status-legend" aria-label="狀態圖例">
            {statuses.map((status) => <span className={`legend-item tone-${status.tone}`} key={status.label}><span className="status-dot" />{status.label}</span>)}
          </div>
        </div>
        <div className="area-grid">
          {areas.map((area) => (
            <section key={area.id} className="area-group" aria-label={`${area.id} 區設備`}>
              <div className="area-heading"><span className="area-symbol">{area.id}</span><h3>{area.id} 區設備</h3><span>4 台工業級 SLA</span></div>
              <div className="machine-grid">
                {area.machines.map((id) => (
                  <button
                    type="button"
                    className={`machine-card ${selected === id ? "is-selected" : ""}`}
                    key={id}
                    aria-label={`查看 ${id} 設備詳細資訊，尚未連線`}
                    aria-pressed={selected === id}
                    aria-controls="equipment-details"
                    onClick={() => selectMachine(id)}
                  >
                    <div className="machine-card-top"><span className="machine-icon"><Icon name="machine" size={26} /></span><Icon name="chevron" size={15} /></div>
                    <div className="machine-card-name"><strong>{id}</strong><span>SLA 3D 列印設備</span></div>
                    <Badge tone="unknown" dot>尚未連線</Badge>
                    <div className="machine-card-time"><Icon name="clock" size={12} /><span>更新時間 —</span></div>
                    <span className="machine-card-action">{selected === id ? "已選取設備" : "檢視詳細資訊"}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
