from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()

# ---------------------------------------------------------------------------
# USERS / AUDIT
# ---------------------------------------------------------------------------
router.register(r"users", views.UserViewSet, basename="user")
router.register(r"login-attempts", views.LoginAttemptLogViewSet, basename="login-attempt")

# ---------------------------------------------------------------------------
# SCHOOL / CALENDAR
# ---------------------------------------------------------------------------
router.register(r"schools", views.SchoolViewSet, basename="school")
router.register(r"academic-years", views.AcademicYearViewSet, basename="academic-year")
router.register(r"terms", views.TermViewSet, basename="term")

# ---------------------------------------------------------------------------
# CURRICULUM / GRADE STRUCTURE
# ---------------------------------------------------------------------------
router.register(r"grade-levels", views.GradeLevelViewSet, basename="grade-level")
router.register(r"streams", views.StreamViewSet, basename="stream")
router.register(r"classrooms", views.ClassRoomViewSet, basename="classroom")

# ---------------------------------------------------------------------------
# STUDENTS / GUARDIANS / ENROLLMENT
# ---------------------------------------------------------------------------
router.register(r"students", views.StudentProfileViewSet, basename="student")
router.register(r"parents", views.ParentGuardianProfileViewSet, basename="parent")
router.register(r"parent-links", views.ParentStudentLinkViewSet, basename="parent-link")
router.register(r"enrollments", views.EnrollmentViewSet, basename="enrollment")

# ---------------------------------------------------------------------------
# SUBJECTS / SELECTION
# ---------------------------------------------------------------------------
router.register(r"subjects", views.SubjectViewSet, basename="subject")
router.register(r"subject-papers", views.SubjectPaperViewSet, basename="subject-paper")
router.register(r"grade-subjects", views.GradeSubjectViewSet, basename="grade-subject")
router.register(r"selection-rules", views.SubjectSelectionRuleViewSet, basename="selection-rule")
router.register("pathways", views.PathwayViewSet)
router.register("subject-groups", views.SubjectGroupViewSet)
router.register("selection-tracks", views.SelectionTrackViewSet)
router.register("track-group-rules", views.TrackGroupRuleViewSet)

# ---------------------------------------------------------------------------
# TEACHER ALLOCATION / TIMETABLE
# ---------------------------------------------------------------------------
router.register(r"teacher-allocations", views.TeacherSubjectAllocationViewSet, basename="teacher-allocation")
router.register(r"period-slots", views.PeriodSlotViewSet, basename="period-slots")
router.register(r"timetable-entries", views.TimetableEntryViewSet, basename="timetable-entries")

# ---------------------------------------------------------------------------
# EXAMS / RESULTS
# ---------------------------------------------------------------------------
router.register(r"exam-types", views.ExamTypeViewSet, basename="exam-type")
router.register(r"exams", views.ExamViewSet, basename="exam")
router.register(r"exam-results", views.ExamResultViewSet, basename="exam-result")
router.register(r"grading-scales", views.GradingScaleViewSet, basename="grading-scale")
router.register(r"rankings", views.TermPositionRankingViewSet, basename="ranking")
router.register(r"promotion-rules", views.PromotionRuleViewSet, basename="promotion-rule")

# ---------------------------------------------------------------------------
# FEES / PAYMENTS / EXPENSES
# ---------------------------------------------------------------------------
router.register(r"fee-structures", views.FeeStructureViewSet, basename="fee-structure")
router.register(r"invoices", views.InvoiceViewSet, basename="invoice")
router.register(r"payments", views.PaymentViewSet, basename="payment")
router.register(r"expense-categories", views.ExpenseCategoryViewSet, basename="expense-category")
router.register(r"expenses", views.ExpenseViewSet, basename="expense")

# ---------------------------------------------------------------------------
# STUDENT CLEARANCE
# ---------------------------------------------------------------------------
router.register(r"clearance", views.ClearanceApplicationViewSet, basename="clearance")

# ---------------------------------------------------------------------------
# COMMUNICATIONS & MESSAGING
# ---------------------------------------------------------------------------
router.register(r"communications", views.CommunicationViewSet, basename="communication")
router.register(r"notifications", views.NotificationViewSet, basename="notification")
router.register(r"conversations", views.ConversationViewSet, basename="conversation")

# ---------------------------------------------------------------------------
# LICENSING
# ---------------------------------------------------------------------------
router.register(r"subscription-packages", views.SubscriptionPackageViewSet, basename="subscription-package")


