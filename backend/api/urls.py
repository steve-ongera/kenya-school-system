from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()

router.register(r"users", views.UserViewSet, basename="user")
router.register(r"schools", views.SchoolViewSet, basename="school")
router.register(r"academic-years", views.AcademicYearViewSet, basename="academic-year")
router.register(r"terms", views.TermViewSet, basename="term")
router.register(r"grade-levels", views.GradeLevelViewSet, basename="grade-level")
router.register(r"streams", views.StreamViewSet, basename="stream")
router.register(r"classrooms", views.ClassRoomViewSet, basename="classroom")
router.register(r"students", views.StudentProfileViewSet, basename="student")
router.register(r"parents", views.ParentGuardianProfileViewSet, basename="parent")
router.register(r"parent-links", views.ParentStudentLinkViewSet, basename="parent-link")
router.register(r"enrollments", views.EnrollmentViewSet, basename="enrollment")
router.register(r"subjects", views.SubjectViewSet, basename="subject")
router.register(r"subject-papers", views.SubjectPaperViewSet, basename="subject-paper")
router.register(r"grade-subjects", views.GradeSubjectViewSet, basename="grade-subject")
router.register(r"selection-rules", views.SubjectSelectionRuleViewSet, basename="selection-rule")
router.register(r"teacher-allocations", views.TeacherSubjectAllocationViewSet, basename="teacher-allocation")
router.register(r"exam-types", views.ExamTypeViewSet, basename="exam-type")
router.register(r"exams", views.ExamViewSet, basename="exam")
router.register(r"exam-results", views.ExamResultViewSet, basename="exam-result")
router.register(r"grading-scales", views.GradingScaleViewSet, basename="grading-scale")
router.register(r"rankings", views.TermPositionRankingViewSet, basename="ranking")
router.register(r"promotion-rules", views.PromotionRuleViewSet, basename="promotion-rule")
router.register(r"fee-structures", views.FeeStructureViewSet, basename="fee-structure")
router.register(r"invoices", views.InvoiceViewSet, basename="invoice")
router.register(r"payments", views.PaymentViewSet, basename="payment")
router.register(r"communications", views.CommunicationViewSet, basename="communication")
router.register(r"notifications", views.NotificationViewSet, basename="notification")
router.register(r"conversations", views.ConversationViewSet, basename="conversation")
router.register(r"login-attempts", views.LoginAttemptLogViewSet, basename="login-attempt")
router.register(r"period-slots", views.PeriodSlotViewSet, basename="period-slots")
router.register(r"timetable-entries", views.TimetableEntryViewSet, basename="timetable-entries")

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="login"),  # replaces old login route
    path("auth/verify-otp/", views.VerifyOtpView.as_view(), name="verify-otp"),
    path("auth/forgot-password/", views.ForgotPasswordRequestView.as_view(), name="forgot-password"),
    path("auth/reset-password/", views.ResetPasswordConfirmView.as_view(), name="reset-password"),
    
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("profile/me/", views.ProfileView.as_view(), name="profile-me"),
    path("students/admit/", views.AdmitStudentView.as_view(), name="admit-student"),
    path("dashboard/stats/", views.DashboardStatsView.as_view(), name="dashboard-stats"),
    path("reports/overview/", views.ReportsOverviewView.as_view(), name="reports-overview"),
    path("students/me/performance/", views.StudentPerformanceDashboardView.as_view(), name="student-performance"),
    path("enrollments/<int:enrollment_id>/subjects/", views.StudentSubjectSelectionView.as_view(), name="student-subjects"),
    path("my-allocations/", views.MyAllocationsView.as_view(), name="my-allocations"),
    path("rank/", views.RankView.as_view(), name="rank"),
    path("finance-reports/collections/", views.FinanceCollectionsReportView.as_view(), name="finance-collections-report"),
    path("finance-reports/class-analysis/", views.FinanceClassAnalysisReportView.as_view(), name="finance-class-analysis-report"),
    path("finance-reports/detailed/", views.FinanceDetailedReportView.as_view(), name="finance-detailed-report"),
    path("payments/initiate/", views.InitiatePaymentView.as_view(), name="initiate-payment"),
    path("payments/mpesa-callback/", views.MpesaCallbackView.as_view(), name="mpesa-callback"),
    path("payments/status/<str:checkout_request_id>/", views.PaymentStatusView.as_view(), name="payment-status"),
    path("payments/<int:payment_id>/receipt/", views.ReceiptView.as_view(), name="payment-receipt"),
    path("receipts/verify/<str:receipt_no>/", views.VerifyReceiptView.as_view(), name="verify-receipt"),
    path("messaging/recipients/", views.RecipientSearchView.as_view(), name="messaging-recipients"),
    path("finance-reports/student-balances/", views.FinanceStudentBalancesReportView.as_view()),
    path("", include(router.urls)),
]