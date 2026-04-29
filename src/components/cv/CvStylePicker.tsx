import { CV_STYLE_LIST, CvStyleId, getStyle } from "./cvStyles";
import { Check } from "lucide-react";

type Props = {
  value: CvStyleId | null | undefined;
  onChange: (id: CvStyleId) => void;
  size?: "sm" | "md";
};

export const CvStylePicker = ({ value, onChange, size = "md" }: Props) => {
  const active = getStyle(value).id;
  return (
    <div className={`grid gap-2 ${size === "sm" ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
      {CV_STYLE_LIST.map((s) => {
        const selected = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`relative text-left rounded-lg border-2 transition-all overflow-hidden bg-card hover:border-primary/60 ${
              selected ? "border-primary ring-2 ring-primary/30" : "border-border"
            }`}
          >
            <div className="h-12 bg-white px-3 py-2 border-b border-border">
              <div className="h-1 rounded-sm mb-2" style={{ background: s.accent }} />
              <div className="h-1.5 rounded-sm w-3/5 bg-slate-800 mb-1.5" />
              <div className="h-1 rounded-sm w-full bg-slate-200 mb-1" />
              <div className="h-1 rounded-sm w-4/5 bg-slate-200" />
            </div>
            <div className="px-2.5 py-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold" style={{ fontFamily: s.headingFont }}>{s.name}</div>
                {selected && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
              {size === "md" && <div className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{s.tagline}</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
};
