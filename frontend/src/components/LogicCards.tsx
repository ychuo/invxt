import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "text-[#0f766e]" : score >= 60 ? "text-[#b45309]" : "text-[#64748b]";
  const barColor = score >= 80 ? "bg-[#0d9488]" : score >= 60 ? "bg-[#d97706]" : "bg-[#cbd5e1]";
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-[28px] font-bold ${color}`} style={{ fontFamily: "var(--font-serif)" }}>{score}</span>
      <div className="flex-1 h-[5px] bg-[#e5e7eb] rounded-sm">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function LogicCards({ companies }: Props) {
  const top = companies.slice(0, 3);

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "var(--font-serif)" }}>
      {top.map((c) => (
        <div key={c.ticker} className="border border-[#e8ecf1] rounded-[10px] overflow-hidden">
          {/* Card header */}
          <div className="p-[18px_22px_14px] border-b border-[#f0f0f0]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[18px] font-bold text-[#0f172a]">{c.company_name}</span>
              <span className="text-[10px] text-[#94a3b8] font-mono">{c.ticker}</span>
            </div>
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                c.market === "A" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#eff6ff] text-[#2563eb]"
              }`}>
                {c.market === "A" ? "A股" : "美股"}
              </span>
              {c.revenue_tier && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                  c.revenue_tier === "core" ? "bg-[#f0fdfa] text-[#0f766e] border-[#5eead4]" :
                  c.revenue_tier === "important" ? "bg-[#fefce8] text-[#a16207] border-[#fde047]" :
                  "bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]"
                }`}>
                  {c.revenue_tier === "core" ? "核心业务" : c.revenue_tier === "important" ? "重要业务" : c.revenue_tier === "marginal" ? "边缘业务" : "概念"}
                </span>
              )}
            </div>
            <ScoreBar score={c.exposure_score} />
            {c.investment_rating && (
              <span style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                background: c.investment_rating === "强烈推荐" ? "#fef2f2" :
                            c.investment_rating === "推荐" ? "#f0fdfa" :
                            c.investment_rating === "关注" ? "#fef3c7" : "#f1f5f9",
                color: c.investment_rating === "强烈推荐" ? "#dc2626" :
                       c.investment_rating === "推荐" ? "#0d9488" :
                       c.investment_rating === "关注" ? "#92400e" : "#64748b",
              }}>
                {c.investment_rating}
              </span>
            )}
          </div>

          {/* Card body */}
          <div className="p-[16px_22px_18px]">
            {/* Investment logic */}
            <div className="mb-3.5">
              <span className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-bold">投资逻辑</span>
              <p className="text-[12px] text-[#475569] leading-relaxed mt-1">{c.investment_logic}</p>
            </div>

            {c.moat_assessment && (
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", fontWeight: 600 }}>
                  护城河评估
                </span>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    { key: "intangible_assets", label: "无形资产" },
                    { key: "switching_costs", label: "转换成本" },
                    { key: "network_effects", label: "网络效应" },
                    { key: "cost_advantage", label: "成本优势" },
                  ].map(({ key, label }) => {
                    const score = (c.moat_assessment as any)[key] || 50;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 56, fontSize: 10, color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>{label}</span>
                        <div style={{ flex: 1, height: 4, background: "#e5e7eb", borderRadius: 2 }}>
                          <div style={{
                            width: `${score}%`, height: "100%", borderRadius: 2,
                            background: score >= 70 ? "#0d9488" : score >= 40 ? "#d97706" : "#dc2626",
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, width: 24 }}>{score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Key variables */}
            {c.key_variables.length > 0 && (
              <div className="mb-3">
                <span className="text-[9px] uppercase tracking-widest text-[#0d9488] font-bold">关键变量</span>
                <div className="mt-1 flex flex-col gap-1.5">
                  {c.key_variables.map((v, i) => (
                    <div key={i}>
                      <div className="text-[12px] font-bold text-[#0f766e]">
                        {typeof v === "string" ? v : v.name}
                      </div>
                      {typeof v !== "string" && v.detail && (
                        <div className="text-[11px] text-[#64748b] leading-relaxed">{v.detail}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {c.catalysts && c.catalysts.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0d9488", fontWeight: 600 }}>
                  催化剂
                </span>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.catalysts.map((cat, ci) => (
                    <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 600, flexShrink: 0,
                        background: cat.impact === "高" ? "#fef2f2" : cat.impact === "中" ? "#fef3c7" : "#f1f5f9",
                        color: cat.impact === "高" ? "#dc2626" : cat.impact === "中" ? "#92400e" : "#64748b",
                      }}>
                        {cat.impact}
                      </span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, color: "#0f172a", fontWeight: 600 }}>{cat.event}</span>
                        <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>{cat.timeframe}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks */}
            {c.risks.length > 0 && (
              <div>
                <span className="text-[9px] uppercase tracking-widest text-[#b45309] font-bold">风险</span>
                <div className="mt-1 flex flex-col gap-1.5">
                  {c.risks.map((r, i) => (
                    <div key={i}>
                      <div className="text-[12px] font-bold text-[#b45309]">
                        {typeof r === "string" ? r : r.risk}
                      </div>
                      {typeof r !== "string" && r.detail && (
                        <div className="text-[11px] text-[#64748b] leading-relaxed">{r.detail}</div>
                      )}
                      {typeof r !== "string" && r.falsifiable_condition && (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#b45309", fontStyle: "italic", background: "#fffbeb", padding: "4px 8px", borderRadius: 4 }}>
                          证伪条件: {r.falsifiable_condition}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
