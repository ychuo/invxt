"use client";

const STEPS = [
  { key: "theme_understanding", label: "主题" },
  { key: "chain_reasoning", label: "产业链" },
  { key: "company_mapping", label: "公司" },
  { key: "scoring", label: "评分" },
];

interface ProgressStepperProps {
  currentStep: string;
}

export default function ProgressStepper({ currentStep }: ProgressStepperProps) {
  const isDone = currentStep === "done";
  const currentIndex = isDone ? STEPS.length : STEPS.findIndex((s) => currentStep.startsWith(s.key));

  return (
    <div className="flex items-center gap-1.5" style={{ fontFamily: "var(--font-serif)" }}>
      {STEPS.map((step, i) => {
        const isComplete = isDone || i < currentIndex;
        const isActive = !isDone && i === currentIndex;
        return (
          <span key={step.key} className="flex items-center gap-1.5">
            {isComplete ? (
              <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white flex items-center justify-center text-[10px]">✓</span>
            ) : isActive ? (
              <span className="w-5 h-5 rounded-full bg-[#14b8a6] text-white flex items-center justify-center text-[10px] animate-pulse">{i + 1}</span>
            ) : (
              <span className="w-5 h-5 rounded-full bg-[#e5e7eb] text-[#94a3b8] flex items-center justify-center text-[10px]">{i + 1}</span>
            )}
            <span className={`text-[11px] ${
              isActive ? "text-[#0d9488] font-bold" : isComplete ? "text-[#0f766e]" : "text-[#94a3b8]"
            }`}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-[#e5e7eb] text-[10px] mx-0.5">·</span>}
          </span>
        );
      })}
    </div>
  );
}
