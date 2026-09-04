from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from . import models


@admin.register(models.User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "is_active_staff")
    list_filter = ("role", "is_active_staff")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("School role", {"fields": ("role", "phone_number", "national_id", "is_active_staff")}),
    )


admin.site.register(models.School)
admin.site.register(models.AcademicYear)
admin.site.register(models.Term)
admin.site.register(models.GradeLevel)
admin.site.register(models.Stream)
admin.site.register(models.ClassRoom)
admin.site.register(models.StudentProfile)
admin.site.register(models.ParentGuardianProfile)
admin.site.register(models.ParentStudentLink)
admin.site.register(models.Enrollment)
admin.site.register(models.Subject)
admin.site.register(models.SubjectPaper)
admin.site.register(models.GradeSubject)
admin.site.register(models.SubjectSelectionRule)
admin.site.register(models.StudentSubjectSelection)
admin.site.register(models.TeacherSubjectAllocation)
admin.site.register(models.ExamType)
admin.site.register(models.Exam)
admin.site.register(models.ExamResult)
admin.site.register(models.GradingScale)
admin.site.register(models.TermPositionRanking)
admin.site.register(models.PromotionRule)
admin.site.register(models.FeeStructure)
admin.site.register(models.FeeStructureItem)
admin.site.register(models.Invoice)
admin.site.register(models.Payment)
