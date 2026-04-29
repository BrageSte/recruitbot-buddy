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
            <StyleSwatch styleId={s.id} accent={s.accent} soft={s.accentSoft} background={s.background} />
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

const StyleSwatch = ({
  styleId,
  accent,
  soft,
  background,
}: {
  styleId: CvStyleId;
  accent: string;
  soft: string;
  background: string;
}) => {
  if (styleId === "korporat") {
    return (
      <div className="h-12 border-b border-border" style={{ background: "#fff" }}>
        <div className="h-5 px-3 py-1.5" style={{ background: accent }}>
          <div className="h-1.5 rounded-sm w-2/5 bg-white/90" />
        </div>
        <div className="px-3 py-1.5">
          <div className="h-1 rounded-sm w-full mb-1" style={{ background: soft }} />
          <div className="h-1 rounded-sm w-3/4" style={{ background: "#d6deea" }} />
        </div>
      </div>
    );
  }

  if (styleId === "akademisk") {
    return (
      <div className="h-12 px-3 py-2 border-b border-border bg-white">
        <div className="mx-auto h-1.5 rounded-sm w-1/2 mb-2" style={{ background: accent }} />
        <div className="h-px w-full mb-1.5" style={{ background: soft }} />
        <div className="h-1 rounded-sm w-full mb-1 bg-slate-200" />
        <div className="h-1 rounded-sm w-5/6 bg-slate-200" />
      </div>
    );
  }

  if (styleId === "startup") {
    return (
      <div className="h-12 px-3 py-2 border-b border-border" style={{ background }}>
        <div className="rounded-md px-2 py-1.5" style={{ background: soft }}>
          <div className="h-1.5 rounded-sm w-3/5 mb-1.5" style={{ background: accent }} />
          <div className="h-1 rounded-sm w-full bg-white/80" />
        </div>
      </div>
    );
  }

  if (styleId === "bold") {
    return (
      <div className="h-12 px-3 py-2 border-b border-border" style={{ background: "#fffafa" }}>
        <div className="flex h-full gap-2">
          <div className="w-1.5 rounded-sm" style={{ background: accent }} />
          <div className="flex-1 pt-0.5">
            <div className="h-1.5 rounded-sm w-3/5 mb-1.5" style={{ background: "#241313" }} />
            <div className="h-1 rounded-sm w-full mb-1" style={{ background: soft }} />
            <div className="h-1 rounded-sm w-4/5" style={{ background: soft }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-12 px-3 py-2 border-b border-border" style={{ background }}>
      <div className="flex h-full gap-2">
        <div className="w-1 rounded-sm" style={{ background: accent }} />
        <div className="flex-1">
          <div className="h-1.5 rounded-sm w-3/5 mb-1.5 bg-slate-800" />
          <div className="h-1 rounded-sm w-full mb-1" style={{ background: soft }} />
          <div className="h-1 rounded-sm w-4/5" style={{ background: soft }} />
        </div>
      </div>
    </div>
  );
};