urlpatterns = [
    # -----------------------------------------------------------------
    # AUTH
    # -----------------------------------------------------------------
    path("auth/login/", views.LoginView.as_view(), name="login"),  # replaces old login route
    path("auth/verify-otp/", views.VerifyOtpView.as_view(), name="verify-otp"),
    path("auth/forgot-password/", views.ForgotPasswordRequestView.as_view(), name="forgot-password"),
    path("auth/reset-password/", views.ResetPasswordConfirmView.as_view(), name="reset-password"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("profile/me/", views.ProfileView.as_view(), name="profile-me"),

    # -----------------------------------------------------------------
    # LICENSE
    # -----------------------------------------------------------------
    path("license/me/", views.LicenseMeView.as_view(), name="license-me"),
    path("license/redeem/", views.LicenseRedeemView.as_view(), name="license-redeem"),
    path("license/status/", views.LicenseStatusView.as_view()),

    # -----------------------------------------------------------------
    # STUDENTS / ENROLLMENT
    # -----------------------------------------------------------------
    path("students/admit/", views.AdmitStudentView.as_view(), name="admit-student"),
    path("students/me/performance/", views.StudentPerformanceDashboardView.as_view(), name="student-performance"),
    path("enrollments/<int:enrollment_id>/subjects/",views.StudentSubjectSelectionView.as_view(),name="student-subjects",),
    path("my-allocations/", views.MyAllocationsView.as_view(), name="my-allocations"),
    path("my-class-teacher-classrooms/",views.MyClassTeacherClassroomsView.as_view(),name="my-class-teacher-classrooms",),

    # -----------------------------------------------------------------
    # EXAMS / RESULTS / REPORT CARDS
    # -----------------------------------------------------------------
    path("rank/", views.RankView.as_view(), name="rank"),
    path("exam-summary/", views.StudentExamSummaryView.as_view(), name="exam-summary"),
    path("report-cards/<str:token>/qr/", views.ReportCardQrView.as_view()),
    path("report-cards/verify/<str:token>/", views.ReportCardVerifyView.as_view()),

    # -----------------------------------------------------------------
    # FEES / PAYMENTS
    # -----------------------------------------------------------------
    path("fees/my-structures/", views.StudentFeeStructuresView.as_view(), name="my-fee-structures"),
    path("payments/initiate/", views.InitiatePaymentView.as_view(), name="initiate-payment"),
    path("payments/mpesa-callback/", views.MpesaCallbackView.as_view(), name="mpesa-callback"),
    path("payments/status/<str:checkout_request_id>/", views.PaymentStatusView.as_view(), name="payment-status"),
    path("payments/<int:payment_id>/receipt/", views.ReceiptView.as_view(), name="payment-receipt"),
    path("receipts/verify/<str:receipt_no>/", views.VerifyReceiptView.as_view(), name="verify-receipt"),
    path("gatepass/class/", views.ClassGatepassCardsView.as_view()),
    path("gatepass/verify/<str:token>/", views.GatepassVerifyView.as_view()),

    # -----------------------------------------------------------------
    # FINANCE REPORTS
    # -----------------------------------------------------------------
    path("finance-reports/collections/",views.FinanceCollectionsReportView.as_view(),name="finance-collections-report",),
    path("finance-reports/class-analysis/",views.FinanceClassAnalysisReportView.as_view(),name="finance-class-analysis-report",),
    path("finance-reports/detailed/", views.FinanceDetailedReportView.as_view(), name="finance-detailed-report"),
    path("finance-reports/student-balances/", views.FinanceStudentBalancesReportView.as_view()),

    # -----------------------------------------------------------------
    # STUDENT CLEARANCE
    # -----------------------------------------------------------------
    path("my-clearance/", views.StudentClearanceView.as_view(), name="my-clearance"),

    # -----------------------------------------------------------------
    # COMMUNICATIONS / MESSAGING
    # -----------------------------------------------------------------
    path("messaging/recipients/", views.RecipientSearchView.as_view(), name="messaging-recipients"),

    # -----------------------------------------------------------------
    # DASHBOARDS / REPORTS
    # -----------------------------------------------------------------
    path("dashboard/stats/", views.DashboardStatsView.as_view(), name="dashboard-stats"),
    path("dashboard/principal-stats/", views.PrincipalDashboardStatsView.as_view(), name="principal-dashboard-stats"),
    path("dashboard/secretary-stats/", views.SecretaryDashboardStatsView.as_view(), name="secretary-dashboard-stats"),
    path("reports/overview/", views.ReportsOverviewView.as_view(), name="reports-overview"),

    # -----------------------------------------------------------------
    # ROUTER-BACKED VIEWSETS
    # -----------------------------------------------------------------
    path("", include(router.urls)),
]