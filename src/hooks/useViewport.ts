import { useEffect, useState } from "react";

const MOBILE_MAX = 768;

/**
 * Reports whether the viewport is mobile-sized. Drives layout-only divergence
 * (desktop nudges authoring, mobile nudges practice). Capability is identical
 * on both — feature parity is a standing constraint (ADR-0001).
 */
export function useViewport(): { isMobile: boolean } {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return { isMobile };
}
