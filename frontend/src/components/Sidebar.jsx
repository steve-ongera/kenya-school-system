// components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/moi_forces.png"; // Adjust path as needed

const NAV_BY_ROLE = {
  ADMIN: [
    { to: "/admin", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/admin/students", icon: "bi-people", label: "Students" },
    { to: "/admin/classrooms", icon: "bi-door-open", label: "Classes & Streams" },
    { to: "/admin/subjects", icon: "bi-journal-bookmark", label: "Subjects" },
    { to: "/admin/teachers", icon: "bi-person-workspace", label: "Teacher Allocation" },
    { to: "/admin/exams", icon: "bi-pencil-square", label: "Exams" },
    { to: "/admin/rankings", icon: "bi-bar-chart-line", label: "Rankings" },
    { to: "/admin/promotions", icon: "bi-arrow-up-circle", label: "Promotions" },
    { to: "/admin/fees", icon: "bi-cash-coin", label: "Fee Structures" },
    { to: "/admin/users", icon: "bi-shield-lock", label: "User Accounts" },
    { to: "/admin/reports", icon: "bi-graph-up", label: "Reports & Analytics" },
    { to: "/admin/calendar", icon: "bi-calendar-week", label: "Academic Calendar" },
    { to: "/admin/parents", icon: "bi-person-hearts", label: "Parents & Guardians" },
    { to: "/admin/settings", icon: "bi-gear", label: "School Settings" },
    // Profile and Change Password for Admin
    { to: "/profile", icon: "bi-person", label: "My Profile" },
    { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
  ],
  TEACHER: [
    { to: "/teacher", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/teacher/classes", icon: "bi-door-open", label: "My Classes" },
    { to: "/teacher/marks", icon: "bi-pencil-square", label: "Enter Marks" },
    { to: "/teacher/rankings", icon: "bi-bar-chart-line", label: "Class Rankings" },
    // Profile and Change Password for Teacher
    { to: "/profile", icon: "bi-person", label: "My Profile" },
    { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
  ],
  STUDENT: [
    { to: "/student", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/student/results", icon: "bi-journal-text", label: "My Results" },
    { to: "/student/subjects", icon: "bi-journal-bookmark", label: "My Subjects" },
    { to: "/student/fees", icon: "bi-cash-coin", label: "Fee Statement" },
    // Profile and Change Password for Student
    { to: "/profile", icon: "bi-person", label: "My Profile" },
    { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
  ],
  PARENT: [
    { to: "/parent", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/parent/children", icon: "bi-people", label: "My Children" },
    { to: "/parent/results", icon: "bi-journal-text", label: "Results" },
    { to: "/parent/fees", icon: "bi-cash-coin", label: "Fee Statements" },
    // Profile and Change Password for Parent
    { to: "/profile", icon: "bi-person", label: "My Profile" },
    { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
  ],
  FINANCE: [
    { to: "/finance", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/finance/structures", icon: "bi-receipt", label: "Fee Structures" },
    { to: "/finance/invoices", icon: "bi-file-earmark-text", label: "Invoices" },
    { to: "/finance/payments", icon: "bi-cash-coin", label: "Payments" },
    // Profile and Change Password for Finance
    { to: "/profile", icon: "bi-person", label: "My Profile" },
    { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
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
 * Navigation scrolls internally when items exceed available height.
 */
export default function Sidebar({ isDesktop, collapsed, mobileOpen, onClose }) {
  const { user } = useAuth();
  const items = user ? NAV_BY_ROLE[user.role] || [] : [];

  const isIconRail = isDesktop && collapsed;
  const showLabels = !isIconRail;

  const sidebarClass = [
    "app-sidebar",
    isIconRail ? "app-sidebar--collapsed" : "",
    !isDesktop && mobileOpen ? "app-sidebar--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

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

        {/* Navigation with internal scroll */}
        <nav className="app-sidebar__nav">
          {items.length === 0 ? (
            <div style={{ 
              padding: "1rem", 
              color: "rgba(255,255,255,0.4)", 
              fontSize: "var(--fs-xs)", 
              textAlign: "center" 
            }}>
              No items available
            </div>
          ) : (
            items.map((item) => (
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
              Moi High School
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