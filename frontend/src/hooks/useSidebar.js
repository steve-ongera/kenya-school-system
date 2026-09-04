// hooks/useSidebar.js
import { useState, useEffect, useCallback } from "react";

const DESKTOP_QUERY = "(min-width: 992px)";

/**
 * Manages sidebar behavior across breakpoints:
 * - Desktop (>=992px): sidebar is ALWAYS visible by default.
 *   Toggling only switches it between full width and icon-rail ("collapsed").
 * - Mobile/tablet (<992px): sidebar is an off-canvas drawer, hidden by default.
 *   Toggling slides it in/out ("mobileOpen"), and it auto-closes on route change
 *   or when the viewport crosses back up to desktop.
 */
export function useSidebar() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Track breakpoint changes (e.g. window resize, device rotation)
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);

    const handleChange = (e) => {
      setIsDesktop(e.matches);
      if (e.matches) {
        // Crossing up into desktop: drawer concept no longer applies
        setMobileOpen(false);
      } else {
        // Crossing down into mobile: icon-rail concept no longer applies,
        // sidebar should start fully hidden (off-canvas)
        setCollapsed(false);
      }
    };

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      setCollapsed((prev) => !prev);
    } else {
      setMobileOpen((prev) => !prev);
    }
  }, [isDesktop]);

  const closeMobileSidebar = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return {
    isDesktop,
    collapsed, // desktop: full vs icon-rail
    mobileOpen, // mobile: drawer closed vs open
    toggleSidebar,
    closeMobileSidebar,
  };
}