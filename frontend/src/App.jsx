import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import PageLoader from "./components/PageLoader";

// ---------------------------------------------------------------------------
// Every page is lazy-loaded: its code is only downloaded when someone opens
// it, which makes the first visit to the domain much lighter. While a page
// downloads, a <Suspense> boundary shows the circular loader.
// (AuthProvider, ProtectedRoute, AppLayout and PageLoader stay eager so the
// shell and the loader itself are always available.)
// ---------------------------------------------------------------------------
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Notifications = lazy(() => import("./pages/Notifications"));
const VerifyReportCard = lazy(() => import("./pages/VerifyReportCard"));
const NotFound = lazy(() => import("./pages/NotFound"));

// help & support - shared across ADMIN / TEACHER / FINANCE / STUDENT
const UserManual = lazy(() => import("./pages/UserManual"));
const ContactDeveloper = lazy(() => import("./pages/ContactDeveloper"));

// clearance
const StudentClearance = lazy(() => import("./pages/student/Clearance"));
const AdminClearance = lazy(() => import("./pages/admin/Clearance"));

// admin
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminLicense = lazy(() => import("./pages/admin/License"));
const AdminStudents = lazy(() => import("./pages/admin/Students"));
const AdminMarkEntry = lazy(() => import("./pages/admin/MarkEntry"));
const AdminClassrooms = lazy(() => import("./pages/admin/Classrooms"));
const AdminSubjects = lazy(() => import("./pages/admin/Subjects"));
const AdminTeacherAllocation = lazy(() => import("./pages/admin/TeacherAllocation"));
const AdminTimetableManagement = lazy(() => import("./pages/admin/TimetableManagement"));
const AdminExams = lazy(() => import("./pages/admin/Exams"));
const AdminRankings = lazy(() => import("./pages/admin/Rankings"));
const AdminPromotions = lazy(() => import("./pages/admin/Promotions"));
const AdminFees = lazy(() => import("./pages/admin/Fees"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminSecurityMonitor = lazy(() => import("./pages/admin/SecurityMonitor"));
const AdminExpenses = lazy(() => import("./pages/admin/Expenses"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const AdminCalendar = lazy(() => import("./pages/admin/Calendar"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminParents = lazy(() => import("./pages/admin/Parents"));
const AdminLetters = lazy(() => import("./pages/admin/Letters"));

// admin finance reports
const AdminFinanceCollections = lazy(() => import("./pages/admin/finance/Collections"));
const AdminFinanceClassAnalysis = lazy(() => import("./pages/admin/finance/ClassAnalysis"));
const AdminFinanceDetailedReport = lazy(() => import("./pages/admin/finance/DetailedReport"));

// finance
const FinanceDashboard = lazy(() => import("./pages/finance/Dashboard"));
const FinanceStructures = lazy(() => import("./pages/finance/Structures"));
const FinanceInvoices = lazy(() => import("./pages/finance/Invoices"));
const FinancePayments = lazy(() => import("./pages/finance/Payments"));
const FinanceExpenses = lazy(() => import("./pages/finance/Expenses"));
const FinanceCollections = lazy(() => import("./pages/finance/Collections"));
const FinanceClassAnalysis = lazy(() => import("./pages/finance/ClassAnalysis"));
const FinanceDetailedReport = lazy(() => import("./pages/finance/DetailedReport"));
import FinanceVerifyReceipt from "./pages/finance/FinanceVerifyReceipt";

// teacher
const TeacherDashboard = lazy(() => import("./pages/teacher/Dashboard"));
const TeacherClasses = lazy(() => import("./pages/teacher/Classes"));
const TeacherMarkEntry = lazy(() => import("./pages/teacher/MarkEntry"));
const TeacherRankings = lazy(() => import("./pages/teacher/Rankings"));

// student
const StudentDashboard = lazy(() => import("./pages/student/Dashboard"));
const StudentResults = lazy(() => import("./pages/student/Results"));
const StudentSubjects = lazy(() => import("./pages/student/Subjects"));
const StudentFees = lazy(() => import("./pages/student/Fees"));
const StudentFeeStructure = lazy(() => import("./pages/student/FeeStructure"));

// parent
const ParentDashboard = lazy(() => import("./pages/parent/Dashboard"));
const ParentChildren = lazy(() => import("./pages/parent/Children"));
const ParentResults = lazy(() => import("./pages/parent/Results"));
const ParentFees = lazy(() => import("./pages/parent/Fees"));

// communications & messaging - shared across roles
const Communications = lazy(() => import("./pages/Communications"));
const Messages = lazy(() => import("./pages/Messages"));

// ---------------------------------------------------------------------------
// Route guards. These sit INSIDE AppLayout, so their Suspense fallback is the
// inline loader: the sidebar and navbar stay on screen while a page loads.
// ---------------------------------------------------------------------------
function Guarded({ roles, children }) {
  return (
    <ProtectedRoute allowedRoles={roles}>
      <Suspense fallback={<PageLoader inline />}>{children}</Suspense>
    </ProtectedRoute>
  );
}

function RoleSection({ role, children }) {
  return <Guarded roles={[role]}>{children}</Guarded>;
}

export default function App() {
  return (
    <AuthProvider>
      {/* Outer boundary: full-screen loader for public pages (login, reset,
          verify) and for anything that loads outside the app layout. */}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify-report-card/:token" element={<VerifyReportCard />} />
          {/* Student-only self-service password reset. Admin/Teacher/Finance
              accounts are deliberately NOT reachable here - see AdminUsers /
              SecurityMonitor for staff password resets and unlocks. */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          <Route element={<AppLayout />}>
            {/* shared - any authenticated role */}
            <Route path="/profile" element={<Guarded><Profile /></Guarded>} />
            <Route path="/change-password" element={<Guarded><ChangePassword /></Guarded>} />
            <Route path="/messages" element={<Guarded><Messages /></Guarded>} />
            <Route path="/notifications" element={<Guarded><Notifications /></Guarded>} />

            {/* HELP & SUPPORT - restricted to ADMIN / TEACHER / FINANCE / STUDENT.
                Adjust the roles array below if you want PARENT included too. */}
            <Route
              path="/user-manual"
              element={
                <Guarded roles={["ADMIN", "TEACHER", "FINANCE", "STUDENT"]}>
                  <UserManual />
                </Guarded>
              }
            />
            <Route
              path="/contact-developer"
              element={
                <Guarded roles={["ADMIN", "TEACHER", "FINANCE", "STUDENT"]}>
                  <ContactDeveloper />
                </Guarded>
              }
            />

            {/* ADMIN */}
            <Route path="/admin" element={<RoleSection role="ADMIN"><AdminDashboard /></RoleSection>} />
            <Route path="/admin/license" element={<RoleSection role="ADMIN"><AdminLicense /></RoleSection>} />
            <Route path="/admin/students" element={<RoleSection role="ADMIN"><AdminStudents /></RoleSection>} />
            <Route path="/admin/classrooms" element={<RoleSection role="ADMIN"><AdminClassrooms /></RoleSection>} />
            <Route path="/admin/mark-entry" element={<RoleSection role="ADMIN"><AdminMarkEntry /></RoleSection>} />
            <Route path="/admin/subjects" element={<RoleSection role="ADMIN"><AdminSubjects /></RoleSection>} />
            <Route path="/admin/teachers" element={<RoleSection role="ADMIN"><AdminTeacherAllocation /></RoleSection>} />
            <Route path="/admin/timetable" element={<RoleSection role="ADMIN"><AdminTimetableManagement /></RoleSection>} />
            <Route path="/admin/exams" element={<RoleSection role="ADMIN"><AdminExams /></RoleSection>} />
            <Route path="/admin/rankings" element={<RoleSection role="ADMIN"><AdminRankings /></RoleSection>} />
            <Route path="/admin/promotions" element={<RoleSection role="ADMIN"><AdminPromotions /></RoleSection>} />
            <Route path="/admin/fees" element={<RoleSection role="ADMIN"><AdminFees /></RoleSection>} />
            <Route path="/admin/expenses" element={<RoleSection role="ADMIN"><AdminExpenses /></RoleSection>} />
            <Route path="/admin/users" element={<RoleSection role="ADMIN"><AdminUsers /></RoleSection>} />
            <Route path="/admin/security" element={<RoleSection role="ADMIN"><AdminSecurityMonitor /></RoleSection>} />

            <Route path="/admin/reports" element={<RoleSection role="ADMIN"><AdminReports /></RoleSection>} />
            <Route path="/admin/calendar" element={<RoleSection role="ADMIN"><AdminCalendar /></RoleSection>} />
            <Route path="/admin/settings" element={<RoleSection role="ADMIN"><AdminSettings /></RoleSection>} />
            <Route path="/admin/parents" element={<RoleSection role="ADMIN"><AdminParents /></RoleSection>} />
            <Route path="/admin/clearance" element={<RoleSection role="ADMIN"><AdminClearance /></RoleSection>} />
            <Route path="/admin/letters" element={<RoleSection role="ADMIN"><AdminLetters /></RoleSection>} />

            {/* ADMIN finance reports */}
            <Route path="/admin/finance-reports/collections" element={<RoleSection role="ADMIN"><AdminFinanceCollections /></RoleSection>} />
            <Route path="/admin/finance-reports/class-analysis" element={<RoleSection role="ADMIN"><AdminFinanceClassAnalysis /></RoleSection>} />
            <Route path="/admin/finance-reports/detailed" element={<RoleSection role="ADMIN"><AdminFinanceDetailedReport /></RoleSection>} />

            {/* TEACHER */}
            <Route path="/teacher" element={<RoleSection role="TEACHER"><TeacherDashboard /></RoleSection>} />
            <Route path="/teacher/classes" element={<RoleSection role="TEACHER"><TeacherClasses /></RoleSection>} />
            <Route path="/teacher/marks" element={<RoleSection role="TEACHER"><TeacherMarkEntry /></RoleSection>} />
            <Route path="/teacher/rankings" element={<RoleSection role="TEACHER"><TeacherRankings /></RoleSection>} />

            {/* STUDENT */}
            <Route path="/student" element={<RoleSection role="STUDENT"><StudentDashboard /></RoleSection>} />
            <Route path="/student/results" element={<RoleSection role="STUDENT"><StudentResults /></RoleSection>} />
            <Route path="/student/subjects" element={<RoleSection role="STUDENT"><StudentSubjects /></RoleSection>} />
            <Route path="/student/fees" element={<RoleSection role="STUDENT"><StudentFees /></RoleSection>} />
            <Route path="/student/fee-structure" element={<RoleSection role="STUDENT"><StudentFeeStructure /></RoleSection>} />
            <Route path="/student/clearance" element={<RoleSection role="STUDENT"><StudentClearance /></RoleSection>} />

            {/* PARENT */}
            <Route path="/parent" element={<RoleSection role="PARENT"><ParentDashboard /></RoleSection>} />
            <Route path="/parent/children" element={<RoleSection role="PARENT"><ParentChildren /></RoleSection>} />
            <Route path="/parent/results" element={<RoleSection role="PARENT"><ParentResults /></RoleSection>} />
            <Route path="/parent/fees" element={<RoleSection role="PARENT"><ParentFees /></RoleSection>} />

            {/* FINANCE */}
            <Route path="/finance" element={<RoleSection role="FINANCE"><FinanceDashboard /></RoleSection>} />
            <Route path="/finance/structures" element={<RoleSection role="FINANCE"><FinanceStructures /></RoleSection>} />
            <Route path="/finance/invoices" element={<RoleSection role="FINANCE"><FinanceInvoices /></RoleSection>} />
            <Route path="/finance/payments" element={<RoleSection role="FINANCE"><FinancePayments /></RoleSection>} />
            <Route path="/finance/expenses" element={<RoleSection role="FINANCE"><FinanceExpenses /></RoleSection>} />
            <Route path="/finance/verify-receipt" element={<RoleSection role="FINANCE"><FinanceVerifyReceipt /></RoleSection>} />
            <Route path="/verify-receipt/:receiptNo" element={<RoleSection role="FINANCE"><FinanceVerifyReceipt /></RoleSection>} />

            {/* FINANCE reports */}
            <Route path="/finance/reports/collections" element={<RoleSection role="FINANCE"><FinanceCollections /></RoleSection>} />
            <Route path="/finance/reports/class-analysis" element={<RoleSection role="FINANCE"><FinanceClassAnalysis /></RoleSection>} />
            <Route path="/finance/reports/detailed" element={<RoleSection role="FINANCE"><FinanceDetailedReport /></RoleSection>} />

            {/* COMMUNICATIONS - Admin and Finance can both broadcast; each keeps its own path so the sidebar entry sits naturally in its own role group */}
            <Route path="/admin/communications" element={<RoleSection role="ADMIN"><Communications /></RoleSection>} />
            <Route path="/finance/communications" element={<RoleSection role="FINANCE"><Communications /></RoleSection>} />

            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Any signed-in user hitting an unknown path within the app
                shell (e.g. a stale link under their role) sees 404 with
                the sidebar/navbar still in place, instead of a blank page
                or an unexplained redirect. */}
            <Route path="*" element={<Guarded><NotFound /></Guarded>} />
          </Route>

          {/* Anything outside the app shell entirely (typo'd URL, dead
              bookmark, no session) gets the same 404 page, full-screen. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}