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
            <div className="flex items-center gap-2 mb-2.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                c.market === "A" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#eff6ff] text-[#2563eb]"
              }`}>
                {c.market === "A" ? "A股" : "美股"}
              </span>
            </div>
            <ScoreBar score={c.exposure_score} />
          </div>

          {/* Card body */}
          <div className="p-[16px_22px_18px]">
            {/* Investment logic */}
            <div className="mb-3.5">
              <span className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-bold">投资逻辑</span>
              <p className="text-[12px] text-[#475569] leading-relaxed mt-1">{c.investment_logic}</p>
            </div>

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
