"""
Small, reusable helpers: RBAC permission classes + misc utility functions.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
import re
from rest_framework.permissions import BasePermission

from . import models


# ---------------------------------------------------------------------------
# RBAC permission classes
# ---------------------------------------------------------------------------
class IsRole(BasePermission):
    """Base class - subclass and set `allowed_roles`."""

    allowed_roles = ()

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsAdmin(IsRole):
    allowed_roles = (models.User.Role.ADMIN,)


class IsTeacher(IsRole):
    allowed_roles = (models.User.Role.TEACHER,)


class IsFinance(IsRole):
    allowed_roles = (models.User.Role.FINANCE,)


class IsStudent(IsRole):
    allowed_roles = (models.User.Role.STUDENT,)


class IsParent(IsRole):
    allowed_roles = (models.User.Role.PARENT,)


class IsAdminOrTeacher(IsRole):
    allowed_roles = (models.User.Role.ADMIN, models.User.Role.TEACHER)


class IsAdminOrFinance(IsRole):
    allowed_roles = (models.User.Role.ADMIN, models.User.Role.FINANCE)


class ReadOnlyOrAdmin(BasePermission):
    """Anyone authenticated can read; only ADMIN can write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role == models.User.Role.ADMIN


class IsAllocatedTeacherForClassroom(BasePermission):
    """
    Object-level check: a teacher may only enter/edit marks for a
    (subject, classroom) pair they are actually allocated to.
    ADMIN always passes.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == models.User.Role.ADMIN:
            return True
        if user.role != models.User.Role.TEACHER:
            return False
        # obj is expected to be an ExamResult or something exposing .exam & .subject & .enrollment
        classroom = obj.enrollment.classroom
        return models.TeacherSubjectAllocation.objects.filter(
            teacher=user, subject=obj.subject, classroom=classroom,
            academic_year=classroom.academic_year,
        ).exists()


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------
def get_current_term():
    return models.Term.objects.filter(is_current=True).select_related("academic_year").first()


def get_current_academic_year():
    return models.AcademicYear.objects.filter(is_current=True).first()


def teacher_allocated_classrooms(teacher, academic_year=None):
    """Distinct (subject, classroom) pairs a teacher is allocated to."""
    qs = models.TeacherSubjectAllocation.objects.filter(teacher=teacher).select_related(
        "subject", "classroom", "classroom__grade_level", "classroom__stream"
    )
    if academic_year:
        qs = qs.filter(academic_year=academic_year)
    else:
        qs = qs.filter(academic_year__is_current=True)
    return qs


def student_guardians(student_profile):
    return [link.parent.user for link in models.ParentStudentLink.objects.filter(student=student_profile)]


# ===========================================================================
# Add to utils.py.
# ===========================================================================
from rest_framework.permissions import BasePermission
from . import models


class IsStaffMember(BasePermission):
    """ADMIN, TEACHER, or FINANCE - used to gate starting a new conversation and creating bulk Communications."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in (models.User.Role.ADMIN, models.User.Role.TEACHER, models.User.Role.FINANCE)
        )


def teacher_can_message_student(user, student):
    """
    True if `user` (a TEACHER) is the class teacher of `student`'s current
    classroom, or is allocated to teach a subject in it. Admin/Finance
    bypass this check entirely (see ConversationCreateSerializer).
    """
    enrollment = student.current_enrollment
    if not enrollment:
        return False
    classroom = enrollment.classroom
    if classroom.class_teacher_id == user.id:
        return True
    return models.TeacherSubjectAllocation.objects.filter(teacher=user, classroom=classroom).exists()




USERNAME_MAX_LENGTH = 30
# letters, numbers, - _ . / only, 3-30 chars — rejects the "garbage string" case entirely
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._\-/]{3,30}$")


def get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def mask_contact(user):
    """Never echo a full phone/email back in the OTP response."""
    phone = (user.phone_number or "").strip()
    if len(phone) >= 4:
        return f"contact ending in {phone[-4:]}"
    return "your registered contact"


class IsAdminOnly(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "ADMIN")