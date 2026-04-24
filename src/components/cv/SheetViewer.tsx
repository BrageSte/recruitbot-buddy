// Wraps a 210mm-wide CV/letter sheet and scales it down to fit the available width.
import { useEffect, useRef, useState, ReactNode } from "react";

export const SheetViewer = ({ children }: { children: ReactNode }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current?.clientWidth ?? 0;
      const A4_WIDTH_PX = 794; // 210mm @ 96dpi
      setScale(Math.min(1, w / A4_WIDTH_PX));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden">
      <div
        className="cv-scale-wrap"
        style={{ transform: `scale(${scale})`, width: 794, height: scale < 1 ? `calc(1123px * ${scale})` : undefined }}
      >
        {children}
      </div>
    </div>
  );
};
