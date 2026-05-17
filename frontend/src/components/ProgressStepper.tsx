"use client";

const STEPS = [
  { key: "search", label: "实时搜索" },
  { key: "theme_understanding", label: "主题理解" },
  { key: "chain_reasoning", label: "产业链推理" },
  { key: "company_mapping", label: "公司映射" },
  { key: "scoring", label: "暴露度评分" },
];

interface ProgressStepperProps {
  currentStep: string;
}

export default function ProgressStepper({ currentStep }: ProgressStepperProps) {
  const isDone = currentStep === "done";
  const currentIndex = isDone ? STEPS.length : STEPS.findIndex((s) => currentStep.startsWith(s.key));

  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const isComplete = isDone || i < currentIndex;
        const isActive = !isDone && i === currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isComplete
                  ? "bg-green-500 text-white"
                  : isActive
                  ? "bg-blue-600 text-white animate-pulse"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {isComplete ? "✓" : i + 1}
            </div>
            <span
              className={`text-sm ${
                isActive ? "text-blue-700 font-medium" : isComplete ? "text-green-600" : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && <div className={`w-8 h-px ${isComplete ? "bg-green-400" : "bg-gray-300"}`} />}
          </div>
        );
      })}
    </div>
  );
}
