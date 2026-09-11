from decimal import Decimal
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Sum, Q, F, FloatField, ExpressionWrapper
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
from django.conf import settings
from django.utils import timezone

from . import models, serializers, services, utils


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
from rest_framework.throttling import ScopedRateThrottle
from django.contrib.auth import authenticate


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = serializers.LoginRequestSerializer(data=request.data)
        if not serializer.is_valid():
            # malformed/oversized username never even reaches authenticate()
            return Response({"detail": "Invalid credentials."}, status=401)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        ip = utils.get_client_ip(request)

        user = models.User.objects.filter(username=username).first()

        if user and user.requires_2fa and user.is_locked and not settings.DEBUG:
            models.LoginAttemptLog.objects.create(
                username_attempted=username, user=user, ip_address=ip,
                result=models.LoginAttemptLog.Result.ACCOUNT_LOCKED,
            )
            return Response(
                {"detail": "This account is locked due to multiple failed attempts. Contact your administrator."},
                status=423,
            )

        authed = authenticate(request, username=username, password=password)

        if not authed:
            if user:
                services.register_failed_login(
                    user, ip,
                    models.LoginAttemptLog.Result.BAD_PASSWORD,
                )
            else:
                models.LoginAttemptLog.objects.create(
                    username_attempted=username, ip_address=ip,
                    result=models.LoginAttemptLog.Result.UNKNOWN_USER,
                )
            return Response({"detail": "Invalid credentials."}, status=401)

        services.reset_failed_logins(authed)

        if authed.requires_2fa and not settings.DEBUG:
            services.generate_and_send_otp(authed)
            return Response(
                {
                    "otp_required": True,
                    "challenge_token": services.make_challenge_token(authed),
                    "masked_contact": utils.mask_contact(authed),
                },
                status=200,
            )

        # Students/Parents, or DEBUG bypass for staff during development
        models.LoginAttemptLog.objects.create(
            username_attempted=username, user=authed, ip_address=ip,
            result=models.LoginAttemptLog.Result.SUCCESS,
        )
        return Response(services.issue_tokens_for_user(authed))


class VerifyOtpView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        serializer = serializers.VerifyOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = services.read_challenge_token(serializer.validated_data["challenge_token"])
        if not user_id:
            return Response({"detail": "Login session expired. Please log in again."}, status=400)

        user = generics.get_object_or_404(models.User, pk=user_id)
        ip = utils.get_client_ip(request)

        if user.is_locked:
            return Response({"detail": "This account is locked. Contact your administrator."}, status=423)

        if not services.verify_otp(user, serializer.validated_data["otp_code"], ip):
            if user.is_locked:
                return Response({"detail": "Too many failed attempts. Account locked."}, status=423)
            return Response({"detail": "Invalid or expired code."}, status=401)

        services.reset_failed_logins(user)
        return Response(services.issue_tokens_for_user(user))
    
    
