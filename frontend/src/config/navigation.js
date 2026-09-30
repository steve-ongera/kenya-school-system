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
        { to: "/admin/clearance", icon: "bi-patch-check", label: "Student Clearance" },
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
        { to: "/admin/verify-receipt", icon: "bi-qr-code-scan", label: "Verify Receipt" },
        { to: "/admin/fee-cards", icon: "bi-credit-card-2-front", label: "Fee Update Cards" },
        { to: "/verify-gatepass", icon: "bi-shield-check", label: "Verify Gatepass" },
        { to: "/admin/finance-reports/collections", icon: "bi-graph-up-arrow", label: "Collections Report" },
        { to: "/admin/finance-reports/class-analysis", icon: "bi-bar-chart-steps", label: "Class Analysis" },
        { to: "/admin/finance-reports/detailed", icon: "bi-table", label: "Student Balance & Reports" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/admin/communications", icon: "bi-megaphone", label: "Announcements" },
        { to: "/admin/letters", icon: "bi-envelope-paper", label: "Letters & Documents" },
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
        { to: "/user-manual", icon: "bi-play-circle", label: "User Manual" },
        { to: "/contact-developer", icon: "bi-headset", label: "Contact Developer" },
      ],
    },
  ],

  // -----------------------------------------------------------------
  // PRINCIPAL — oversight role: academics, staffing, results, reports.
  // Reuses the same page components as ADMIN (via /principal/* routes
  // in App.jsx) rather than duplicating pages — the Principal just gets
  // a narrower, read/oversight-leaning slice of the same tools.
  // -----------------------------------------------------------------
  PRINCIPAL: [
    {
      items: [
        { to: "/principal", icon: "bi-speedometer2", label: "Dashboard" },
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
        { to: "/verify-gatepass", icon: "bi-shield-check", label: "Verify Gatepass" },
      ],
    },
    {
      label: "Academics",
      items: [
        { to: "/principal/classrooms", icon: "bi-door-open", label: "Classes & Streams" },
        { to: "/principal/exams", icon: "bi-pencil-square", label: "Exams" },
        { to: "/principal/rankings", icon: "bi-bar-chart-line", label: "Rankings" },
        { to: "/principal/promotions", icon: "bi-arrow-up-circle", label: "Promotions" },
        { to: "/principal/clearance", icon: "bi-patch-check", label: "Student Clearance" },
      ],
    },
    {
      label: "People",
      items: [
        { to: "/principal/students", icon: "bi-people", label: "Students" },
        { to: "/principal/teachers", icon: "bi-person-workspace", label: "Teacher Allocation" },
      ],
    },
    {
      label: "Reports",
      items: [
        { to: "/principal/reports", icon: "bi-graph-up", label: "Reports & Analytics" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/principal/communications", icon: "bi-megaphone", label: "Announcements" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
        { to: "/user-manual", icon: "bi-play-circle", label: "User Manual" },
        { to: "/contact-developer", icon: "bi-headset", label: "Contact Developer" },
      ],
    },
  ],

  // -----------------------------------------------------------------
  // SECRETARY — front-office role: admitting/managing student records,
  // clearance desk, a full Finance slice (payments, student balance &
  // reports, expenses, invoices, verify receipt, fee update cards),
  // then Mark Entry, Exams, Rankings, Promotions, timetable &
  // teacher-allocation reference, announcements and letters. Reuses
  // the ADMIN/FINANCE page components under /secretary/* routes.
  // -----------------------------------------------------------------
  SECRETARY: [
    {
      items: [
        { to: "/secretary", icon: "bi-speedometer2", label: "Dashboard" },
        { to: "/messages", icon: "bi-chat-right-text", label: "Messages" },
        { to: "/notifications", icon: "bi-bell", label: "Notifications" },
      ],
    },
    {
      label: "Student Records",
      items: [
        { to: "/secretary/students", icon: "bi-people", label: "Students (Admit & Mng)" },
        { to: "/secretary/clearance", icon: "bi-patch-check", label: "Student Clearance" },
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/secretary/payments", icon: "bi-cash-coin", label: "Payments" },
        { to: "/secretary/finance-reports/detailed", icon: "bi-table", label: "Student Balance & Reports" },
        { to: "/secretary/expenses", icon: "bi-wallet2", label: "Expenses" },
        { to: "/secretary/invoices", icon: "bi-file-earmark-text", label: "Invoices" },
        { to: "/secretary/verify-receipt", icon: "bi-qr-code-scan", label: "Verify Receipt" },
        { to: "/secretary/fee-cards", icon: "bi-credit-card-2-front", label: "Fee Update Cards" },
        { to: "/verify-gatepass", icon: "bi-shield-check", label: "Verify Gatepass" },
      ],
    },
    {
      label: "Academics & Staffing",
      items: [
        { to: "/secretary/mark-entry", icon: "bi-grid-3x3-gap", label: "Mark Entry (All Subjects)" },
        { to: "/secretary/exams", icon: "bi-pencil-square", label: "Exams" },
        { to: "/secretary/rankings", icon: "bi-bar-chart-line", label: "Rankings" },
        { to: "/secretary/promotions", icon: "bi-arrow-up-circle", label: "Promotions" },
        { to: "/secretary/classrooms", icon: "bi-door-open", label: "Classes & Streams" },
        { to: "/secretary/timetable", icon: "bi-grid-3x3", label: "Timetable Management" },
        { to: "/secretary/teachers", icon: "bi-person-workspace", label: "Teacher Allocation" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/secretary/communications", icon: "bi-megaphone", label: "Announcements" },
        { to: "/secretary/letters", icon: "bi-envelope-paper", label: "Letters & Documents" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/profile", icon: "bi-person", label: "My Profile" },
        { to: "/change-password", icon: "bi-shield-lock", label: "Change Password" },
        { to: "/user-manual", icon: "bi-play-circle", label: "User Manual" },
        { to: "/contact-developer", icon: "bi-headset", label: "Contact Developer" },
      ],
    },
  ],

  TEACHER: [
    {
      items: [
        { to: "/teacher", icon: "bi-speedometer2", label: "Dashboard" },
        { to: "/verify-gatepass", icon: "bi-shield-check", label: "Verify Gatepass" },
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
        { to: "/user-manual", icon: "bi-play-circle", label: "User Manual" },
        { to: "/contact-developer", icon: "bi-headset", label: "Contact Developer" },
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
        { to: "/student/clearance", icon: "bi-patch-check", label: "Clearance" },
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/student/fees", icon: "bi-cash-coin", label: "Fee Statement" },
        { to: "/student/fee-structure", icon: "bi-card-list", label: "Fee Structure" },
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
        { to: "/verify-gatepass", icon: "bi-shield-check", label: "Verify Gatepass" },
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
        { to: "/user-manual", icon: "bi-play-circle", label: "User Manual" },
        { to: "/contact-developer", icon: "bi-headset", label: "Contact Developer" },
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
        { to: "/finance/verify-receipt", icon: "bi-qr-code-scan", label: "Verify Receipt" },
        { to: "/finance/fee-cards", icon: "bi-credit-card-2-front", label: "Fee Update Cards" },
        { to: "/verify-gatepass", icon: "bi-shield-check", label: "Verify Gatepass" },
        { to: "/finance/expenses", icon: "bi-wallet2", label: "Expenses" },
      ],
    },
    {
      label: "Reports",
      items: [
        { to: "/finance/reports/collections", icon: "bi-graph-up-arrow", label: "Collections Report" },
        { to: "/finance/reports/class-analysis", icon: "bi-bar-chart-steps", label: "Class Analysis" },
        { to: "/finance/reports/detailed", icon: "bi-table", label: "Student Balance & Reports" },
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
        { to: "/user-manual", icon: "bi-play-circle", label: "User Manual" },
        { to: "/contact-developer", icon: "bi-headset", label: "Contact Developer" },
      ],
    },
  ],
};