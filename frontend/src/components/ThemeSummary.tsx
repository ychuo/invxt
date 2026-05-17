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
    </div>
  );
}
