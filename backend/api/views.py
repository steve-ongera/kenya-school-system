from decimal import Decimal

from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework import viewsets, generics, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from datetime import date
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth, TruncYear


from . import models, serializers, services, utils


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        refresh = RefreshToken.for_user(user)
        refresh["role"] = user.role
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": serializers.UserSerializer(user).data,
            }
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(serializers.UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = serializers.ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response({"detail": "Old password incorrect."}, status=400)
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        return Response({"detail": "Password updated."})


# ---------------------------------------------------------------------------
# USERS (admin manages staff/parent accounts here; students via StudentEnroll)
# ---------------------------------------------------------------------------
class UserViewSet(viewsets.ModelViewSet):
    queryset = models.User.objects.all().order_by("first_name")
    permission_classes = [utils.IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["role"]
    search_fields = ["first_name", "last_name", "username", "email"]

    def get_serializer_class(self):
        return serializers.UserCreateSerializer if self.action == "create" else serializers.UserSerializer


# ---------------------------------------------------------------------------
# SCHOOL / CALENDAR
# ---------------------------------------------------------------------------
class SchoolViewSet(viewsets.ModelViewSet):
    queryset = models.School.objects.all()
    serializer_class = serializers.SchoolSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = models.AcademicYear.objects.all()
    serializer_class = serializers.AcademicYearSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]


class TermViewSet(viewsets.ModelViewSet):
    queryset = models.Term.objects.select_related("academic_year").all()
    serializer_class = serializers.TermSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    filterset_fields = ["academic_year", "is_current"]
    filter_backends = [DjangoFilterBackend]


# ---------------------------------------------------------------------------
# CURRICULUM / GRADE STRUCTURE
# ---------------------------------------------------------------------------
class GradeLevelViewSet(viewsets.ModelViewSet):
    queryset = models.GradeLevel.objects.all()
    serializer_class = serializers.GradeLevelSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    filterset_fields = ["curriculum_type", "education_level"]
    filter_backends = [DjangoFilterBackend]


class StreamViewSet(viewsets.ModelViewSet):
    queryset = models.Stream.objects.all()
    serializer_class = serializers.StreamSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]


class ClassRoomViewSet(viewsets.ModelViewSet):
    queryset = models.ClassRoom.objects.select_related("grade_level", "stream", "academic_year").all()
    serializer_class = serializers.ClassRoomSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    filterset_fields = ["grade_level", "academic_year", "stream"]
    filter_backends = [DjangoFilterBackend]


# ---------------------------------------------------------------------------
# STUDENTS / GUARDIANS / ENROLLMENT
# ---------------------------------------------------------------------------
class StudentProfileViewSet(viewsets.ModelViewSet):
    queryset = models.StudentProfile.objects.select_related("user").all()
    serializer_class = serializers.StudentProfileSerializer
    permission_classes = [utils.IsAdminOrTeacher]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["curriculum_type", "is_active", "gender"]
    search_fields = ["admission_no", "user__first_name", "user__last_name"]

    def get_queryset(self):
        user = self.request.user
        if user.role == models.User.Role.STUDENT:
            return self.queryset.filter(user=user)
        if user.role == models.User.Role.PARENT:
            return self.queryset.filter(guardians__user=user)
        return self.queryset

    def get_permissions(self):
        if self.request.user and self.request.user.role in (models.User.Role.STUDENT, models.User.Role.PARENT):
            return [IsAuthenticated()]
        return super().get_permissions()


class AdmitStudentView(generics.CreateAPIView):
    """POST here to enroll a brand new student (creates login + admission_no + first Enrollment)."""

    serializer_class = serializers.StudentEnrollSerializer
    permission_classes = [utils.IsAdmin]


class ParentGuardianProfileViewSet(viewsets.ModelViewSet):
    queryset = models.ParentGuardianProfile.objects.select_related("user").all()
    serializer_class = serializers.ParentGuardianProfileSerializer
    permission_classes = [utils.IsAdmin]


