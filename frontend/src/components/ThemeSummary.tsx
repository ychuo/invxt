import type { ThemeResult } from "@/types";

interface ThemeSummaryProps {
  theme: ThemeResult;
}

export default function ThemeSummary({ theme }: ThemeSummaryProps) {
  return (
    <div className="mb-6">
      <span className="text-xs uppercase tracking-wide text-gray-500">主题</span>
      <h2 className="text-2xl font-bold mt-1">{theme.theme_name}</h2>
      <p className="text-gray-500 mt-2">{theme.summary}</p>
      <div className="flex gap-2 mt-3">
        <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-md">
          {theme.category}
        </span>
        {theme.directions.slice(0, 3).map((d) => (
          <span
            key={d.name}
            className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-md"
          >
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}
