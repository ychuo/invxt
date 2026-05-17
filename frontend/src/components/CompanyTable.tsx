import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

function ScoreBadge({ score }: { score: number }) {
  if (score <= 0) return <span className="text-gray-300 text-xs">…</span>;
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-gray-400";
  return <span className={`${color} text-white px-2.5 py-0.5 rounded-full text-xs font-bold`}>{score}</span>;
}

export default function CompanyTable({ companies }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="p-3 font-medium">#</th>
            <th className="p-3 font-medium">公司</th>
            <th className="p-3 font-medium">代码</th>
            <th className="p-3 font-medium">市场</th>
            <th className="p-3 font-medium text-center">暴露度</th>
            <th className="p-3 font-medium">关联逻辑</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c, i) => (
            <tr key={c.ticker} className="border-t hover:bg-gray-50">
              <td className="p-3 text-gray-400">{i + 1}</td>
              <td className="p-3 font-semibold">{c.company_name}</td>
              <td className="p-3 text-gray-500 font-mono text-xs">{c.ticker}</td>
              <td className="p-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    c.market === "A"
                      ? "bg-red-50 text-red-600"
                      : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {c.market === "A" ? "A股" : "美股"}
                </span>
              </td>
              <td className="p-3 text-center">
                <ScoreBadge score={c.exposure_score} />
              </td>
              <td className="p-3 text-gray-600 text-xs max-w-xs">
                {c.investment_logic}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
