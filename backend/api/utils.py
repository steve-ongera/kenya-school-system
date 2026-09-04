"""
Small, reusable helpers: RBAC permission classes + misc utility functions.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

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
