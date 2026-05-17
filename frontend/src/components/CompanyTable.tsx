import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

const TIER_LABELS: Record<string, string> = {
  core: "核心 >30%",
  important: "重要 10-30%",
  marginal: "边缘 5-10%",
  concept: "概念 <5%",
};

const TIER_STYLES: Record<string, string> = {
  core: "bg-[#f0fdfa] text-[#0f766e] border-[#5eead4]",
  important: "bg-[#fefce8] text-[#a16207] border-[#fde047]",
  marginal: "bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]",
  concept: "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]",
};

const AWARENESS_LABELS: Record<string, string> = {
  under_the_radar: "低认知",
  partially_recognized: "部分认知",
  priced_in: "已定价",
};

const AWARENESS_STYLES: Record<string, string> = {
  under_the_radar: "bg-[#dcfce7] text-[#166534]",
  partially_recognized: "bg-[#fef3c7] text-[#92400e]",
  priced_in: "bg-[#f1f5f9] text-[#64748b]",
};

function ScoreCell({ score }: { score: number }) {
  if (score <= 0) return <span className="text-[#cbd5e1] text-xs">…</span>;
  const color =
    score >= 60 ? "text-[#0f766e]" :
    score >= 30 ? "text-[#b45309]" :
    "text-[#64748b]";
  const barColor =
    score >= 60 ? "bg-[#0d9488]" :
    score >= 30 ? "bg-[#d97706]" :
    "bg-[#cbd5e1]";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[15px] font-bold ${color}`} style={{ fontFamily: "var(--font-serif)" }}>{score}</span>
      <div className="flex-1 min-w-[40px] h-1 bg-[#e5e7eb] rounded-sm">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${Math.max(score, 5)}%` }} />
      </div>
    </div>
  );
}

export default function CompanyTable({ companies }: Props) {
  return (
    <div className="overflow-x-auto border border-[#f0f0f0] rounded-[10px]">
      <table className="w-full text-[13px]" style={{ fontFamily: "var(--font-serif)" }}>
        <thead>
          <tr className="bg-[#fafbfc] text-left">
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider w-7">#</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">公司</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider w-[72px]">市场</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">产业纯度</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">市场认知</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">暴露度</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">关联逻辑</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c, i) => (
            <tr key={c.ticker} className="border-t border-[#f5f5f5] hover:bg-[#fafbfc] transition-colors">
              <td className="p-3 text-[#94a3b8]">{i + 1}</td>
              <td className="p-3">
                <div className="font-bold text-[#0f172a]">{c.company_name}</div>
                <div className="text-[10px] text-[#94a3b8] font-mono mt-0.5">{c.ticker}</div>
              </td>
              <td className="p-3 whitespace-nowrap">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  c.market === "A" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#eff6ff] text-[#2563eb]"
                }`}>
                  {c.market === "A" ? "A股" : "美股"}
                </span>
              </td>
              <td className="p-3 whitespace-nowrap">
                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${TIER_STYLES[c.revenue_tier] || ""}`}>
                  {TIER_LABELS[c.revenue_tier] || c.revenue_tier}
                </span>
              </td>
              <td className="p-3 whitespace-nowrap">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${AWARENESS_STYLES[c.market_awareness] || ""}`}>
                  {AWARENESS_LABELS[c.market_awareness] || c.market_awareness}
                </span>
              </td>
              <td className="p-3">
                <ScoreCell score={c.exposure_score} />
              </td>
              <td className="p-3 text-[12px] text-[#64748b] leading-relaxed">
                {c.investment_logic}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
