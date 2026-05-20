import type { ThemeResult } from "@/types";

interface ThemeSummaryProps {
  theme: ThemeResult;
}

export default function ThemeSummary({ theme }: ThemeSummaryProps) {
  return (
    <div className="border border-[#f0f0f0] rounded-[10px] p-5" style={{ fontFamily: "var(--font-serif)" }}>
      <h3 className="text-[18px] font-bold text-[#0f172a] mb-1.5">{theme.theme_name}</h3>
      <p className="text-[14px] text-[#64748b] leading-relaxed mb-3">{theme.summary}</p>
      <div className="flex gap-2 flex-wrap">
        <span className="px-3 py-1 bg-[#f0fdfa] text-[#0f766e] text-[11px] rounded-full border border-[#ccfbf1] font-bold">
          {theme.category}
        </span>
        {theme.directions.slice(0, 4).map((d) => (
          <span
            key={d.name}
            className="px-3 py-1 bg-[#f0fdfa] text-[#0f766e] text-[11px] rounded-full border border-[#ccfbf1]"
          >
            {d.name}
          </span>
        ))}
      </div>

        {theme.lifecycle_stage && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
            <span style={{
              display: "inline-block",
              fontSize: 10, padding: "2px 8px", borderRadius: 100, fontWeight: 600,
              background: theme.lifecycle_stage === "成长期" ? "#dcfce7" :
                          theme.lifecycle_stage === "导入期" ? "#fef3c7" :
                          theme.lifecycle_stage === "成熟期" ? "#dbeafe" : "#f1f5f9",
              color: theme.lifecycle_stage === "成长期" ? "#166534" :
                     theme.lifecycle_stage === "导入期" ? "#92400e" :
                     theme.lifecycle_stage === "成熟期" ? "#1e40af" : "#64748b",
            }}>
              {theme.lifecycle_stage}
            </span>
          </div>
        )}

        {theme.tam_description && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: 4 }}>市场空间</span>
            <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>{theme.tam_description}</p>
          </div>
        )}

        {theme.policy_analysis && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: 4 }}>政策环境</span>
            <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>{theme.policy_analysis}</p>
          </div>
        )}
    </div>
  );
}
