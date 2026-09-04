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

urlpatterns = [
    # auth
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    # student admission (creates User + StudentProfile + Enrollment)
    path("students/admit/", views.AdmitStudentView.as_view(), name="admit-student"),
    path("dashboard/stats/", views.DashboardStatsView.as_view(), name="dashboard-stats"),
    # subject selection for one enrollment
    path(
        "enrollments/<int:enrollment_id>/subjects/",
        views.StudentSubjectSelectionView.as_view(),
        name="student-subjects",
    ),
    # teacher portal helper
    path("my-allocations/", views.MyAllocationsView.as_view(), name="my-allocations"),
    # ranking trigger
    path("rank/", views.RankView.as_view(), name="rank"),
    path("", include(router.urls)),
]
