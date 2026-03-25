"use client";

interface PlanToggleProps {
    value: "monthly" | "annual";
    onChange: (val: "monthly" | "annual") => void;
}

export default function PlanToggle({ value, onChange }: PlanToggleProps) {
    const isAnnual = value === "annual";

    return (
        <div className="flex items-center justify-center gap-3 select-none">
            {/* Label Bulanan */}
            <button
                onClick={() => onChange("monthly")}
                className={`text-sm font-medium transition-colors duration-200 ${
                    !isAnnual ? "text-amber-400" : "text-neutral-400 hover:text-neutral-200"
                }`}
            >
                Bulanan
            </button>

            {/* Toggle Switch */}
            <button
                onClick={() => onChange(isAnnual ? "monthly" : "annual")}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${
                    isAnnual ? "bg-amber-500" : "bg-neutral-600"
                }`}
                aria-label="Toggle billing cycle"
                role="switch"
                aria-checked={isAnnual}
            >
                <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                        isAnnual ? "translate-x-8" : "translate-x-1"
                    }`}
                />
            </button>

            {/* Label Tahunan + badge */}
            <button
                onClick={() => onChange("annual")}
                className="flex items-center gap-2"
            >
                <span
                    className={`text-sm font-medium transition-colors duration-200 ${
                        isAnnual ? "text-amber-400" : "text-neutral-400 hover:text-neutral-200"
                    }`}
                >
                    Tahunan
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-400 shadow-sm shadow-amber-500/20 whitespace-nowrap">
                    Hemat hingga 25%
                </span>
            </button>
        </div>
    );
}
