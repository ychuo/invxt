import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

export default function LogicCards({ companies }: Props) {
  const top = companies.slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {top.map((c) => (
        <div key={c.ticker} className="border rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-base">{c.company_name}</h4>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-500">{c.ticker}</span>
          </div>

          <div className="mb-4">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">投资逻辑</span>
            <p className="text-sm text-gray-700 mt-1 leading-relaxed">{c.investment_logic}</p>
          </div>

          {c.key_variables.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">关键变量</span>
              <div className="mt-1 space-y-2">
                {c.key_variables.map((v, i) => (
                  <div key={i} className="bg-blue-50 rounded px-3 py-2">
                    <span className="text-sm font-medium text-blue-800">{v.name || v}</span>
                    <p className="text-xs text-blue-600 mt-0.5">{typeof v === "string" ? "" : v.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.risks.length > 0 && (
            <div className="mt-auto">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">风险</span>
              <div className="mt-1 space-y-2">
                {c.risks.map((r, i) => (
                  <div key={i} className="bg-red-50 rounded px-3 py-2">
                    <span className="text-sm font-medium text-red-700">{r.risk || r}</span>
                    <p className="text-xs text-red-600 mt-0.5">{typeof r === "string" ? "" : r.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
