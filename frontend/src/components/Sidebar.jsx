// components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/masomo_logo.png";
import { NAV_BY_ROLE } from "../config/navigation";

/**
 * Nav config per role is an array of GROUPS instead of a flat list:
 *   { label?: string, items: [{ to, icon, label }] }
 *
 * `label` is optional — omit it to render the group's items with no
 * section header. Every role now uses section labels to keep related
 * tools grouped together and the sidebar easy to scan, with items
 * ordered by priority: primary dashboard/overview first, then core
 * day-to-day tools, then reports/secondary tools, then communication,
 * then account settings last.
 *
 * Every role includes a "Messages" link - 1:1 conversations are open
 * to all authenticated users (staff can start new threads, parents/
 * students can reply) - see /messages in App.jsx.
 *
 * NAV_BY_ROLE itself lives in config/navigation.js - the single source
 * of truth shared with Navbar.jsx (role-scoped page search). Do not
 * redeclare it here; import it instead so the two can never drift out
 * of sync.
 */

/**
 * Sidebar driven entirely by useSidebar():
 * - Desktop: always visible; `collapsed` switches full <-> icon-rail.
 * - Mobile/tablet: off-canvas drawer; `mobileOpen` slides it in via
 *   the `.app-sidebar--open` class already defined in main.css.
 *
 * Labels are only hidden when collapsed AND on desktop — on mobile the
 * drawer always shows full labels, matching the CSS's mobile override
 * of `.app-sidebar--collapsed`.
 *
 * Nav is rendered as groups (see NAV_BY_ROLE above); a group's
 * `label`, when present and not collapsed, renders as a
 * `.app-sidebar__section-title` header above its items.
 *
 * Navigation scrolls internally when items exceed available height.
 */
export default function Sidebar({ isDesktop, collapsed, mobileOpen, onClose }) {
  const { user } = useAuth();
  const groups = user ? NAV_BY_ROLE[user.role] || [] : [];

  const isIconRail = isDesktop && collapsed;
  const showLabels = !isIconRail;

  const sidebarClass = [
    "app-sidebar",
    isIconRail ? "app-sidebar--collapsed" : "",
    !isDesktop && mobileOpen ? "app-sidebar--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <>
      <aside className={sidebarClass}>
        <div className="app-sidebar__brand">
          {showLabels ? (
            // Expanded sidebar - show logo and text
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              width: "100%"
            }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "4px",
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: "4px"
              }}>
                <img
                  src={logo}
                  alt="Moi Forces Logo"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
              <span style={{
                fontSize: "1rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                MASOMO INFO SYSTEM
              </span>
            </div>
          ) : (
            // Collapsed sidebar - show only logo with white background
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "4px",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
              padding: "4px"
            }}>
              <img
                src={logo}
                alt="Moi Forces Logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
          )}
        </div>

        {/* Navigation with internal scroll, grouped with section labels */}
        <nav className="app-sidebar__nav">
          {totalItems === 0 ? (
            <div style={{
              padding: "1rem",
              color: "rgba(255,255,255,0.4)",
              fontSize: "var(--fs-xs)",
              textAlign: "center"
            }}>
              No items available
            </div>
          ) : (
            groups.map((group, gi) => (
              <div key={group.label || `group-${gi}`}>
                {group.label && showLabels && (
                  <div className="app-sidebar__section-title">{group.label}</div>
                )}
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to.split("/").length === 2}
                    className={({ isActive }) =>
                      `app-sidebar__link ${isActive ? "app-sidebar__link--active" : ""}`
                    }
                    onClick={!isDesktop ? onClose : undefined}
                    title={!showLabels ? item.label : undefined}
                  >
                    <i className={`bi ${item.icon}`}></i>
                    {showLabels && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            ))
          )}
        </nav>

        {/* Footer - School name and version only */}
        {showLabels && (
          <div className="app-sidebar__footer" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.15rem",
            padding: "0.7rem 1rem",
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{
              fontSize: "0.65rem",
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.04em",
              fontWeight: 500,
            }}>
              InnovationHub Softwares
            </div>
            <div style={{
              fontSize: "0.55rem",
              color: "rgba(255,255,255,0.25)",
              letterSpacing: "0.06em",
            }}>
              v2.1.0
            </div>
          </div>
        )}
      </aside>

      {!isDesktop && mobileOpen && (
        <div className="app-sidebar__backdrop" onClick={onClose} />
      )}
    </>
  );
}