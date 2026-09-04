import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";

// admin
import AdminDashboard from "./pages/admin/Dashboard";
import AdminStudents from "./pages/admin/Students";
import AdminClassrooms from "./pages/admin/Classrooms";
import AdminSubjects from "./pages/admin/Subjects";
import AdminTeacherAllocation from "./pages/admin/TeacherAllocation";
import AdminExams from "./pages/admin/Exams";
import AdminRankings from "./pages/admin/Rankings";
import AdminPromotions from "./pages/admin/Promotions";
import AdminFees from "./pages/admin/Fees";
import AdminUsers from "./pages/admin/Users";

// teacher
import TeacherDashboard from "./pages/teacher/Dashboard";
import TeacherClasses from "./pages/teacher/Classes";
import TeacherMarkEntry from "./pages/teacher/MarkEntry";
import TeacherRankings from "./pages/teacher/Rankings";

// student
import StudentDashboard from "./pages/student/Dashboard";
import StudentResults from "./pages/student/Results";
import StudentSubjects from "./pages/student/Subjects";
import StudentFees from "./pages/student/Fees";

// parent
import ParentDashboard from "./pages/parent/Dashboard";
import ParentChildren from "./pages/parent/Children";
import ParentResults from "./pages/parent/Results";
import ParentFees from "./pages/parent/Fees";

// finance
import FinanceDashboard from "./pages/finance/Dashboard";
import FinanceStructures from "./pages/finance/Structures";
import FinanceInvoices from "./pages/finance/Invoices";
import FinancePayments from "./pages/finance/Payments";

function RoleSection({ role, children }) {
  return <ProtectedRoute allowedRoles={[role]}>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<AppLayout />}>
          {/* ADMIN */}
          <Route path="/admin" element={<RoleSection role="ADMIN"><AdminDashboard /></RoleSection>} />
          <Route path="/admin/students" element={<RoleSection role="ADMIN"><AdminStudents /></RoleSection>} />
          <Route path="/admin/classrooms" element={<RoleSection role="ADMIN"><AdminClassrooms /></RoleSection>} />
          <Route path="/admin/subjects" element={<RoleSection role="ADMIN"><AdminSubjects /></RoleSection>} />
          <Route path="/admin/teachers" element={<RoleSection role="ADMIN"><AdminTeacherAllocation /></RoleSection>} />
          <Route path="/admin/exams" element={<RoleSection role="ADMIN"><AdminExams /></RoleSection>} />
          <Route path="/admin/rankings" element={<RoleSection role="ADMIN"><AdminRankings /></RoleSection>} />
          <Route path="/admin/promotions" element={<RoleSection role="ADMIN"><AdminPromotions /></RoleSection>} />
          <Route path="/admin/fees" element={<RoleSection role="ADMIN"><AdminFees /></RoleSection>} />
          <Route path="/admin/users" element={<RoleSection role="ADMIN"><AdminUsers /></RoleSection>} />

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

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