class ParentStudentLinkViewSet(viewsets.ModelViewSet):
    queryset = models.ParentStudentLink.objects.all()
    serializer_class = serializers.ParentStudentLinkSerializer
    permission_classes = [utils.IsAdmin]


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = models.Enrollment.objects.select_related("student__user", "classroom").all()
    serializer_class = serializers.EnrollmentSerializer
    permission_classes = [utils.IsAdminOrTeacher]
    filterset_fields = ["classroom", "academic_year", "status", "student"]
    filter_backends = [DjangoFilterBackend]

    def get_queryset(self):
        user = self.request.user
        if user.role == models.User.Role.STUDENT:
            return self.queryset.filter(student__user=user)
        if user.role == models.User.Role.PARENT:
            return self.queryset.filter(student__guardians__user=user)
        return self.queryset

    def get_permissions(self):
        if self.request.user and self.request.user.role in (models.User.Role.STUDENT, models.User.Role.PARENT):
            return [IsAuthenticated()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], permission_classes=[utils.IsAdmin])
    def promote(self, request, pk=None):
        enrollment = self.get_object()
        serializer = serializers.PromoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            new_enrollment = services.promote_student(
                enrollment,
                serializer.validated_data["target_classroom_id"],
                force=serializer.validated_data["force"],
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(serializers.EnrollmentSerializer(new_enrollment).data, status=201)

    @action(detail=False, methods=["post"], permission_classes=[utils.IsAdmin])
    def bulk_promote(self, request):
        serializer = serializers.BulkPromoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.bulk_promote_classroom(
            serializer.validated_data["source_classroom_id"],
            serializer.validated_data["target_classroom_id"],
            force=serializer.validated_data["force"],
        )
        return Response(result)


# ---------------------------------------------------------------------------
# SUBJECTS
# ---------------------------------------------------------------------------
class SubjectViewSet(viewsets.ModelViewSet):
    queryset = models.Subject.objects.prefetch_related("papers").all()
    serializer_class = serializers.SubjectSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    filterset_fields = ["curriculum_type", "has_papers"]
    filter_backends = [DjangoFilterBackend]


class SubjectPaperViewSet(viewsets.ModelViewSet):
    queryset = models.SubjectPaper.objects.all()
    serializer_class = serializers.SubjectPaperSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]


class GradeSubjectViewSet(viewsets.ModelViewSet):
    queryset = models.GradeSubject.objects.select_related("subject", "grade_level").all()
    serializer_class = serializers.GradeSubjectSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    filterset_fields = ["grade_level", "is_compulsory"]
    filter_backends = [DjangoFilterBackend]


class SubjectSelectionRuleViewSet(viewsets.ModelViewSet):
    queryset = models.SubjectSelectionRule.objects.all()
    serializer_class = serializers.SubjectSelectionRuleSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]


class StudentSubjectSelectionView(APIView):
    """GET current selections / POST to (re)set them for one enrollment."""

    permission_classes = [IsAuthenticated]

    def get(self, request, enrollment_id):
        selections = models.StudentSubjectSelection.objects.filter(enrollment_id=enrollment_id)
        return Response(serializers.StudentSubjectSelectionSerializer(selections, many=True).data)

    def post(self, request, enrollment_id):
        enrollment = generics.get_object_or_404(models.Enrollment, pk=enrollment_id)
        serializer = serializers.SetStudentSubjectsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            subjects = services.set_student_subjects(enrollment, serializer.validated_data["subject_ids"])
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(serializers.SubjectSerializer(subjects, many=True).data)


# ---------------------------------------------------------------------------
# TEACHER ALLOCATION
# ---------------------------------------------------------------------------
class TeacherSubjectAllocationViewSet(viewsets.ModelViewSet):
    queryset = models.TeacherSubjectAllocation.objects.select_related("teacher", "subject", "classroom").all()
    serializer_class = serializers.TeacherSubjectAllocationSerializer
    permission_classes = [utils.IsAdmin]
    filterset_fields = ["teacher", "classroom", "academic_year", "subject"]
    filter_backends = [DjangoFilterBackend]


class MyAllocationsView(APIView):
    """Teacher portal: 'what am I teaching this year?'"""

    permission_classes = [utils.IsTeacher]

    def get(self, request):
        allocations = utils.teacher_allocated_classrooms(request.user)
        return Response(serializers.TeacherSubjectAllocationSerializer(allocations, many=True).data)


# ---------------------------------------------------------------------------
# EXAMS / RESULTS
# ---------------------------------------------------------------------------
class ExamTypeViewSet(viewsets.ModelViewSet):
    queryset = models.ExamType.objects.all()
    serializer_class = serializers.ExamTypeSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]


