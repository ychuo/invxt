import type { ExecutiveSummary } from "@/types";

export default function ExecutiveSummary({ data }: { data: ExecutiveSummary }) {
  return (
    <div className="border border-[#ccfbf1] rounded-[10px] overflow-hidden" style={{ background: "linear-gradient(135deg, #f0fdfa, #fff)" }}>
      <div className="px-6 py-4 border-b border-[#ccfbf1]" style={{ background: "#f0fdfa" }}>
        <span className="text-[11px] uppercase tracking-widest text-[#0f766e] font-bold">执行摘要</span>
      </div>
      <div className="p-6 space-y-4" style={{ fontFamily: "var(--font-serif)" }}>
        {/* 主题定义 */}
        <div>
          <p className="text-[14px] text-[#0f172a] leading-relaxed font-bold">{data.theme_definition}</p>
        </div>

        {/* 生命周期 + 市场空间 */}
        <div className="flex gap-3 text-[12px] text-[#64748b]">
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider">市场</span>
          {data.lifecycle_and_market}
        </div>

        {/* 核心环节 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-1">核心环节</span>
          <p className="text-[12px] text-[#475569] leading-relaxed">{data.core_links}</p>
        </div>

        {/* 推荐标的 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-2">核心推荐</span>
          {data.top_picks.map((pick, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-[#f5f5f5] last:border-0">
              <span className="text-[13px] font-bold text-[#0f172a]">{pick.company_name}</span>
              <span className="text-[10px] text-[#94a3b8] font-mono">{pick.ticker}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                pick.rating === "强烈推荐" ? "bg-[#fef2f2] text-[#dc2626]" :
                pick.rating === "推荐" ? "bg-[#f0fdfa] text-[#0d9488]" :
                pick.rating === "关注" ? "bg-[#fef3c7] text-[#92400e]" :
                "bg-[#f1f5f9] text-[#64748b]"
              }`}>{pick.rating}</span>
              <span className="text-[11px] text-[#64748b] flex-1">{pick.logic}</span>
            </div>
          ))}
        </div>

        {/* 预期差 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-1">最大预期差</span>
          <p className="text-[12px] text-[#0f766e] leading-relaxed font-bold">{data.biggest_mispricing}</p>
        </div>

        {/* 催化剂 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-1">关键催化剂</span>
          <p className="text-[12px] text-[#475569] leading-relaxed">{data.key_catalysts}</p>
        </div>
      </div>
    </div>
  );
}
