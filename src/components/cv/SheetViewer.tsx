// Wraps a 210mm-wide CV/letter sheet and scales it down to fit the available width.
import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from "react";

const A4_WIDTH_PX = 794; // 210mm @ 96dpi

export const SheetViewer = ({ children }: { children: ReactNode }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [innerHeight, setInnerHeight] = useState(0);

  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const updateScale = () => {
      const w = wrapRef.current?.clientWidth ?? 0;
      setScale(Math.min(1, w / A4_WIDTH_PX));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!innerRef.current) return;
    const ro = new ResizeObserver(() => {
      setInnerHeight(innerRef.current?.offsetHeight ?? 0);
    });
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full">
      <div style={{ height: innerHeight * scale }}>
        <div
          ref={innerRef}
          className="cv-scale-wrap"
          style={{
            transform: `scale(${scale})`,
            width: A4_WIDTH_PX,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
