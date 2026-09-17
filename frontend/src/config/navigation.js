// config/navigation.js
//
// Single source of truth for per-role navigation. Both Sidebar.jsx (renders
// the links) and Navbar.jsx (role-scoped page search/autosuggest) read from
// this so a role can never search its way to a page it has no link to.
export const NAV_BY_ROLE = {
  ADMIN: [
    {
      items: [
        { to: "/admin", icon: "bi-speedometer2", label: "Dashboard" },
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
      ],
    },
    {
      label: "Academics",
      items: [
        { to: "/admin/mark-entry", icon: "bi-grid-3x3-gap", label: "Mark Entry (All Subjects)" },
        { to: "/admin/classrooms", icon: "bi-door-open", label: "Classes & Streams" },
        { to: "/admin/subjects", icon: "bi-journal-bookmark", label: "Subjects" },
        { to: "/admin/exams", icon: "bi-pencil-square", label: "Exams" },
        { to: "/admin/rankings", icon: "bi-bar-chart-line", label: "Rankings" },
        { to: "/admin/promotions", icon: "bi-arrow-up-circle", label: "Promotions" },
        { to: "/admin/calendar", icon: "bi-calendar-week", label: "Academic Calendar" },
        { to: "/admin/timetable", icon: "bi-grid-3x3", label: "Timetable Management" },
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
        { to: "/admin/expenses", icon: "bi-wallet2", label: "Expenses" },
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
       { to: "/admin/license", icon: "bi-key-fill", label: "License" },
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
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
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
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
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
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
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
        { to: "/finance/expenses", icon: "bi-wallet2", label: "Expenses" },
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
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
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