class ForgotPasswordRequestView(APIView):
    """Students only. Admin/Teacher/Finance/Parent accounts must be reset by an Admin."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "forgot_password"

    def post(self, request):
        serializer = serializers.ForgotPasswordRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admission_no = serializer.validated_data["admission_no"]

        student = models.StudentProfile.objects.filter(admission_no=admission_no).select_related("user").first()
        # Always return the same generic message, whether or not the
        # admission number exists, so this endpoint can't be used to
        # enumerate valid students.
        if student:
            token = services.generate_password_reset_token(student.user)
            services.send_password_reset_link(student.user, token)

        return Response({
            "detail": "If that admission number is registered, reset instructions have been sent "
                      "to the contact on file."
        })


class ResetPasswordConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = serializers.ResetPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = models.User.objects.filter(
            password_reset_token=serializer.validated_data["token"],
            role=models.User.Role.STUDENT,
        ).first()

        if not user or not user.password_reset_expires_at or user.password_reset_expires_at < timezone.now():
            return Response({"detail": "This reset link is invalid or has expired."}, status=400)

        user.set_password(serializer.validated_data["new_password"])
        user.password_reset_token = None
        user.password_reset_expires_at = None
        user.save(update_fields=["password", "password_reset_token", "password_reset_expires_at"])
        return Response({"detail": "Password reset. You can now log in."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        return Response(serializers.UserSerializer(request.user).data)
 
 
class ProfileView(APIView):
    """
    Unified 'my profile' endpoint for every role.
    GET  -> full profile (incl. nested student_profile if applicable)
    PATCH -> self-service edit of non-critical fields only (see
             ProfileUpdateSerializer / services.update_profile).
    """
 
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        return Response(serializers.ProfileSerializer(request.user).data)
 
    def patch(self, request):
        serializer = serializers.ProfileUpdateSerializer(
            data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = services.update_profile(request.user, serializer.validated_data)
        user.refresh_from_db()
        return Response(serializers.ProfileSerializer(user).data)
 
 
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
class UserPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500


class UserViewSet(viewsets.ModelViewSet):
    queryset = models.User.objects.all().order_by("first_name")
    permission_classes = [utils.IsAdmin]
    pagination_class = UserPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["role"]
    search_fields = ["first_name", "last_name", "username", "email", "phone_number"]

    def get_serializer_class(self):
        return serializers.UserCreateSerializer if self.action == "create" else serializers.UserSerializer
    
    @action(detail=True, methods=["post"], permission_classes=[utils.IsAdminOnly])
    def unlock(self, request, pk=None):
        user = self.get_object()
        services.unlock_user(user)
        return Response({"detail": f"{user.username} has been unlocked."})

    @action(detail=False, methods=["get"], permission_classes=[utils.IsAdminOnly])
    def locked(self, request):
        locked = self.get_queryset().filter(locked_until__gt=timezone.now())
        return Response(serializers.LockedUserSerializer(locked, many=True).data)


class LoginAttemptPagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 200


class LoginAttemptLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin-only audit trail: every login/OTP attempt, success or failure."""

    queryset = models.LoginAttemptLog.objects.select_related("user").all()
    serializer_class = serializers.LoginAttemptLogSerializer
    permission_classes = [utils.IsAdminOnly]
    pagination_class = LoginAttemptPagination
    filterset_fields = ["result", "user"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ["username_attempted", "ip_address"]

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Quick counts for the security dashboard's stat cards."""
        last_24h = timezone.now() - timezone.timedelta(hours=24)
        recent = self.queryset.filter(created_at__gte=last_24h)
        return Response({
            "failed_last_24h": recent.filter(
                result__in=[
                    models.LoginAttemptLog.Result.BAD_PASSWORD,
                    models.LoginAttemptLog.Result.UNKNOWN_USER,
                    models.LoginAttemptLog.Result.OTP_FAILED,
                ]
            ).count(),
            "locked_accounts": models.User.objects.filter(locked_until__gt=timezone.now()).count(),
            "successful_last_24h": recent.filter(
                result__in=[models.LoginAttemptLog.Result.SUCCESS, models.LoginAttemptLog.Result.OTP_SUCCESS]
            ).count(),
        })
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


class ClassRoomPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 200


class ClassRoomViewSet(viewsets.ModelViewSet):
    queryset = (
        models.ClassRoom.objects.select_related("grade_level", "stream", "academic_year", "class_teacher")
        .all()
        .order_by("-academic_year__year", "grade_level__level_order", "stream__name")
    )
    serializer_class = serializers.ClassRoomSerializer
    permission_classes = [utils.ReadOnlyOrAdmin]
    pagination_class = ClassRoomPagination
    filterset_fields = ["grade_level", "academic_year", "stream", "class_teacher"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ["grade_level__name", "stream__name", "class_teacher__first_name", "class_teacher__last_name"]

    def destroy(self, request, *args, **kwargs):
        """
        Blocks deleting a classroom that still has active students in it -
        deleting would cascade and wipe their Enrollment (and everything
        FK'd to it: results, invoices) rather than just removing an empty
        classroom shell.
        """
        instance = self.get_object()
        if instance.enrollments.filter(status=models.Enrollment.Status.ACTIVE).exists():
            return Response(
                {"detail": "Cannot delete a classroom with active students enrolled. Move or promote them first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
    
    
    @action(detail=True, methods=["get"], url_path="students")
    def students(self, request, pk=None):
        """Full roster (with parent/guardian contacts) for this classroom's active students."""
        classroom = self.get_object()
        enrollments = (
            classroom.enrollments.filter(status=models.Enrollment.Status.ACTIVE)
            .select_related("student__user")
            .order_by("student__user__first_name")
        )
        students = [e.student for e in enrollments]
        return Response(serializers.ClassroomStudentSerializer(students, many=True).data)

    @action(detail=False, methods=["post"], url_path="bulk_create")
    def bulk_create(self, request):
        serializer = serializers.BulkCreateClassroomsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(
            {
                "created_count": len(result["created"]),
                "skipped_count": len(result["skipped"]),
                "created": serializers.ClassRoomSerializer(result["created"], many=True).data,
            },
            status=status.HTTP_201_CREATED,
            
            
        )

# ---------------------------------------------------------------------------
# STUDENTS / GUARDIANS / ENROLLMENT
# ---------------------------------------------------------------------------
class StudentPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500

class StudentProfileViewSet(viewsets.ModelViewSet):
    queryset = models.StudentProfile.objects.select_related("user").order_by("-user__date_joined")
    permission_classes = [utils.IsAdminOrTeacher]
    pagination_class = StudentPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["curriculum_type", "is_active", "gender"]
    search_fields = ["admission_no", "user__first_name", "user__last_name"]

    def get_serializer_class(self):
        # View/Edit modals need the nested user account; the list view
        # keeps using the lighter StudentProfileSerializer.
        if self.action in ("retrieve", "update", "partial_update"):
            return serializers.StudentProfileDetailSerializer
        return serializers.StudentProfileSerializer

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
        if self.action in ("destroy", "reset_password"):
            return [utils.IsAdmin()]
        return super().get_permissions()

    def perform_destroy(self, instance):
        # StudentProfile.user is OneToOneField(on_delete=CASCADE), so
        # deleting the User cascades down to the profile — this removes
        # both the login and the profile in one go instead of leaving an
        # orphaned, still-loginable User behind.
        instance.user.delete()

    @action(detail=True, methods=["post"])
    def reset_password(self, request, pk=None):
        student = self.get_object()
        serializer = serializers.ResetStudentPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = services.reset_student_password(
            student, serializer.validated_data.get("new_password") or None
        )
        return Response({"detail": "Password reset successfully.", "new_password": new_password})


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
    filterset_fields = ["term", "exam_type", "grade_level", "is_published"]
    filter_backends = [DjangoFilterBackend]

class ExamResultPagination(PageNumberPagination):
    page_size = 200
    page_size_query_param = "page_size"
    max_page_size = 1000
    
class ExamResultViewSet(viewsets.ModelViewSet):
    """
    Teachers enter marks here from their own portal, scoped to what they
    are allocated. Admin sees/edits everything.
    """

    queryset = models.ExamResult.objects.select_related(
        "exam", "enrollment__student__user", "subject", "paper"
    ).all()
    serializer_class = serializers.ExamResultSerializer
    filterset_fields = ["exam", "subject", "enrollment", "enrollment__classroom"]
    filter_backends = [DjangoFilterBackend]
    pagination_class = ExamResultPagination

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
    queryset = models.FeeStructure.objects.select_related("grade_level", "term__academic_year").prefetch_related("items").all()
    serializer_class = serializers.FeeStructureSerializer
    permission_classes = [utils.IsAdminOrFinance]
    filterset_fields = ["grade_level", "term", "term__academic_year"]
    filter_backends = [DjangoFilterBackend]


# ===========================================================================
# REPLACE the existing InvoiceViewSet in views.py with this version.
# Adds: pagination (invoices can now number in the thousands since the
# engine generates them automatically), filtering by academic year, and
# search by admission no / student name. The role-based scoping and the
# generate action are unchanged from what you already have.
# ===========================================================================
class InvoicePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 1000


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = models.Invoice.objects.select_related(
        "enrollment__student__user",
        "enrollment__classroom__grade_level",
        "enrollment__classroom__stream",
        "enrollment__academic_year",
        "fee_structure__term",
    ).order_by("-issued_at")
    serializer_class = serializers.InvoiceSerializer
    permission_classes = [utils.IsAdminOrFinance]
    pagination_class = InvoicePagination
    filterset_fields = ["enrollment", "fee_structure", "enrollment__academic_year"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = [
        "enrollment__student__admission_no",
        "enrollment__student__user__first_name",
        "enrollment__student__user__last_name",
    ]

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

# ===========================================================================
# REPLACE the existing PaymentViewSet in views.py with this version.
# Adds: filtering by academic year / grade level / stream / term / method,
# search by admission no or student name, and a much larger max_page_size
# so the frontend can request everything matching the current filters in
# one call for the Excel export (normal browsing still defaults to 25/page).
# ===========================================================================
class PaymentPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 5000  # lets the "download Excel" button pull a full filtered set in one request


class PaymentViewSet(viewsets.ModelViewSet):
    """Direct/manual payment recording, used by Finance for cash/bank/cheque. Students/parents use InitiatePaymentView instead."""

    queryset = models.Payment.objects.select_related(
        "invoice__enrollment__student__user",
        "invoice__enrollment__classroom__grade_level",
        "invoice__enrollment__classroom__stream",
        "invoice__enrollment__academic_year",
        "invoice__fee_structure__term",
        "recorded_by",
    ).order_by("-paid_at")
    permission_classes = [utils.IsAdminOrFinance]
    pagination_class = PaymentPagination
    filterset_fields = [
        "method",
        "invoice__enrollment__academic_year",
        "invoice__enrollment__classroom__grade_level",
        "invoice__enrollment__classroom__stream",
        "invoice__fee_structure__term",
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = [
        "invoice__enrollment__student__admission_no",
        "invoice__enrollment__student__user__first_name",
        "invoice__enrollment__student__user__last_name",
    ]

    def get_serializer_class(self):
        if self.action == "list":
            return serializers.PaymentListSerializer
        return serializers.PaymentSerializer

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
 
# ---------------------------------------------------------------------------
# STUDENT/PARENT SELF-SERVICE FEE PAYMENT (STK push, with DEBUG bypass)
# ---------------------------------------------------------------------------
def _can_access_invoice(user, invoice):
    if user.role in (models.User.Role.ADMIN, models.User.Role.FINANCE):
        return True
    student = invoice.enrollment.student
    if user.role == models.User.Role.STUDENT:
        return student.user_id == user.id
    if user.role == models.User.Role.PARENT:
        return models.ParentStudentLink.objects.filter(parent__user=user, student=student).exists()
    return False
 
 
class InitiatePaymentView(APIView):
    """
    POST { invoice_id, phone_number, amount }
    Partial payments are fine - amount does not need to equal the balance.
    Overpaying is also fine; the surplus becomes a credit that automatically
    reduces the student's NEXT term invoice (see services.generate_invoice).
    """
 
    permission_classes = [IsAuthenticated]
 
    def post(self, request):
        serializer = serializers.InitiatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = generics.get_object_or_404(models.Invoice, pk=serializer.validated_data["invoice_id"])
 
        if not _can_access_invoice(request.user, invoice):
            return Response({"detail": "You cannot pay this invoice."}, status=403)
 
        try:
            result = services.initiate_payment(
                invoice,
                serializer.validated_data["phone_number"],
                serializer.validated_data["amount"],
                initiated_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
 
        if result["status"] == "COMPLETED":
            payment = result["payment"]
            invoice.refresh_from_db()
            return Response(
                {
                    "status": "COMPLETED",
                    "payment": serializers.PaymentSerializer(payment).data,
                    "invoice": serializers.InvoiceSerializer(invoice).data,
                },
                status=201,
            )
 
        return Response(
            {"status": "PENDING", "checkout_request_id": result["stk_request"].checkout_request_id},
            status=202,
        )
 
 
class PaymentStatusView(APIView):
    """Frontend polls this while an STK push is PENDING (production mode only)."""
 
    permission_classes = [IsAuthenticated]
 
    def get(self, request, checkout_request_id):
        stk_request = generics.get_object_or_404(
            models.MpesaSTKPushRequest, checkout_request_id=checkout_request_id
        )
        if not _can_access_invoice(request.user, stk_request.invoice):
            return Response({"detail": "Not your payment."}, status=403)
 
        payment = None
        if stk_request.status == models.MpesaSTKPushRequest.Status.COMPLETED:
            payment = models.Payment.objects.filter(
                invoice=stk_request.invoice, method=models.Payment.Method.MPESA
            ).order_by("-paid_at").first()
 
        return Response(
            {
                "status": stk_request.status,
                "result_description": stk_request.result_description,
                "payment": serializers.PaymentSerializer(payment).data if payment else None,
            }
        )
 
 
class MpesaCallbackView(APIView):
    """Webhook Safaricom calls once the customer completes (or cancels) the STK push. Not used while DEBUG=True."""
 
    permission_classes = [AllowAny]
    authentication_classes = []
 
    def post(self, request):
        services.handle_mpesa_callback(request.data)
        # Safaricom just needs a 200 + this exact shape to stop retrying.
        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})
 
 
class ReceiptView(APIView):
    """GET a printable receipt (with QR code) for one payment. Only the payer, their parent, or staff can view it."""
 
    permission_classes = [IsAuthenticated]
 
    def get(self, request, payment_id):
        payment = generics.get_object_or_404(models.Payment, pk=payment_id)
        if not _can_access_invoice(request.user, payment.invoice):
            return Response({"detail": "Not your receipt."}, status=403)
 
        student = payment.invoice.enrollment.student
        data = {
            "receipt_no": payment.receipt_no,
            "amount": payment.amount,
            "method": payment.method,
            "reference": payment.reference,
            "paid_at": payment.paid_at,
            "student_name": student.user.get_full_name(),
            "admission_no": student.admission_no,
            "term": str(payment.invoice.fee_structure.term),
            "qr_code_base64": services.generate_receipt_qr_base64(payment),
        }
        return Response(serializers.ReceiptSerializer(data).data)
 
 
class VerifyReceiptView(APIView):
    """Public endpoint the QR code links to - anyone can confirm a printed receipt is genuine without logging in."""
 
    permission_classes = [AllowAny]
 
    def get(self, request, receipt_no):
        payment = models.Payment.objects.filter(receipt_no=receipt_no).select_related(
            "invoice__enrollment__student__user", "invoice__fee_structure__term"
        ).first()
        if not payment:
            return Response({"valid": False, "detail": "No receipt found with this number."}, status=404)
 
        student = payment.invoice.enrollment.student
        return Response(
            {
                "valid": True,
                "receipt_no": payment.receipt_no,
                "amount": payment.amount,
                "method": payment.method,
                "paid_at": payment.paid_at,
                "student_name": student.user.get_full_name(),
                "admission_no": student.admission_no,
                "term": str(payment.invoice.fee_structure.term),
            }
        )
 


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


def _months_in_range(start_date, end_date):
    """
    Return the first-of-month date for every month from start_date to
    end_date inclusive, oldest first. Mirrors _months_back but bounded by
    an explicit date range instead of 'last N months from today' - used
    by the finance reports below, one range per academic year, so each
    tab shows that year's months (not always the trailing 12 from today).
    """
    months = []
    y, m = start_date.year, start_date.month
    while (y, m) <= (end_date.year, end_date.month):
        months.append(date(y, m, 1))
        m += 1
        if m > 12:
            m = 1
            y += 1
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
        
        

# add to imports at top
from django.db.models import Avg, F
from django.db.models import Avg, F, FloatField, ExpressionWrapper

class ReportsOverviewView(APIView):
    """
    Aggregated data behind the admin Reports & Analytics page:
    fee collection by grade, curriculum split, subject performance,
    pass rates by grade, and enrollment trend across academic years.
    """
    permission_classes = [utils.IsAdmin]

    def get(self, request):
        current_year = models.AcademicYear.objects.filter(is_current=True).first()
        current_term = models.Term.objects.filter(is_current=True).first()

        # ---- fee collection rate by grade level (current year) ----
        fee_rows = (
            models.Invoice.objects.filter(enrollment__academic_year=current_year)
            .values("fee_structure__grade_level__name")
            .annotate(due=Sum("amount_due"), paid=Sum("amount_paid"))
        )
        fee_collection = [
            {
                "grade": r["fee_structure__grade_level__name"],
                "due": float(r["due"] or 0),
                "paid": float(r["paid"] or 0),
                "collection_rate": round(float(r["paid"] or 0) / float(r["due"]) * 100, 1) if r["due"] else 0,
            }
            for r in fee_rows
        ]

        # ---- curriculum split (CBC vs 8-4-4), active students ----
        curriculum_rows = (
            models.StudentProfile.objects.filter(is_active=True)
            .values("curriculum_type")
            .annotate(count=Count("id"))
        )
        curriculum_split = [
            {
                "curriculum": dict(models.CurriculumType.choices).get(r["curriculum_type"], r["curriculum_type"]),
                "count": r["count"],
            }
            for r in curriculum_rows
        ]

        # ---- average performance by subject (current term) ----
        subject_perf = (
            models.ExamResult.objects.filter(
                exam__term=current_term,
                is_absent=False,
                marks_obtained__isnull=False,
                max_marks__isnull=False,
                max_marks__gt=0,
            )
            .values("subject__name")
            .annotate(
                avg_pct=Avg(
                    ExpressionWrapper(
                        F("marks_obtained") * 100.0 / F("max_marks"),
                        output_field=FloatField(),
                    )
                )
            )
            .order_by("-avg_pct")[:12]
        )
        subject_performance = [
            {"subject": r["subject__name"], "average": round(r["avg_pct"] or 0, 1)} for r in subject_perf
        ]

        # ---- pass rate by grade level (current term) ----
        pass_rows_qs = models.ExamResult.objects.filter(
            exam__term=current_term, is_absent=False, marks_obtained__isnull=False
        ).select_related("enrollment__classroom__grade_level__promotion_rule")
        pass_data = {}
        for res in pass_rows_qs.iterator():
            grade = res.enrollment.classroom.grade_level
            rule = getattr(grade, "promotion_rule", None)
            pass_mark = float(rule.pass_mark_percentage) if rule else 30.0
            bucket = pass_data.setdefault(grade.name, {"passed": 0, "total": 0})
            bucket["total"] += 1
            if res.percentage is not None and res.percentage >= pass_mark:
                bucket["passed"] += 1
        pass_rates = [
            {"grade": g, "pass_rate": round(v["passed"] / v["total"] * 100, 1) if v["total"] else 0}
            for g, v in pass_data.items()
        ]

        # ---- enrollment trend across academic years ----
        enrollment_trend_rows = (
            models.Enrollment.objects.values("academic_year__year")
            .annotate(count=Count("id"))
            .order_by("academic_year__year")
        )
        enrollment_trend = [
            {"year": r["academic_year__year"], "count": r["count"]} for r in enrollment_trend_rows
        ]

        return Response({
            "fee_collection": fee_collection,
            "curriculum_split": curriculum_split,
            "subject_performance": subject_performance,
            "pass_rates": pass_rates,
            "enrollment_trend": enrollment_trend,
        })
        
        
     
class StudentFeeStatusView(APIView):
    """
    GET /api/v1/fees/status/
    (parents pass ?student_id=<StudentProfile id> for the child they want)

    Tells the student/parent portal whether the CURRENT term's invoice
    exists for the logged-in student's current class - or, if the
    FeeStructure for that grade/term simply hasn't been configured yet,
    returns a friendly message pointing them to ICT/Finance instead of
    just showing an empty fees page.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        student = getattr(user, "student_profile", None)

        if not student and user.role == models.User.Role.PARENT:
            student_id = request.query_params.get("student_id")
            links = models.ParentStudentLink.objects.filter(parent__user=user).select_related("student")
            link = links.filter(student_id=student_id).first() if student_id else links.first()
            student = link.student if link else None

        if not student:
            return Response({"detail": "No student profile found for this account."}, status=404)

        enrollment = student.current_enrollment
        if not enrollment:
            return Response({"detail": "No active enrollment for the current academic year."}, status=404)

        current_term = models.Term.objects.filter(is_current=True).first()
        if not current_term:
            return Response({"has_fee_structure": None, "detail": "No current term is configured."})

        grade_level = enrollment.classroom.grade_level
        fee_structure = models.FeeStructure.objects.filter(
            grade_level=grade_level, term=current_term
        ).first()

        if not fee_structure:
            return Response({
                "has_fee_structure": False,
                "grade": grade_level.name,
                "term": str(current_term),
                "message": (
                    f"Fee structure for {grade_level.name} has not been set up yet for "
                    f"{current_term}. Kindly check with the ICT/Finance office."
                ),
            })

        invoice = models.Invoice.objects.filter(
            enrollment=enrollment, fee_structure=fee_structure
        ).first()

        return Response({
            "has_fee_structure": True,
            "invoice_generated": invoice is not None,
            "grade": grade_level.name,
            "term": str(current_term),
            "invoice_id": invoice.id if invoice else None,
        })
        
        
        
from django.db.models import Avg, F, FloatField, ExpressionWrapper


class StudentPerformanceDashboardView(APIView):
    """
    GET /api/v1/students/me/performance/

    One aggregated payload for the student dashboard's charts, so the
    frontend doesn't have to make 4-5 separate calls and stitch them
    together:

      - term_trend            -> line chart: average % per exam WITHIN
                                  the current term (CAT, Midterm, Endterm...)
      - academic_year_trend   -> bar chart: average % per TERM (1, 2, 3)
                                  across the current academic year
      - subject_performance   -> pie chart: top 5 subjects by average %
                                  in the current term
      - subjects_summary      -> every subject the student is registered
                                  for this year, with their latest current
                                  -term mark if one exists, else null
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        student = getattr(user, "student_profile", None)
        if not student:
            return Response({"detail": "No student profile found for this account."}, status=404)

        enrollment = student.current_enrollment
        if not enrollment:
            return Response({"detail": "No active enrollment for the current academic year."}, status=404)

        current_year = enrollment.academic_year
        current_term = models.Term.objects.filter(is_current=True).first()

        def avg_pct_queryset(qs):
            return qs.aggregate(
                avg_pct=Avg(
                    ExpressionWrapper(
                        F("marks_obtained") * 100.0 / F("max_marks"),
                        output_field=FloatField(),
                    )
                )
            )["avg_pct"]

        base_results = models.ExamResult.objects.filter(
            enrollment=enrollment, is_absent=False, marks_obtained__isnull=False
        )

        # ---- line chart: per-exam average within the current term ----
        term_trend = []
        if current_term:
            exams = models.Exam.objects.filter(
                term=current_term, grade_level=enrollment.classroom.grade_level
            ).order_by("exam_type__order")
            for exam in exams:
                avg_pct = avg_pct_queryset(base_results.filter(exam=exam))
                if avg_pct is not None:
                    term_trend.append({"exam": exam.name, "average": round(avg_pct, 1)})

        # ---- bar chart: per-term average across the whole academic year ----
        academic_year_trend = []
        for term in models.Term.objects.filter(academic_year=current_year).order_by("term_number"):
            ranking = models.TermPositionRanking.objects.filter(
                enrollment=enrollment, term=term, checkpoint=models.TermPositionRanking.Checkpoint.ENDTERM
            ).first()
            if ranking:
                average = float(ranking.average_marks)
            else:
                average = avg_pct_queryset(base_results.filter(exam__term=term))
                average = round(average, 1) if average is not None else None
            academic_year_trend.append({"term": term.get_term_number_display(), "average": average})

        # ---- pie chart: top 5 subjects by average % in the current term ----
        subject_performance = []
        if current_term:
            rows = (
                base_results.filter(exam__term=current_term)
                .values("subject__name")
                .annotate(
                    avg_pct=Avg(
                        ExpressionWrapper(
                            F("marks_obtained") * 100.0 / F("max_marks"),
                            output_field=FloatField(),
                        )
                    )
                )
                .order_by("-avg_pct")[:5]
            )
            subject_performance = [
                {"subject": r["subject__name"], "average": round(r["avg_pct"], 1)} for r in rows
            ]

        # ---- subjects summary: every registered subject + latest current-term mark ----
        selections = models.StudentSubjectSelection.objects.filter(
            enrollment=enrollment
        ).select_related("subject")

        subjects_summary = []
        for selection in selections:
            latest_result = None
            if current_term:
                latest_result = (
                    base_results.filter(subject=selection.subject, exam__term=current_term)
                    .order_by("-exam__exam_type__order")
                    .first()
                )
            subjects_summary.append({
                "subject": selection.subject.name,
                "marks": latest_result.percentage if latest_result else None,
            })

        return Response({
            "current_class": str(enrollment.classroom),
            "current_term": str(current_term) if current_term else None,
            "term_trend": term_trend,
            "academic_year_trend": academic_year_trend,
            "subject_performance": subject_performance,
            "subjects_summary": subjects_summary,
        })
        
        
        
        
# ---------------------------------------------------------------------------
# FINANCE REPORTS (3 pages: Collections, Class Analysis, Detailed)
# Admin and Finance both get full access - same permission class you're
# already using on FeeStructureViewSet/InvoiceViewSet/PaymentViewSet.
# ---------------------------------------------------------------------------
class FinanceCollectionsReportView(APIView):
    """
    GET /api/v1/finance-reports/collections/?academic_year=<id>

    Page 1 - Collections overview:
      - stat_cards: 5 ALL-TIME totals (not scoped to the selected tab),
        since "how much have I collected since students started paying"
        is a lifetime question, not a per-year one.
      - academic_years: every AcademicYear, for the tab strip.
      - monthly_trend: revenue collected each month WITHIN the selected
        academic year's date range - this is what switching tabs changes.
    """

    permission_classes = [utils.IsAdminOrFinance]

    def get(self, request):
        academic_years = models.AcademicYear.objects.all().order_by("-year")

        academic_year_id = request.query_params.get("academic_year")
        if academic_year_id:
            academic_year = generics.get_object_or_404(models.AcademicYear, pk=academic_year_id)
        else:
            academic_year = academic_years.filter(is_current=True).first() or academic_years.first()

        # ---- 5 stat cards (all-time) ----
        total_collected = models.Payment.objects.aggregate(total=Sum("amount"))["total"] or 0

        invoice_balances = models.Invoice.objects.annotate(
            balance=ExpressionWrapper(F("amount_due") - F("amount_paid"), output_field=FloatField())
        )
        outstanding_balance = (
            invoice_balances.filter(balance__gt=0).aggregate(total=Sum("balance"))["total"] or 0
        )
        fully_paid_count = invoice_balances.filter(amount_paid__gte=F("amount_due")).count()
        partially_paid_count = invoice_balances.filter(
            amount_paid__gt=0, amount_paid__lt=F("amount_due")
        ).count()
        unpaid_count = invoice_balances.filter(amount_paid=0).count()

        stat_cards = {
            "total_collected": float(total_collected),
            "outstanding_balance": float(outstanding_balance),
            "fully_paid_invoices": fully_paid_count,
            "partially_paid_invoices": partially_paid_count,
            "unpaid_invoices": unpaid_count,
        }

        # ---- monthly trend, selected academic year only ----
        monthly_trend = []
        if academic_year:
            months = _months_in_range(academic_year.start_date, academic_year.end_date)
            raw = (
                models.Payment.objects.filter(
                    paid_at__date__gte=academic_year.start_date,
                    paid_at__date__lte=academic_year.end_date,
                )
                .annotate(month=TruncMonth("paid_at"))
                .values("month")
                .annotate(total=Sum("amount"))
            )
            revenue_by_month = {r["month"].strftime("%Y-%m"): float(r["total"]) for r in raw}
            monthly_trend = [
                {
                    "month": d.strftime("%Y-%m"),
                    "label": d.strftime("%b"),
                    "revenue": revenue_by_month.get(d.strftime("%Y-%m"), 0),
                }
                for d in months
            ]

        return Response(
            {
                "stat_cards": stat_cards,
                "academic_years": [
                    {"id": ay.id, "year": ay.year, "is_current": ay.is_current} for ay in academic_years
                ],
                "selected_academic_year": academic_year.id if academic_year else None,
                "monthly_trend": monthly_trend,
            }
        )


class FinanceClassAnalysisReportView(APIView):
    """
    GET /api/v1/finance-reports/class-analysis/?academic_year=<id>

    Page 2 - Class analysis, all scoped to one academic year (same tab
    strip as the collections report):
      - classroom_outstanding: which classes carry the most unpaid fees,
        worst-first.
      - monthly_trend: 4 parallel series (due, paid, outstanding, invoice
        count) across the year - feed these into 4 line charts (or 4
        lines on one chart, your call on the frontend).
      - payment_method_breakdown: pie-chart-ready totals by method.
      - gender_balance_analysis: outstanding balance split by gender.
    """

    permission_classes = [utils.IsAdminOrFinance]

    def get(self, request):
        academic_years = models.AcademicYear.objects.all().order_by("-year")
        academic_year_list = [
            {"id": ay.id, "year": ay.year, "is_current": ay.is_current} for ay in academic_years
        ]

        academic_year_id = request.query_params.get("academic_year")
        if academic_year_id:
            academic_year = generics.get_object_or_404(models.AcademicYear, pk=academic_year_id)
        else:
            academic_year = academic_years.filter(is_current=True).first() or academic_years.first()

        if not academic_year:
            return Response(
                {
                    "academic_years": academic_year_list,
                    "selected_academic_year": None,
                    "classroom_outstanding": [],
                    "monthly_trend": {"months": [], "total_due": [], "total_paid": [], "outstanding": [], "invoice_count": []},
                    "payment_method_breakdown": [],
                    "gender_balance_analysis": {},
                }
            )

        year_invoices = models.Invoice.objects.filter(enrollment__academic_year=academic_year)

        # ---- classroom outstanding, worst-first ----
        raw_classrooms = (
            year_invoices.values(
                "enrollment__classroom__id",
                "enrollment__classroom__grade_level__name",
                "enrollment__classroom__stream__name",
            )
            .annotate(due=Sum("amount_due"), paid=Sum("amount_paid"))
        )
        classroom_outstanding = []
        for r in raw_classrooms:
            due = float(r["due"] or 0)
            paid = float(r["paid"] or 0)
            classroom_outstanding.append(
                {
                    "classroom_id": r["enrollment__classroom__id"],
                    "classroom": f'{r["enrollment__classroom__grade_level__name"]} {r["enrollment__classroom__stream__name"]}',
                    "due": due,
                    "paid": paid,
                    "outstanding": due - paid,
                }
            )
        classroom_outstanding.sort(key=lambda c: c["outstanding"], reverse=True)

        # ---- 4-line monthly trend ----
        months = _months_in_range(academic_year.start_date, academic_year.end_date)
        month_labels = [d.strftime("%b") for d in months]

        due_by_month, count_by_month, paid_by_month = {}, {}, {}
        raw_invoice_months = (
            year_invoices.annotate(month=TruncMonth("issued_at"))
            .values("month")
            .annotate(due=Sum("amount_due"), cnt=Count("id"))
        )
        for r in raw_invoice_months:
            key = r["month"].strftime("%Y-%m")
            due_by_month[key] = float(r["due"] or 0)
            count_by_month[key] = r["cnt"]

        raw_payment_months = (
            models.Payment.objects.filter(invoice__enrollment__academic_year=academic_year)
            .annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(paid=Sum("amount"))
        )
        for r in raw_payment_months:
            paid_by_month[r["month"].strftime("%Y-%m")] = float(r["paid"] or 0)

        total_due_series, total_paid_series, outstanding_series, count_series = [], [], [], []
        for d in months:
            key = d.strftime("%Y-%m")
            due = due_by_month.get(key, 0)
            paid = paid_by_month.get(key, 0)
            total_due_series.append(due)
            total_paid_series.append(paid)
            outstanding_series.append(due - paid)
            count_series.append(count_by_month.get(key, 0))

        monthly_trend = {
            "months": month_labels,
            "total_due": total_due_series,
            "total_paid": total_paid_series,
            "outstanding": outstanding_series,
            "invoice_count": count_series,
        }

        # ---- payment method pie ----
        raw_methods = (
            models.Payment.objects.filter(invoice__enrollment__academic_year=academic_year)
            .values("method")
            .annotate(amount=Sum("amount"), count=Count("id"))
        )
        method_labels = dict(models.Payment.Method.choices)
        payment_method_breakdown = [
            {
                "method": method_labels.get(r["method"], r["method"]),
                "amount": float(r["amount"] or 0),
                "count": r["count"],
            }
            for r in raw_methods
        ]

        # ---- gender balance analysis ----
        gender_rows = (
            year_invoices.values("enrollment__student__gender")
            .annotate(due=Sum("amount_due"), paid=Sum("amount_paid"), invoice_count=Count("id"))
        )
        gender_labels = dict(models.StudentProfile.Gender.choices)
        gender_balance_analysis = {}
        for r in gender_rows:
            due = float(r["due"] or 0)
            paid = float(r["paid"] or 0)
            outstanding = due - paid
            key = "male" if r["enrollment__student__gender"] == models.StudentProfile.Gender.MALE else "female"
            gender_balance_analysis[key] = {
                "label": gender_labels.get(r["enrollment__student__gender"], key),
                "total_due": due,
                "total_paid": paid,
                "total_outstanding": outstanding,
                "average_outstanding": round(outstanding / r["invoice_count"], 2) if r["invoice_count"] else 0,
                "invoice_count": r["invoice_count"],
            }

        return Response(
            {
                "academic_years": academic_year_list,
                "selected_academic_year": academic_year.id,
                "classroom_outstanding": classroom_outstanding,
                "monthly_trend": monthly_trend,
                "payment_method_breakdown": payment_method_breakdown,
                "gender_balance_analysis": gender_balance_analysis,
            }
        )


class FinanceReportPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


class FinanceDetailedReportView(APIView):
    """
    GET /api/v1/finance-reports/detailed/
        ?academic_year=<id>&term=<id>&classroom=<id>&status=paid|partial|unpaid&search=<name/admission_no>

    Page 3 - the drill-down: a paginated, filterable invoice list, plus a
    term-wise summary and a top-10 debtors list so admin/finance can go
    from "who owes what" straight to a specific invoice.
    """

    permission_classes = [utils.IsAdminOrFinance]
    pagination_class = FinanceReportPagination

    def get(self, request):
        academic_years = models.AcademicYear.objects.all().order_by("-year")
        academic_year_id = request.query_params.get("academic_year")
        if academic_year_id:
            academic_year = generics.get_object_or_404(models.AcademicYear, pk=academic_year_id)
        else:
            academic_year = academic_years.filter(is_current=True).first() or academic_years.first()

        qs = models.Invoice.objects.select_related(
            "enrollment__student__user", "enrollment__classroom__grade_level",
            "enrollment__classroom__stream", "fee_structure__term",
        )
        if academic_year:
            qs = qs.filter(enrollment__academic_year=academic_year)

        term_id = request.query_params.get("term")
        if term_id:
            qs = qs.filter(fee_structure__term_id=term_id)

        classroom_id = request.query_params.get("classroom")
        if classroom_id:
            qs = qs.filter(enrollment__classroom_id=classroom_id)

        pay_status = request.query_params.get("status")
        if pay_status == "paid":
            qs = qs.filter(amount_paid__gte=F("amount_due"))
        elif pay_status == "partial":
            qs = qs.filter(amount_paid__gt=0, amount_paid__lt=F("amount_due"))
        elif pay_status == "unpaid":
            qs = qs.filter(amount_paid=0)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(enrollment__student__admission_no__icontains=search)
                | Q(enrollment__student__user__first_name__icontains=search)
                | Q(enrollment__student__user__last_name__icontains=search)
            )

        qs = qs.order_by("-issued_at")

        totals = qs.aggregate(total_due=Sum("amount_due"), total_paid=Sum("amount_paid"))
        total_due = float(totals["total_due"] or 0)
        total_paid = float(totals["total_paid"] or 0)

        # ---- term-wise summary for the selected academic year ----
        term_summary = []
        if academic_year:
            term_number_labels = dict(models.Term.TermNumber.choices)
            term_rows = (
                models.Invoice.objects.filter(enrollment__academic_year=academic_year)
                .values("fee_structure__term__term_number")
                .annotate(due=Sum("amount_due"), paid=Sum("amount_paid"))
                .order_by("fee_structure__term__term_number")
            )
            for r in term_rows:
                due = float(r["due"] or 0)
                paid = float(r["paid"] or 0)
                term_summary.append(
                    {
                        "term": term_number_labels.get(r["fee_structure__term__term_number"], "-"),
                        "due": due,
                        "paid": paid,
                        "outstanding": due - paid,
                    }
                )

        # ---- top 10 debtors ----
        debtor_qs = (
            models.Invoice.objects.filter(enrollment__academic_year=academic_year)
            if academic_year
            else models.Invoice.objects.all()
        )
        raw_debtors = debtor_qs.values(
            "enrollment__student__admission_no",
            "enrollment__student__user__first_name",
            "enrollment__student__user__last_name",
            "enrollment__classroom__grade_level__name",
            "enrollment__classroom__stream__name",
        ).annotate(due=Sum("amount_due"), paid=Sum("amount_paid"))

        top_debtors = sorted(
            (
                {
                    "admission_no": r["enrollment__student__admission_no"],
                    "name": f'{r["enrollment__student__user__first_name"]} {r["enrollment__student__user__last_name"]}',
                    "classroom": f'{r["enrollment__classroom__grade_level__name"]} {r["enrollment__classroom__stream__name"]}',
                    "outstanding": float(r["due"] or 0) - float(r["paid"] or 0),
                }
                for r in raw_debtors
            ),
            key=lambda d: d["outstanding"],
            reverse=True,
        )
        top_debtors = [d for d in top_debtors if d["outstanding"] > 0][:10]

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        rows = []
        for inv in page:
            status_label = (
                "paid" if inv.amount_paid >= inv.amount_due
                else "partial" if inv.amount_paid > 0
                else "unpaid"
            )
            rows.append(
                {
                    "id": inv.id,
                    "admission_no": inv.enrollment.student.admission_no,
                    "student_name": inv.enrollment.student.user.get_full_name(),
                    "classroom": str(inv.enrollment.classroom),
                    "term": str(inv.fee_structure.term),
                    "due": float(inv.amount_due),
                    "paid": float(inv.amount_paid),
                    "balance": float(inv.balance),
                    "status": status_label,
                }
            )

        response = paginator.get_paginated_response(rows)
        response.data["summary"] = {
            "total_due": total_due,
            "total_paid": total_paid,
            "total_outstanding": total_due - total_paid,
        }
        response.data["term_summary"] = term_summary
        response.data["top_debtors"] = top_debtors
        response.data["academic_years"] = [
            {"id": ay.id, "year": ay.year, "is_current": ay.is_current} for ay in academic_years
        ]
        response.data["selected_academic_year"] = academic_year.id if academic_year else None
        return response
    
    
    
# ===========================================================================
# COMMUNICATIONS & MESSAGING 
# ===========================================================================

class CommunicationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


class CommunicationViewSet(viewsets.ModelViewSet):
    """
    Admin/Finance only. POST creates + immediately sends a broadcast
    (audience resolved and dispatched in services.send_communication).
    GET lists the communications log with per-channel delivery counts.
    """

    queryset = models.Communication.objects.select_related("sender", "grade_level", "classroom", "academic_year").all()
    permission_classes = [utils.IsAdminOrFinance]
    pagination_class = CommunicationPagination
    filterset_fields = ["category", "audience_type"]
    filter_backends = [DjangoFilterBackend]

    def get_serializer_class(self):
        return serializers.CommunicationCreateSerializer if self.action == "create" else serializers.CommunicationSerializer

    def create(self, request, *args, **kwargs):
        serializer = serializers.CommunicationCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        communication = serializer.save()
        return Response(serializers.CommunicationSerializer(communication).data, status=201)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Every authenticated user's own in-app notifications - what the navbar
    bell reads. Not scoped to Admin/Finance: everyone (Teacher, Student,
    Parent...) can receive a Communication and should see it here.
    """

    serializer_class = serializers.NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return models.CommunicationRecipient.objects.filter(
            user=self.request.user, channel=models.CommunicationRecipient.Channel.IN_APP
        ).select_related("communication", "communication__sender").order_by("-communication__created_at")

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({"unread_count": count})

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"detail": "All notifications marked read."})

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(serializers.NotificationSerializer(notification).data)


class ConversationViewSet(viewsets.ModelViewSet):
    """
    1:1 messaging threads. Anyone authenticated can list/view their own
    conversations and post replies into one they're already part of;
    only staff (Admin/Teacher/Finance) can start a NEW conversation -
    see ConversationCreateSerializer, which also enforces that a Teacher
    can only start one with a student they actually teach.
    """

    serializer_class = serializers.ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            models.Conversation.objects.filter(participants=self.request.user)
            .prefetch_related("participants", "messages")
            .distinct()
        )

    def get_permissions(self):
        if self.action == "create":
            return [utils.IsStaffMember()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = serializers.ConversationCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()
        return Response(serializers.ConversationSerializer(conversation, context={"request": request}).data, status=201)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        conversation = self.get_object()
        if request.method == "GET":
            qs = conversation.messages.select_related("sender").order_by("created_at")
            # opening the thread marks every message in it as read
            for message in qs.exclude(read_by=request.user):
                message.read_by.add(request.user)
            return Response(serializers.DirectMessageSerializer(qs, many=True, context={"request": request}).data)

        body = request.data.get("body", "").strip()
        if not body:
            return Response({"detail": "Message body is required."}, status=400)
        message = models.DirectMessage.objects.create(conversation=conversation, sender=request.user, body=body)
        message.read_by.add(request.user)
        return Response(serializers.DirectMessageSerializer(message, context={"request": request}).data, status=201)

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = (
            models.DirectMessage.objects.filter(conversation__participants=request.user)
            .exclude(sender=request.user)
            .exclude(read_by=request.user)
            .count()
        )
        return Response({"unread_count": count})


class RecipientSearchView(APIView):
    """
    GET /api/v1/messaging/recipients/?search=<text>&role=PARENT|STUDENT
    Powers the "start a new conversation" picker: staff search students/
    guardians by name or admission number and get back the actual User id
    needed for ConversationCreateSerializer.recipient_id, plus which
    student the thread should be tied to.
    """

    permission_classes = [utils.IsStaffMember]

    def get(self, request):
        search = request.query_params.get("search", "").strip()
        role = request.query_params.get("role")
        results = []

        if role in (None, "STUDENT"):
            students = models.StudentProfile.objects.select_related("user").all()
            if search:
                students = students.filter(
                    Q(admission_no__icontains=search)
                    | Q(user__first_name__icontains=search)
                    | Q(user__last_name__icontains=search)
                )
            for s in students[:20]:
                enrollment = s.current_enrollment
                results.append({
                    "user_id": s.user_id,
                    "student_id": s.id,
                    "name": s.user.get_full_name(),
                    "role": "STUDENT",
                    "detail": f"{s.admission_no} - {enrollment.classroom if enrollment else 'No current class'}",
                })

        if role in (None, "PARENT"):
            links = models.ParentStudentLink.objects.select_related("parent__user", "student__user")
            if search:
                links = links.filter(
                    Q(parent__user__first_name__icontains=search)
                    | Q(parent__user__last_name__icontains=search)
                    | Q(student__admission_no__icontains=search)
                    | Q(student__user__first_name__icontains=search)
                    | Q(student__user__last_name__icontains=search)
                )
            seen = set()
            for link in links[:40]:
                key = (link.parent.user_id, link.student_id)
                if key in seen:
                    continue
                seen.add(key)
                results.append({
                    "user_id": link.parent.user_id,
                    "student_id": link.student_id,
                    "name": link.parent.user.get_full_name(),
                    "role": "PARENT",
                    "detail": f"Guardian of {link.student.user.get_full_name()} ({link.student.admission_no})",
                })

        return Response(results[:30])
    
    
class FinanceStudentBalancesReportView(APIView):
    """
    GET /api/v1/finance-reports/student-balances/
        ?classroom=<id>&grade_level=<id>&stream=<id>
        &min_balance=&max_balance=&status=paid|partial|unpaid
        &search=<name/admission_no>&page=&page_size=

    Page 4 - Master Balance Ledger. ONE ROW PER STUDENT, aggregated
    across EVERY invoice they've ever had (any academic year, any term).
    This is the "who owes what, right now, overall" view finance actually
    uses day-to-day - as opposed to FinanceDetailedReportView which is
    per-invoice. Only currently active students are listed; the
    class/grade/stream filters look at their CURRENT enrollment only,
    but the balance itself is the lifetime sum.
    """

    permission_classes = [utils.IsAdminOrFinance]
    pagination_class = FinanceReportPagination

    def get(self, request):
        students = models.StudentProfile.objects.filter(is_active=True).select_related("user")

        classroom_id = request.query_params.get("classroom")
        grade_level_id = request.query_params.get("grade_level")
        stream_id = request.query_params.get("stream")

        if classroom_id or grade_level_id or stream_id:
            enrollment_filter = Q(enrollments__status=models.Enrollment.Status.ACTIVE)
            if classroom_id:
                enrollment_filter &= Q(enrollments__classroom_id=classroom_id)
            if grade_level_id:
                enrollment_filter &= Q(enrollments__classroom__grade_level_id=grade_level_id)
            if stream_id:
                enrollment_filter &= Q(enrollments__classroom__stream_id=stream_id)
            students = students.filter(enrollment_filter).distinct()

        search = request.query_params.get("search")
        if search:
            students = students.filter(
                Q(admission_no__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )

        students = students.annotate(
            total_due=Sum("enrollments__invoices__amount_due"),
            total_paid=Sum("enrollments__invoices__amount_paid"),
        )

        rows = []
        for s in students:
            due = float(s.total_due or 0)
            paid = float(s.total_paid or 0)
            balance = due - paid
            enrollment = s.current_enrollment
            status_label = "paid" if balance <= 0 else ("partial" if paid > 0 else "unpaid")
            rows.append({
                "id": s.id,
                "admission_no": s.admission_no,
                "student_name": s.user.get_full_name(),
                "classroom": str(enrollment.classroom) if enrollment else "-",
                "curriculum_type": s.get_curriculum_type_display(),
                "phone_number": s.user.phone_number,
                "total_due": due,
                "total_paid": paid,
                "balance": balance,
                "status": status_label,
            })

        min_balance = request.query_params.get("min_balance")
        max_balance = request.query_params.get("max_balance")
        if min_balance not in (None, ""):
            rows = [r for r in rows if r["balance"] >= float(min_balance)]
        if max_balance not in (None, ""):
            rows = [r for r in rows if r["balance"] <= float(max_balance)]

        pay_status = request.query_params.get("status")
        if pay_status:
            rows = [r for r in rows if r["status"] == pay_status]

        rows.sort(key=lambda r: r["balance"], reverse=True)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(rows, request, view=self)
        response = paginator.get_paginated_response(page)
        response.data["summary"] = {
            "total_students": len(rows),
            "total_balance": sum(r["balance"] for r in rows),
        }
        return response