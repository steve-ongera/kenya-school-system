// components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/masomo_logo.png"; // Adjust path as needed

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
 */
const NAV_BY_ROLE = {
  ADMIN: [
    {
      items: [
        { to: "/admin", icon: "bi-speedometer2", label: "Dashboard" },
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
      ],
    },
    {
      label: "Academics",
      items: [
        { to: "/admin/classrooms", icon: "bi-door-open", label: "Classes & Streams" },
        { to: "/admin/subjects", icon: "bi-journal-bookmark", label: "Subjects" },
        { to: "/admin/exams", icon: "bi-pencil-square", label: "Exams" },
        { to: "/admin/rankings", icon: "bi-bar-chart-line", label: "Rankings" },
        { to: "/admin/promotions", icon: "bi-arrow-up-circle", label: "Promotions" },
        { to: "/admin/calendar", icon: "bi-calendar-week", label: "Academic Calendar" },
      ],
    },
    {
      label: "People",
      items: [
        { to: "/admin/students", icon: "bi-people", label: "Students" },
        { to: "/admin/teachers", icon: "bi-person-workspace", label: "Teacher Allocation" },
        { to: "/admin/parents", icon: "bi-person-hearts", label: "Parents & Guardians" },
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/admin/fees", icon: "bi-cash-coin", label: "Fee Structures" },
        { to: "/admin/finance-reports/collections", icon: "bi-graph-up-arrow", label: "Collections Report" },
        { to: "/admin/finance-reports/class-analysis", icon: "bi-bar-chart-steps", label: "Class Analysis" },
        { to: "/admin/finance-reports/detailed", icon: "bi-table", label: "Detailed Report" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/admin/communications", icon: "bi-megaphone", label: "Announcements" },
      ],
    },
    {
      label: "Administration",
      items: [
        { to: "/admin/users", icon: "bi-shield-lock", label: "User Accounts" },
        { to: "/admin/security", icon: "bi-shield-exclamation", label: "Security Monitor" },
        { to: "/admin/reports", icon: "bi-graph-up", label: "Reports & Analytics" },
        { to: "/admin/settings", icon: "bi-gear", label: "School Settings" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
      ],
    },
  ],

  TEACHER: [
    {
      items: [
        { to: "/teacher", icon: "bi-speedometer2", label: "Dashboard" },
      ],
    },
    {
      label: "Academics",
      items: [
        { to: "/teacher/classes", icon: "bi-door-open", label: "My Classes" },
        { to: "/teacher/marks", icon: "bi-pencil-square", label: "Enter Marks" },
        { to: "/teacher/rankings", icon: "bi-bar-chart-line", label: "Class Rankings" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
      ],
    },
  ],

  STUDENT: [
    {
      items: [
        { to: "/student", icon: "bi-speedometer2", label: "Dashboard" },
      ],
    },
    {
      label: "Academics",
      items: [
        { to: "/student/subjects", icon: "bi-journal-bookmark", label: "My Subjects" },
        { to: "/student/results", icon: "bi-journal-text", label: "My Results" },
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/student/fees", icon: "bi-cash-coin", label: "Fee Statement" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
      ],
    },
  ],

  PARENT: [
    {
      items: [
        { to: "/parent", icon: "bi-speedometer2", label: "Dashboard" },
      ],
    },
    {
      label: "Family",
      items: [
        { to: "/parent/children", icon: "bi-people", label: "My Children" },
      ],
    },
    {
      label: "Academics",
      items: [
        { to: "/parent/results", icon: "bi-journal-text", label: "Results" },
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/parent/fees", icon: "bi-cash-coin", label: "Fee Statements" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
      ],
    },
  ],

  FINANCE: [
    {
      items: [
        { to: "/finance", icon: "bi-speedometer2", label: "Dashboard" },
      ],
    },
    {
      label: "Fee Management",
      items: [
        { to: "/finance/structures", icon: "bi-receipt", label: "Fee Structures" },
        { to: "/finance/invoices", icon: "bi-file-earmark-text", label: "Invoices" },
        { to: "/finance/payments", icon: "bi-cash-coin", label: "Payments" },
      ],
    },
    {
      label: "Reports",
      items: [
        { to: "/finance/reports/collections", icon: "bi-graph-up-arrow", label: "Collections Report" },
        { to: "/finance/reports/class-analysis", icon: "bi-bar-chart-steps", label: "Class Analysis" },
        { to: "/finance/reports/detailed", icon: "bi-table", label: "Detailed Report" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/finance/communications", icon: "bi-megaphone", label: "Announcements" },
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
      ],
    },
  ],
};

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
                MOI HIGH SCHOOL
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