class ExamViewSet(viewsets.ModelViewSet):
    queryset = models.Exam.objects.select_related("term", "exam_type", "grade_level").all()
    serializer_class = serializers.ExamSerializer
    permission_classes = [utils.IsAdminOrTeacher]
    filterset_fields = ["term", "exam_type", "grade_level", "is_published"]
    filter_backends = [DjangoFilterBackend]


class ExamResultViewSet(viewsets.ModelViewSet):
    """
    Teachers enter marks here from their own portal, scoped to what they
    are allocated. Admin sees/edits everything.
    """

    queryset = models.ExamResult.objects.select_related(
        "exam", "enrollment__student__user", "subject", "paper"
    ).all()
    serializer_class = serializers.ExamResultSerializer
    permission_classes = [utils.IsAdminOrTeacher]
    filterset_fields = ["exam", "subject", "enrollment", "enrollment__classroom"]
    filter_backends = [DjangoFilterBackend]

    def get_queryset(self):
        user = self.request.user
        if user.role == models.User.Role.TEACHER:
            allocated_classrooms = utils.teacher_allocated_classrooms(user).values_list("classroom_id", flat=True)
            allocated_subjects = utils.teacher_allocated_classrooms(user).values_list("subject_id", flat=True)
            return self.queryset.filter(
                enrollment__classroom_id__in=allocated_classrooms, subject_id__in=allocated_subjects
            )
        return self.queryset

    def perform_create(self, serializer):
        serializer.save(entered_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(entered_by=self.request.user)

    @action(detail=False, methods=["post"])
    def bulk_entry(self, request):
        """
        Teacher submits a whole mark sheet at once for their (subject, exam):
        { exam_id, subject_id, paper_id, max_marks, rows: [{enrollment_id, marks_obtained, is_absent}] }
        """
        serializer = serializers.BulkExamResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        exam = generics.get_object_or_404(models.Exam, pk=data["exam_id"])
        subject = generics.get_object_or_404(models.Subject, pk=data["subject_id"])
        classroom = generics.get_object_or_404(
            models.ClassRoom, grade_level=exam.grade_level, academic_year=exam.term.academic_year
        ) if False else None  # classroom is derived per-row from the enrollment instead

        user = request.user
        if user.role == models.User.Role.TEACHER:
            allocated = utils.teacher_allocated_classrooms(user).filter(subject=subject)
            allocated_classroom_ids = set(allocated.values_list("classroom_id", flat=True))
        else:
            allocated_classroom_ids = None  # admin: no restriction

        created_or_updated = []
        errors = []
        with transaction.atomic():
            for row in data["rows"]:
                enrollment = models.Enrollment.objects.filter(pk=row["enrollment_id"]).select_related("classroom").first()
                if not enrollment:
                    errors.append({"enrollment_id": row["enrollment_id"], "error": "Enrollment not found"})
                    continue
                if allocated_classroom_ids is not None and enrollment.classroom_id not in allocated_classroom_ids:
                    errors.append({"enrollment_id": row["enrollment_id"], "error": "Not allocated to this class"})
                    continue
                obj, _ = models.ExamResult.objects.update_or_create(
                    exam=exam, enrollment=enrollment, subject=subject, paper_id=data.get("paper_id"),
                    defaults={
                        "marks_obtained": row.get("marks_obtained"),
                        "max_marks": data["max_marks"],
                        "is_absent": row.get("is_absent", False),
                        "entered_by": user,
                    },
                )
                created_or_updated.append(obj.id)
        return Response({"saved": created_or_updated, "errors": errors}, status=200 if not errors else 207)


class GradingScaleViewSet(viewsets.ModelViewSet):
    queryset = models.GradingScale.objects.all()
    serializer_class = serializers.GradingScaleSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    filterset_fields = ["curriculum_type", "subject"]
    filter_backends = [DjangoFilterBackend]


class TermPositionRankingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = models.TermPositionRanking.objects.select_related("enrollment__student__user", "term").all()
    serializer_class = serializers.TermPositionRankingSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["term", "checkpoint", "enrollment__classroom"]
    filter_backends = [DjangoFilterBackend]

    def get_queryset(self):
        user = self.request.user
        if user.role == models.User.Role.STUDENT:
            return self.queryset.filter(enrollment__student__user=user)
        if user.role == models.User.Role.PARENT:
            return self.queryset.filter(enrollment__student__guardians__user=user)
        return self.queryset


class RankView(APIView):
    """Trigger (re)computation of positions. Admin/teacher (e.g. class teacher) only."""

    permission_classes = [utils.IsAdminOrTeacher]

    def post(self, request):
        serializer = serializers.RankRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        term = generics.get_object_or_404(models.Term, pk=serializer.validated_data["term_id"])
        checkpoint = serializer.validated_data["checkpoint"]

        if serializer.validated_data.get("grade_level_id"):
            grade_level = generics.get_object_or_404(models.GradeLevel, pk=serializer.validated_data["grade_level_id"])
            scored = services.rank_grade(term, grade_level, checkpoint)
        elif serializer.validated_data.get("classroom_id"):
            classroom = generics.get_object_or_404(models.ClassRoom, pk=serializer.validated_data["classroom_id"])
            scored = services.rank_classroom(term, classroom, checkpoint)
        else:
            return Response({"detail": "Provide classroom_id or grade_level_id."}, status=400)

        return Response({"ranked_count": len(scored)})


# ---------------------------------------------------------------------------
# PROMOTION RULES
# ---------------------------------------------------------------------------
class PromotionRuleViewSet(viewsets.ModelViewSet):
    queryset = models.PromotionRule.objects.all()
    serializer_class = serializers.PromotionRuleSerializer
    permission_classes = [utils.IsAdmin]


# ---------------------------------------------------------------------------
# FEES
# ---------------------------------------------------------------------------
class FeeStructureViewSet(viewsets.ModelViewSet):
    queryset = models.FeeStructure.objects.select_related("grade_level", "term").prefetch_related("items").all()
    serializer_class = serializers.FeeStructureSerializer
    permission_classes = [utils.IsAdminOrFinance]
    filterset_fields = ["grade_level", "term"]
    filter_backends = [DjangoFilterBackend]


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = models.Invoice.objects.select_related("enrollment__student__user", "fee_structure").all()
    serializer_class = serializers.InvoiceSerializer
    permission_classes = [utils.IsAdminOrFinance]
    filterset_fields = ["enrollment", "fee_structure"]
    filter_backends = [DjangoFilterBackend]

    def get_queryset(self):
        user = self.request.user
        if user.role == models.User.Role.STUDENT:
            return self.queryset.filter(enrollment__student__user=user)
        if user.role == models.User.Role.PARENT:
            return self.queryset.filter(enrollment__student__guardians__user=user)
        return self.queryset

    def get_permissions(self):
        if self.request.user and self.request.user.role in (models.User.Role.STUDENT, models.User.Role.PARENT):
            return [IsAuthenticated()]
        return super().get_permissions()

    @action(detail=False, methods=["post"], permission_classes=[utils.IsAdminOrFinance])
    def generate(self, request):
        enrollment = generics.get_object_or_404(models.Enrollment, pk=request.data.get("enrollment_id"))
        term = generics.get_object_or_404(models.Term, pk=request.data.get("term_id"))
        try:
            invoice = services.generate_invoice(enrollment, term)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(serializers.InvoiceSerializer(invoice).data, status=201)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = models.Payment.objects.select_related("invoice").all()
    serializer_class = serializers.PaymentSerializer
    permission_classes = [utils.IsAdminOrFinance]
    filterset_fields = ["invoice", "method"]
    filter_backends = [DjangoFilterBackend]

    def create(self, request, *args, **kwargs):
        invoice = generics.get_object_or_404(models.Invoice, pk=request.data.get("invoice"))
        payment = services.record_payment(
            invoice=invoice,
            amount=Decimal(str(request.data.get("amount"))),
            method=request.data.get("method"),
            reference=request.data.get("reference", ""),
            recorded_by=request.user,
        )
        return Response(serializers.PaymentSerializer(payment).data, status=201)



def _months_back(n):
    """Return the first-of-month date for each of the last n months, oldest first."""
    today = date.today()
    months = []
    for i in range(n - 1, -1, -1):
        y, m = today.year, today.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append(date(y, m, 1))
    return months


class DashboardStatsView(APIView):
    """
    Aggregated numbers for the admin dashboard landing page:
    stat cards, 12-month revenue trend, class population for the current
    year, gender split, 5-year admission trend, and a recent-students table.
    """

    permission_classes = [utils.IsAdmin]

    def get(self, request):
        current_year = models.AcademicYear.objects.filter(is_current=True).first()

        active_enrollments = (
            models.Enrollment.objects.filter(
                academic_year=current_year, status=models.Enrollment.Status.ACTIVE
            )
            if current_year
            else models.Enrollment.objects.none()
        )

        # ---- 5 stat cards ---------------------------------------------
        total_students = active_enrollments.count()
        total_classes = (
            models.ClassRoom.objects.filter(academic_year=current_year).count() if current_year else 0
        )
        total_teachers = models.User.objects.filter(
            role=models.User.Role.TEACHER, is_active_staff=True
        ).count()

        revenue_this_year = models.Payment.objects.filter(
            invoice__enrollment__academic_year=current_year
        ).aggregate(total=Sum("amount"))["total"] or 0

        fee_totals = models.Invoice.objects.filter(enrollment__academic_year=current_year).aggregate(
            due=Sum("amount_due"), paid=Sum("amount_paid")
        )
        outstanding_balance = (fee_totals["due"] or 0) - (fee_totals["paid"] or 0)

        stat_cards = {
            "total_students": total_students,
            "total_classes": total_classes,
            "total_teachers": total_teachers,
            "revenue_this_year": float(revenue_this_year),
            "outstanding_balance": float(outstanding_balance),
        }

        # ---- revenue trend, last 12 months ------------------------------
        month_starts = _months_back(12)
        raw_revenue = (
            models.Payment.objects.filter(paid_at__date__gte=month_starts[0])
            .annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(total=Sum("amount"))
        )
        revenue_by_month = {r["month"].strftime("%Y-%m"): float(r["total"]) for r in raw_revenue}
        revenue_trend = [
            {
                "month": d.strftime("%Y-%m"),
                "label": d.strftime("%b %Y"),
                "revenue": revenue_by_month.get(d.strftime("%Y-%m"), 0),
            }
            for d in month_starts
        ]

        # ---- class population, current academic year --------------------
        raw_class_pop = (
            active_enrollments.values("classroom__grade_level__name", "classroom__stream__name")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        class_population = [
            {
                "classroom": f'{c["classroom__grade_level__name"]} {c["classroom__stream__name"]}',
                "count": c["count"],
            }
            for c in raw_class_pop
        ]

        # ---- gender population, current academic year --------------------
        raw_gender = active_enrollments.values("student__gender").annotate(count=Count("id"))
        gender_population = {"male": 0, "female": 0}
        for g in raw_gender:
            key = "male" if g["student__gender"] == models.StudentProfile.Gender.MALE else "female"
            gender_population[key] = g["count"]

        # ---- admission trend, last 5 years --------------------------------
        this_calendar_year = date.today().year
        raw_admissions = (
            models.StudentProfile.objects.filter(date_admitted__year__gte=this_calendar_year - 4)
            .annotate(year=TruncYear("date_admitted"))
            .values("year")
            .annotate(count=Count("id"))
        )
        admissions_by_year = {r["year"].year: r["count"] for r in raw_admissions}
        admission_trend = [
            {"year": y, "count": admissions_by_year.get(y, 0)}
            for y in range(this_calendar_year - 4, this_calendar_year + 1)
        ]

        # ---- recent students summary table --------------------------------
        recent = models.StudentProfile.objects.select_related("user").order_by("-date_admitted")[:10]
        recent_students = []
        for s in recent:
            enr = s.current_enrollment
            recent_students.append(
                {
                    "id": s.id,
                    "admission_no": s.admission_no,
                    "name": s.user.get_full_name(),
                    "gender": s.get_gender_display(),
                    "classroom": str(enr.classroom) if enr else "-",
                    "status": enr.status if enr else "-",
                    "date_admitted": s.date_admitted,
                }
            )

        return Response(
            {
                "stat_cards": stat_cards,
                "revenue_trend": revenue_trend,
                "class_population": class_population,
                "gender_population": gender_population,
                "admission_trend": admission_trend,
                "recent_students": recent_students,
            }
        )