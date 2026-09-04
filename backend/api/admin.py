"""
Admin site configuration for the school management system.

Organized to mirror models.py:
  1. Identity & RBAC (User)
  2. School / Academic Calendar
  3. Curriculum / Grade Structure
  4. Students, Guardians, Enrollment History
  5. Subjects
  6. Teacher Allocation
  7. Exams, Results, Grading, Ranking
  8. Promotion Rules
  9. Fees

Performance notes: several tables here (ExamResult, Enrollment, Invoice,
Payment) can run into the tens of thousands of rows across 4 years of data,
so FK widgets use autocomplete_fields/raw_id_fields instead of plain <select>
dropdowns, list views use select_related, and the heaviest tables skip the
exact row count query (show_full_result_count = False).
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.db.models import Sum
from django.utils.html import format_html

from api.models import (
    AcademicYear, ClassRoom, Enrollment, Exam, ExamResult, ExamType,
    FeeStructure, FeeStructureItem, GradeLevel, GradeSubject, GradingScale,
    Invoice, ParentGuardianProfile, ParentStudentLink, Payment, PromotionRule,
    School, Stream, StudentProfile, StudentSubjectSelection, Subject,
    SubjectPaper, SubjectSelectionRule, Term, TeacherSubjectAllocation,
    TermPositionRanking, User,
)

admin.site.site_header = "Kilele Ridge Secondary School Administration"
admin.site.site_title = "Kilele Ridge Admin"
admin.site.index_title = "School Management System"


# ---------------------------------------------------------------------------
# Small reusable helpers
# ---------------------------------------------------------------------------
def _badge(text, color):
    return format_html(
        '<span style="padding:2px 8px;border-radius:10px;font-size:11px;'
        'font-weight:600;color:#fff;background:{}">{}</span>', color, text,
    )


STATUS_COLORS = {
    "ACTIVE": "#2e7d32", "PROMOTED": "#1565c0", "REPEATED": "#ef6c00",
    "GRADUATED": "#6a1b9a", "TRANSFERRED_OUT": "#757575", "DROPPED": "#c62828",
}


# ---------------------------------------------------------------------------
# 1. IDENTITY & RBAC
# ---------------------------------------------------------------------------
@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ["-date_joined"]
    list_display = ("username", "full_name", "role_badge", "email", "phone_number", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff", "is_active_staff")
    search_fields = ("username", "first_name", "last_name", "email", "national_id", "phone_number")
    list_per_page = 50

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "email", "phone_number", "national_id")}),
        ("Role & status", {"fields": ("role", "is_active_staff", "is_active", "is_staff", "is_superuser")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("username", "role", "email", "phone_number", "password1", "password2"),
        }),
    )

    @admin.display(description="Name", ordering="first_name")
    def full_name(self, obj):
        return obj.get_full_name() or "—"

    @admin.display(description="Role")
    def role_badge(self, obj):
        colors = {
            "ADMIN": "#6a1b9a", "TEACHER": "#1565c0", "STUDENT": "#2e7d32",
            "PARENT": "#ef6c00", "FINANCE": "#00838f",
        }
        return _badge(obj.get_role_display(), colors.get(obj.role, "#616161"))


# ---------------------------------------------------------------------------
# 2. SCHOOL / ACADEMIC CALENDAR
# ---------------------------------------------------------------------------
@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "school_type", "knec_code", "county")
    list_filter = ("school_type", "county")
    search_fields = ("name", "knec_code")


class TermInline(admin.TabularInline):
    model = Term
    extra = 0
    fields = ("term_number", "start_date", "end_date", "is_current")
    ordering = ("term_number",)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("year", "start_date", "end_date", "is_current")
    list_filter = ("is_current",)
    search_fields = ("=year",)
    ordering = ("-year",)
    inlines = [TermInline]
    actions = ["mark_as_current"]

    @admin.action(description="Mark selected year as the current academic year")
    def mark_as_current(self, request, queryset):
        year = queryset.order_by("-year").first()
        if year:
            year.is_current = True
            year.save(update_fields=["is_current"])
            self.message_user(request, f"{year} set as the current academic year.")


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ("__str__", "academic_year", "term_number", "start_date", "end_date", "is_current")
    list_filter = ("academic_year", "term_number", "is_current")
    search_fields = ("=academic_year__year", "=term_number")
    ordering = ("academic_year__year", "term_number")
    autocomplete_fields = ("academic_year",)


# ---------------------------------------------------------------------------
# 3. CURRICULUM / GRADE STRUCTURE
# ---------------------------------------------------------------------------
@admin.register(GradeLevel)
class GradeLevelAdmin(admin.ModelAdmin):
    list_display = ("name", "curriculum_type", "education_level", "level_order", "next_grade")
    list_filter = ("curriculum_type", "education_level")
    search_fields = ("name",)
    ordering = ("curriculum_type", "level_order")
    autocomplete_fields = ("next_grade",)


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(ClassRoom)
class ClassRoomAdmin(admin.ModelAdmin):
    list_display = ("__str__", "grade_level", "stream", "academic_year", "class_teacher", "student_count")
    list_filter = ("academic_year", "grade_level__curriculum_type", "grade_level", "stream")
    search_fields = (
        "grade_level__name", "stream__name",
        "class_teacher__first_name", "class_teacher__last_name", "class_teacher__username",
    )
    autocomplete_fields = ("grade_level", "stream", "academic_year", "class_teacher")
    list_select_related = ("grade_level", "stream", "academic_year", "class_teacher")
    list_per_page = 50

    @admin.display(description="Students")
    def student_count(self, obj):
        return obj.enrollments.count()


# ---------------------------------------------------------------------------
# 4. STUDENTS, GUARDIANS, ENROLLMENT HISTORY
# ---------------------------------------------------------------------------
class EnrollmentInline(admin.TabularInline):
    model = Enrollment
    extra = 0
    fields = ("academic_year", "classroom", "status", "promoted_from")
    autocomplete_fields = ("classroom", "promoted_from")
    readonly_fields = ("academic_year",)
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = (
        "admission_no", "full_name", "gender", "curriculum_type",
        "current_grade", "is_active",
    )
    list_filter = ("curriculum_type", "gender", "is_active")
    search_fields = ("admission_no", "upi_number", "user__first_name", "user__last_name", "user__username")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    list_per_page = 50
    inlines = [EnrollmentInline]

    @admin.display(description="Name", ordering="user__first_name")
    def full_name(self, obj):
        return obj.user.get_full_name()

    @admin.display(description="Current class")
    def current_grade(self, obj):
        enr = obj.current_enrollment
        return str(enr.classroom) if enr else "—"


class ParentStudentLinkInline(admin.TabularInline):
    model = ParentStudentLink
    extra = 0
    autocomplete_fields = ("student",)


@admin.register(ParentGuardianProfile)
class ParentGuardianProfileAdmin(admin.ModelAdmin):
    list_display = ("__str__", "phone_number", "student_list")
    search_fields = ("user__first_name", "user__last_name", "user__username", "user__phone_number")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    inlines = [ParentStudentLinkInline]

    @admin.display(description="Phone")
    def phone_number(self, obj):
        return obj.user.phone_number

    @admin.display(description="Student(s)")
    def student_list(self, obj):
        return ", ".join(s.admission_no for s in obj.students.all()[:5])


@admin.register(ParentStudentLink)
class ParentStudentLinkAdmin(admin.ModelAdmin):
    list_display = ("parent", "student", "relationship")
    list_filter = ("relationship",)
    search_fields = (
        "parent__user__first_name", "parent__user__last_name",
        "student__admission_no", "student__user__first_name", "student__user__last_name",
    )
    autocomplete_fields = ("parent", "student")


class StudentSubjectSelectionInline(admin.TabularInline):
    model = StudentSubjectSelection
    extra = 0
    autocomplete_fields = ("subject",)


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student", "classroom", "academic_year", "status_badge", "promoted_from")
    list_filter = ("status", "academic_year", "classroom__grade_level")
    search_fields = (
        "student__admission_no", "student__user__first_name", "student__user__last_name",
        "classroom__grade_level__name",
    )
    autocomplete_fields = ("student", "classroom", "academic_year", "promoted_from")
    list_select_related = ("student__user", "classroom__grade_level", "classroom__stream", "academic_year")
    list_per_page = 50
    show_full_result_count = False
    inlines = [StudentSubjectSelectionInline]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return _badge(obj.get_status_display(), STATUS_COLORS.get(obj.status, "#616161"))


# ---------------------------------------------------------------------------
# 5. SUBJECTS
# ---------------------------------------------------------------------------
class SubjectPaperInline(admin.TabularInline):
    model = SubjectPaper
    extra = 0


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "curriculum_type", "has_papers")
    list_filter = ("curriculum_type", "has_papers")
    search_fields = ("name", "code")
    inlines = [SubjectPaperInline]


@admin.register(SubjectPaper)
class SubjectPaperAdmin(admin.ModelAdmin):
    list_display = ("subject", "paper_number", "name", "max_marks")
    list_filter = ("subject__curriculum_type",)
    search_fields = ("subject__name", "subject__code", "name")
    autocomplete_fields = ("subject",)


@admin.register(GradeSubject)
class GradeSubjectAdmin(admin.ModelAdmin):
    list_display = ("grade_level", "subject", "is_compulsory")
    list_filter = ("is_compulsory", "grade_level__curriculum_type", "grade_level")
    search_fields = ("grade_level__name", "subject__name", "subject__code")
    autocomplete_fields = ("grade_level", "subject")


@admin.register(SubjectSelectionRule)
class SubjectSelectionRuleAdmin(admin.ModelAdmin):
    list_display = (
        "grade_level", "min_optional_subjects", "max_optional_subjects",
        "min_total_subjects", "max_total_subjects",
    )
    autocomplete_fields = ("grade_level",)


@admin.register(StudentSubjectSelection)
class StudentSubjectSelectionAdmin(admin.ModelAdmin):
    list_display = ("enrollment", "subject")
    list_filter = ("subject__curriculum_type", "subject")
    search_fields = ("enrollment__student__admission_no", "subject__name", "subject__code")
    autocomplete_fields = ("enrollment", "subject")
    list_select_related = ("enrollment__student", "subject")
    list_per_page = 50
    show_full_result_count = False


# ---------------------------------------------------------------------------
# 6. TEACHER ALLOCATION
# ---------------------------------------------------------------------------
@admin.register(TeacherSubjectAllocation)
class TeacherSubjectAllocationAdmin(admin.ModelAdmin):
    list_display = ("teacher", "subject", "classroom", "academic_year")
    list_filter = ("academic_year", "subject__curriculum_type")
    search_fields = (
        "teacher__first_name", "teacher__last_name", "teacher__username",
        "subject__name", "subject__code", "classroom__grade_level__name",
    )
    autocomplete_fields = ("teacher", "subject", "classroom", "academic_year")
    list_select_related = ("teacher", "subject", "classroom__grade_level", "classroom__stream")
    list_per_page = 50


# ---------------------------------------------------------------------------
# 7. EXAMS, RESULTS, GRADING, RANKING
# ---------------------------------------------------------------------------
@admin.register(ExamType)
class ExamTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "weight", "order", "counts_towards_midterm_rank", "counts_towards_endterm_rank")
    search_fields = ("name",)
    ordering = ("order",)


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ("name", "term", "exam_type", "grade_level", "start_date", "end_date", "published_badge")
    list_filter = ("term__academic_year", "exam_type", "grade_level__curriculum_type", "is_published")
    search_fields = ("name", "grade_level__name")
    autocomplete_fields = ("term", "exam_type", "grade_level")
    list_select_related = ("term__academic_year", "exam_type", "grade_level")
    date_hierarchy = "start_date"
    actions = ["publish_results", "unpublish_results"]

    @admin.display(description="Published")
    def published_badge(self, obj):
        return _badge("Published", "#2e7d32") if obj.is_published else _badge("Pending", "#ef6c00")

    @admin.action(description="Publish selected exams")
    def publish_results(self, request, queryset):
        updated = queryset.update(is_published=True)
        self.message_user(request, f"{updated} exam(s) published.")

    @admin.action(description="Unpublish selected exams")
    def unpublish_results(self, request, queryset):
        updated = queryset.update(is_published=False)
        self.message_user(request, f"{updated} exam(s) unpublished.")


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = (
        "student_admission_no", "subject", "paper", "exam",
        "marks_obtained", "max_marks", "percentage_display", "is_absent",
    )
    list_filter = ("exam__exam_type", "exam__term__academic_year", "is_absent", "subject__curriculum_type")
    search_fields = (
        "enrollment__student__admission_no",
        "enrollment__student__user__first_name", "enrollment__student__user__last_name",
        "subject__name", "subject__code",
    )
    autocomplete_fields = ("exam", "enrollment", "subject", "paper", "entered_by")
    list_select_related = ("enrollment__student", "subject", "paper", "exam")
    list_per_page = 50
    show_full_result_count = False  # this table can hold tens of thousands of rows

    @admin.display(description="Student", ordering="enrollment__student__admission_no")
    def student_admission_no(self, obj):
        return obj.enrollment.student.admission_no

    @admin.display(description="%")
    def percentage_display(self, obj):
        pct = obj.percentage
        return f"{pct}%" if pct is not None else "—"


@admin.register(GradingScale)
class GradingScaleAdmin(admin.ModelAdmin):
    list_display = ("curriculum_type", "subject", "grade_letter", "min_percentage", "max_percentage", "points", "remark")
    list_filter = ("curriculum_type", "subject")
    autocomplete_fields = ("subject",)
    ordering = ("curriculum_type", "-min_percentage")


@admin.register(TermPositionRanking)
class TermPositionRankingAdmin(admin.ModelAdmin):
    list_display = (
        "student_admission_no", "term", "checkpoint",
        "total_marks", "average_marks", "class_position", "grade_position",
    )
    list_filter = ("checkpoint", "term__academic_year")
    search_fields = ("enrollment__student__admission_no", "enrollment__student__user__first_name", "enrollment__student__user__last_name")
    autocomplete_fields = ("term", "enrollment")
    list_select_related = ("enrollment__student", "term__academic_year")
    list_per_page = 50
    show_full_result_count = False
    ordering = ("term", "checkpoint", "class_position")

    @admin.display(description="Student", ordering="enrollment__student__admission_no")
    def student_admission_no(self, obj):
        return obj.enrollment.student.admission_no


# ---------------------------------------------------------------------------
# 8. PROMOTION RULES
# ---------------------------------------------------------------------------
@admin.register(PromotionRule)
class PromotionRuleAdmin(admin.ModelAdmin):
    list_display = ("grade_level", "minimum_average_percentage", "minimum_subjects_passed", "pass_mark_percentage")
    autocomplete_fields = ("grade_level",)


# ---------------------------------------------------------------------------
# 9. FEES
# ---------------------------------------------------------------------------
class FeeStructureItemInline(admin.TabularInline):
    model = FeeStructureItem
    extra = 0


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = ("grade_level", "term", "total_amount", "items_total")
    list_filter = ("term__academic_year", "grade_level__curriculum_type", "grade_level")
    search_fields = ("grade_level__name",)
    autocomplete_fields = ("grade_level", "term")
    list_select_related = ("grade_level", "term__academic_year")
    inlines = [FeeStructureItemInline]

    @admin.display(description="Line items total")
    def items_total(self, obj):
        total = obj.items.aggregate(t=Sum("amount"))["t"] or 0
        return f"KES {total:,.0f}"


@admin.register(FeeStructureItem)
class FeeStructureItemAdmin(admin.ModelAdmin):
    list_display = ("fee_structure", "name", "amount")
    search_fields = ("name", "fee_structure__grade_level__name")
    autocomplete_fields = ("fee_structure",)


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = ("amount", "method", "reference", "recorded_by", "paid_at")
    autocomplete_fields = ("recorded_by",)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("__str__", "enrollment", "fee_structure", "amount_due", "amount_paid", "balance_display")
    list_filter = ("fee_structure__term__academic_year", "fee_structure__grade_level")
    search_fields = ("enrollment__student__admission_no", "enrollment__student__user__first_name", "enrollment__student__user__last_name")
    autocomplete_fields = ("enrollment", "fee_structure")
    list_select_related = ("enrollment__student", "fee_structure__grade_level", "fee_structure__term")
    list_per_page = 50
    show_full_result_count = False
    inlines = [PaymentInline]

    @admin.display(description="Balance")
    def balance_display(self, obj):
        balance = obj.balance
        color = "#c62828" if balance > 0 else "#2e7d32"
        return format_html('<b style="color:{}">KES {:,.0f}</b>', color, balance)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("invoice", "amount", "method", "reference", "recorded_by", "paid_at")
    list_filter = ("method", "paid_at")
    search_fields = (
        "reference", "invoice__enrollment__student__admission_no",
        "invoice__enrollment__student__user__first_name", "invoice__enrollment__student__user__last_name",
    )
    autocomplete_fields = ("invoice", "recorded_by")
    list_select_related = ("invoice__enrollment__student", "recorded_by")
    list_per_page = 50
    show_full_result_count = False
    date_hierarchy = "paid_at"