import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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
  ],
  TEACHER: [
    { to: "/teacher", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/teacher/classes", icon: "bi-door-open", label: "My Classes" },
    { to: "/teacher/marks", icon: "bi-pencil-square", label: "Enter Marks" },
    { to: "/teacher/rankings", icon: "bi-bar-chart-line", label: "Class Rankings" },
  ],
  STUDENT: [
    { to: "/student", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/student/results", icon: "bi-journal-text", label: "My Results" },
    { to: "/student/subjects", icon: "bi-journal-bookmark", label: "My Subjects" },
    { to: "/student/fees", icon: "bi-cash-coin", label: "Fee Statement" },
  ],
  PARENT: [
    { to: "/parent", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/parent/children", icon: "bi-people", label: "My Children" },
    { to: "/parent/results", icon: "bi-journal-text", label: "Results" },
    { to: "/parent/fees", icon: "bi-cash-coin", label: "Fee Statements" },
  ],
  FINANCE: [
    { to: "/finance", icon: "bi-speedometer2", label: "Dashboard" },
    { to: "/finance/structures", icon: "bi-receipt", label: "Fee Structures" },
    { to: "/finance/invoices", icon: "bi-file-earmark-text", label: "Invoices" },
    { to: "/finance/payments", icon: "bi-cash-coin", label: "Payments" },
  ],
};

export default function Sidebar({ collapsed, onClose }) {
  const { user } = useAuth();
  const items = user ? NAV_BY_ROLE[user.role] || [] : [];

  return (
    <>
      <aside className={`app-sidebar ${collapsed ? "app-sidebar--collapsed" : ""}`}>
        <div className="app-sidebar__brand">
          <i className="bi bi-mortarboard-fill"></i>
          {!collapsed && <span>Shule MS</span>}
        </div>

        <nav className="app-sidebar__nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split("/").length === 2}
              className={({ isActive }) =>
                `app-sidebar__link ${isActive ? "app-sidebar__link--active" : ""}`
              }
              onClick={onClose}
            >
              <i className={`bi ${item.icon}`}></i>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      {!collapsed && <div className="app-sidebar__backdrop d-lg-none" onClick={onClose} />}
    </>
  );
}
