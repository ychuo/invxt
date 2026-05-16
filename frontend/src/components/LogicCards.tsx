import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

export default function LogicCards({ companies }: Props) {
  const top = companies.slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {top.map((c) => (
        <div key={c.ticker} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">{c.company_name}</h4>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">
              {c.ticker}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{c.investment_logic}</p>
          {c.key_variables.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-700">关键变量</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.key_variables.map((v) => (
                  <span
                    key={v}
                    className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {c.risks.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-700">风险</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.risks.map((r) => (
                  <span
                    key={r}
                    className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
