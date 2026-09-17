"""
Admin site configuration for the school management system.

Organized to mirror models.py:
  1. Identity & RBAC (User, LoginAttemptLog)
  2. School / Academic Calendar
  3. Curriculum / Grade Structure (incl. ClassroomPromotion tracking)
  4. Students, Guardians, Enrollment History
  5. Subjects (CBC Pathways + 8-4-4 Elective Groups/Tracks)
  6. Teacher Allocation
  7. Timetable (PeriodSlot, TimetableEntry)
  8. Exams, Results, Grading, Ranking
  9. Promotion Rules
  10. Fees (incl. M-Pesa STK push trail + missing-fee-structure alerts)
  11. Communications & Messaging (broadcasts + 1:1 threads)
  12. Licensing (tiers, tokens, subscription packages)

Performance notes: several tables here (ExamResult, Enrollment, Invoice,
Payment, CommunicationRecipient) can run into the tens of thousands of rows
across several years of data, so FK widgets use autocomplete_fields/
raw_id_fields instead of plain <select> dropdowns, list views use
select_related, and the heaviest tables skip the exact row count query
(show_full_result_count = False).
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.db.models import Sum
from django.utils.html import format_html

from api.models import (
    AcademicYear, ClassRoom, ClassroomPromotion, Communication,
    CommunicationRecipient, Conversation, DirectMessage, Enrollment, Exam,
    ExamResult, ExamType, FeeStructure, FeeStructureItem,
    FeeStructureMissingAlert, GradeLevel, GradeSubject, GradingScale,
    Invoice, LoginAttemptLog, MpesaSTKPushRequest, ParentGuardianProfile,
    ParentStudentLink, Pathway, Payment, PeriodSlot, PromotionRule, School,
    SelectionTrack, Stream, StudentProfile, StudentSubjectSelection,
    Subject, SubjectGroup, SubjectPaper, SubjectSelectionRule, Term,
    TeacherSubjectAllocation, TermPositionRanking, TimetableEntry,
    TrackGroupRule, User,
)

admin.site.site_header = "Masomo  School Administration"
admin.site.site_title = "Masomo Info Admin"
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

STK_STATUS_COLORS = {
    "PENDING": "#ef6c00", "COMPLETED": "#2e7d32", "FAILED": "#c62828", "CANCELLED": "#757575",
}

LOGIN_RESULT_COLORS = {
    "SUCCESS": "#2e7d32", "OTP_SUCCESS": "#2e7d32", "OTP_SENT": "#1565c0",
    "BAD_PASSWORD": "#c62828", "UNKNOWN_USER": "#c62828", "OTP_FAILED": "#c62828",
    "INVALID_FORMAT": "#c62828", "ACCOUNT_LOCKED": "#6a1b9a",
}


# ---------------------------------------------------------------------------
# 1. IDENTITY & RBAC
# ---------------------------------------------------------------------------
@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ["-date_joined"]
    list_display = ("username", "full_name","is_super_admin", "role_badge", "email", "phone_number", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff", "is_active_staff")
    search_fields = ("username", "first_name", "last_name", "email", "national_id", "phone_number")
    list_per_page = 50


    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "email", "phone_number", "national_id")}),
        ("Role & status", {"fields": ("role", "is_active_staff", "is_active", "is_staff", "is_superuser","is_super_admin")}),
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


@admin.register(LoginAttemptLog)
class LoginAttemptLogAdmin(admin.ModelAdmin):
    """
    Every login/OTP attempt, success or not - a system-generated audit
    trail (see services.register_failed_login / generate_and_send_otp /
    verify_otp). Never hand-created, so add is disabled; kept fully
    read-only so nobody can quietly edit history.
    """
    list_display = ("username_attempted", "user", "result_badge", "ip_address", "created_at")
    list_filter = ("result",)
    search_fields = ("username_attempted", "ip_address", "user__username", "user__first_name", "user__last_name")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    list_per_page = 50
    show_full_result_count = False
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in LoginAttemptLog._meta.fields]

    @admin.display(description="Result")
    def result_badge(self, obj):
        return _badge(obj.get_result_display(), LOGIN_RESULT_COLORS.get(obj.result, "#616161"))

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# ---------------------------------------------------------------------------
# 2. SCHOOL / ACADEMIC CALENDAR
# ---------------------------------------------------------------------------


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
    list_display = ("__str__", "grade_level", "stream", "academic_year", "class_teacher", "student_count", "promoted_badge")
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

    @admin.display(description="Promoted?")
    def promoted_badge(self, obj):
        record = getattr(obj, "promotion_record", None)
        if not record:
            return "—"
        target = record.target_classroom or "Graduated"
        return _badge(f"-> {target}", "#1565c0")


@admin.register(ClassroomPromotion)
class ClassroomPromotionAdmin(admin.ModelAdmin):
    """
    One row per source classroom that has been bulk-promoted (see
    services.bulk_promote_classroom_auto). Its existence is what blocks a
    second bulk-promote run against the same classroom - the "Undo" action
    on the API (ClassroomPromotionViewSet.undo) deletes this row to clear
    that guard, so keep deletion available here too for support cases.
    """
    list_display = ("source_classroom", "target_or_graduated", "student_count", "promoted_by", "promoted_at")
    list_filter = ("promoted_at",)
    search_fields = (
        "source_classroom__grade_level__name", "source_classroom__stream__name",
        "target_classroom__grade_level__name", "target_classroom__stream__name",
    )
    autocomplete_fields = ("source_classroom", "target_classroom", "promoted_by")
    list_select_related = (
        "source_classroom__grade_level", "source_classroom__stream",
        "target_classroom__grade_level", "target_classroom__stream", "promoted_by",
    )
    date_hierarchy = "promoted_at"

    @admin.display(description="Promoted To")
    def target_or_graduated(self, obj):
        return str(obj.target_classroom) if obj.target_classroom else _badge("GRADUATED", "#6a1b9a")


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
# 5. SUBJECTS (CBC Pathways + 8-4-4 Elective Groups/Tracks)
# ---------------------------------------------------------------------------
class SubjectPaperInline(admin.TabularInline):
    model = SubjectPaper
    extra = 0


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "curriculum_type", "has_papers", "pathway", "elective_group")
    list_filter = ("curriculum_type", "has_papers", "pathway", "elective_group")
    search_fields = ("name", "code")
    autocomplete_fields = ("pathway", "elective_group")
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
        "grade_level", "requires_pathway", "min_optional_subjects", "max_optional_subjects",
        "min_total_subjects", "max_total_subjects",
    )
    list_filter = ("requires_pathway",)
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


@admin.register(Pathway)
class PathwayAdmin(admin.ModelAdmin):
    """CBC pathway (STEM / Social Sciences / Arts & Sports Science) that a Subject or SubjectSelectionRule can require."""
    list_display = ("name", "code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
    ordering = ("name",)


@admin.register(SubjectGroup)
class SubjectGroupAdmin(admin.ModelAdmin):
    """8-4-4 elective category (Technical / Humanities / Sciences) - used by SelectionTrack/TrackGroupRule, fully independent of CBC Pathway."""
    list_display = ("name", "code")
    search_fields = ("name", "code")
    ordering = ("name",)


class TrackGroupRuleInline(admin.TabularInline):
    model = TrackGroupRule
    extra = 0
    autocomplete_fields = ("group",)


@admin.register(SelectionTrack)
class SelectionTrackAdmin(admin.ModelAdmin):
    """One allowed 8-4-4 elective 'path' at a grade, e.g. Form 3's 'Technical + Humanities' vs 'Triple Science'."""
    list_display = ("grade_level", "name", "is_active")
    list_filter = ("is_active", "grade_level__curriculum_type", "grade_level")
    search_fields = ("name", "grade_level__name")
    autocomplete_fields = ("grade_level",)
    inlines = [TrackGroupRuleInline]


@admin.register(TrackGroupRule)
class TrackGroupRuleAdmin(admin.ModelAdmin):
    list_display = ("track", "group", "min_choose", "max_choose")
    list_filter = ("group",)
    search_fields = ("track__name", "group__name")
    autocomplete_fields = ("track", "group")


# ---------------------------------------------------------------------------
# 6. TEACHER ALLOCATION
# ---------------------------------------------------------------------------
@admin.register(TeacherSubjectAllocation)
class TeacherSubjectAllocationAdmin(admin.ModelAdmin):
    list_display = ("teacher", "subject", "classroom", "academic_year", "periods_per_week", "double_lesson")
    list_filter = ("academic_year", "subject__curriculum_type", "double_lesson")
    search_fields = (
        "teacher__first_name", "teacher__last_name", "teacher__username",
        "subject__name", "subject__code", "classroom__grade_level__name",
    )
    autocomplete_fields = ("teacher", "subject", "classroom", "academic_year")
    list_select_related = ("teacher", "subject", "classroom__grade_level", "classroom__stream")
    list_per_page = 50


# ---------------------------------------------------------------------------
# 7. TIMETABLE
# ---------------------------------------------------------------------------
@admin.register(PeriodSlot)
class PeriodSlotAdmin(admin.ModelAdmin):
    """
    The shared weekly structure (one row per day+order) that every
    classroom's timetable is built from - see the bulk-set endpoint on
    PeriodSlotViewSet for the usual way this gets edited (Structure Setup
    tab), rather than row by row here.
    """
    list_display = ("day", "order", "slot_type", "label", "start_time", "end_time")
    list_filter = ("day", "slot_type")
    search_fields = ("label",)
    ordering = ("day", "order")


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = (
        "classroom", "term", "period_slot", "allocation", "is_double", "auto_generated_badge",
    )
    list_filter = ("term__academic_year", "auto_generated", "is_double", "period_slot__day")
    search_fields = (
        "classroom__grade_level__name", "classroom__stream__name",
        "allocation__subject__name", "allocation__teacher__first_name", "allocation__teacher__last_name",
    )
    autocomplete_fields = ("classroom", "period_slot", "term", "allocation")
    list_select_related = (
        "classroom__grade_level", "classroom__stream", "period_slot", "term__academic_year",
        "allocation__subject", "allocation__teacher",
    )
    list_per_page = 50
    show_full_result_count = False

    @admin.display(description="Origin", boolean=False)
    def auto_generated_badge(self, obj):
        return _badge("Auto", "#1565c0") if obj.auto_generated else _badge("Manual", "#757575")


# ---------------------------------------------------------------------------
# 8. EXAMS, RESULTS, GRADING, RANKING
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
# 9. PROMOTION RULES
# ---------------------------------------------------------------------------
@admin.register(PromotionRule)
class PromotionRuleAdmin(admin.ModelAdmin):
    list_display = ("grade_level", "minimum_average_percentage", "minimum_subjects_passed", "pass_mark_percentage")
    autocomplete_fields = ("grade_level",)


# ---------------------------------------------------------------------------
# 10. FEES (incl. M-Pesa STK push trail + missing-fee-structure alerts)
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


class MpesaSTKPushRequestInline(admin.TabularInline):
    """
    Read-only trail of Daraja push attempts against this invoice. These are
    system-generated (initiated via services.initiate_payment(), updated by
    the callback view), so they're not meant to be hand-edited from here.
    """
    model = MpesaSTKPushRequest
    extra = 0
    fields = ("phone_number", "amount", "status", "checkout_request_id", "result_description", "created_at")
    readonly_fields = ("phone_number", "amount", "status", "checkout_request_id", "result_description", "created_at")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "__str__", "enrollment", "fee_structure", "brought_forward",
        "amount_due", "amount_paid", "balance_display",
    )
    list_filter = ("fee_structure__term__academic_year", "fee_structure__grade_level")
    search_fields = ("enrollment__student__admission_no", "enrollment__student__user__first_name", "enrollment__student__user__last_name")
    autocomplete_fields = ("enrollment", "fee_structure")
    list_select_related = ("enrollment__student", "fee_structure__grade_level", "fee_structure__term")
    list_per_page = 50
    show_full_result_count = False
    inlines = [PaymentInline, MpesaSTKPushRequestInline]

    @admin.display(description="Balance")
    def balance_display(self, obj):
        balance = obj.balance
        color = "#c62828" if balance > 0 else "#2e7d32"
        return format_html('<b style="color:{}">KES {}</b>', color, f"{balance:,.0f}")

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


@admin.register(MpesaSTKPushRequest)
class MpesaSTKPushRequestAdmin(admin.ModelAdmin):
    list_display = (
        "checkout_request_id", "invoice", "phone_number", "amount",
        "status_badge", "initiated_by", "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = (
        "checkout_request_id", "merchant_request_id", "phone_number",
        "invoice__enrollment__student__admission_no",
        "invoice__enrollment__student__user__first_name", "invoice__enrollment__student__user__last_name",
    )
    autocomplete_fields = ("invoice", "initiated_by")
    list_select_related = ("invoice__enrollment__student", "initiated_by")
    list_per_page = 50
    show_full_result_count = False
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Status")
    def status_badge(self, obj):
        return _badge(obj.get_status_display(), STK_STATUS_COLORS.get(obj.status, "#616161"))


@admin.register(FeeStructureMissingAlert)
class FeeStructureMissingAlertAdmin(admin.ModelAdmin):
    """
    Raised automatically by services.generate_invoices_for_term whenever a
    (grade_level, term) has active students but no FeeStructure configured.
    Auto-resolves once ICT/Finance adds the missing FeeStructure and the
    engine successfully invoices that grade/term - the action below is a
    manual override for support cases only.
    """
    list_display = ("grade_level", "term", "affected_student_count", "resolved_badge", "first_detected_at", "last_checked_at")
    list_filter = ("is_resolved", "term__academic_year", "grade_level__curriculum_type")
    search_fields = ("grade_level__name",)
    autocomplete_fields = ("grade_level", "term")
    list_select_related = ("grade_level", "term__academic_year")
    date_hierarchy = "first_detected_at"
    actions = ["mark_resolved"]

    @admin.display(description="Status")
    def resolved_badge(self, obj):
        return _badge("Resolved", "#2e7d32") if obj.is_resolved else _badge("Open", "#c62828")

    @admin.action(description="Mark selected alerts as resolved")
    def mark_resolved(self, request, queryset):
        from django.utils import timezone as _tz
        updated = queryset.update(is_resolved=True, resolved_at=_tz.now())
        self.message_user(request, f"{updated} alert(s) marked resolved.")


# ---------------------------------------------------------------------------
# 11. COMMUNICATIONS & MESSAGING
# ---------------------------------------------------------------------------
@admin.register(Communication)
class CommunicationAdmin(admin.ModelAdmin):
    """
    Admin/Finance broadcasts (see services.send_communication). Normally
    created via the Communications page, not here, but kept editable for
    support/debugging - creating one here does NOT re-send it, since
    dispatch only happens inside CommunicationCreateSerializer.create().
    """
    list_display = ("subject", "category", "audience_type", "sender", "recipient_count", "created_at")
    list_filter = ("category", "audience_type", "send_in_app", "send_sms", "send_email")
    search_fields = ("subject", "body", "sender__first_name", "sender__last_name")
    autocomplete_fields = ("sender", "academic_year", "grade_level", "classroom")
    filter_horizontal = ("target_students",)
    list_select_related = ("sender", "academic_year", "grade_level", "classroom")
    date_hierarchy = "created_at"

    @admin.display(description="Recipients")
    def recipient_count(self, obj):
        return obj.recipients.values("user_id").distinct().count()


@admin.register(CommunicationRecipient)
class CommunicationRecipientAdmin(admin.ModelAdmin):
    """Per-(communication, user, channel) delivery record - also what powers each user's navbar bell for the IN_APP channel. Can grow large, so paginated and read-mostly."""
    list_display = ("communication", "user", "channel", "status_badge", "is_read", "sent_at")
    list_filter = ("channel", "status", "is_read")
    search_fields = (
        "communication__subject", "user__first_name", "user__last_name", "user__username", "error_message",
    )
    autocomplete_fields = ("communication", "user")
    list_select_related = ("communication", "user")
    list_per_page = 50
    show_full_result_count = False

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {"PENDING": "#ef6c00", "SENT": "#2e7d32", "FAILED": "#c62828"}
        return _badge(obj.get_status_display(), colors.get(obj.status, "#616161"))


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """1:1 thread, e.g. a class teacher and a parent discussing their child."""
    list_display = ("id", "participant_names", "student", "created_at")
    search_fields = (
        "participants__first_name", "participants__last_name", "participants__username",
        "student__admission_no", "student__user__first_name", "student__user__last_name",
    )
    autocomplete_fields = ("student",)
    filter_horizontal = ("participants",)
    date_hierarchy = "created_at"

    @admin.display(description="Participants")
    def participant_names(self, obj):
        return ", ".join(u.get_full_name() or u.username for u in obj.participants.all()[:3])


@admin.register(DirectMessage)
class DirectMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "sender", "body_preview", "created_at")
    search_fields = ("body", "sender__first_name", "sender__last_name", "sender__username")
    autocomplete_fields = ("conversation", "sender")
    list_select_related = ("conversation", "sender")
    list_per_page = 50
    show_full_result_count = False
    date_hierarchy = "created_at"

    @admin.display(description="Message")
    def body_preview(self, obj):
        return (obj.body[:60] + "…") if len(obj.body) > 60 else obj.body


# ---------------------------------------------------------------------------
# 12. LICENSING (SaaS plan tiers, upgrade tokens, subscription packages)
# ---------------------------------------------------------------------------
from django.utils import timezone
from django.contrib import messages
from . import models


@admin.register(models.School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "county", "school_type", "license_tier", "license_status")
    search_fields = ("name", "knec_code")

    def license_tier(self, obj):
        return getattr(obj, "license", None) and obj.license.get_tier_display()

    def license_status(self, obj):
        lic = getattr(obj, "license", None)
        if not lic:
            return "No license"
        if lic.is_suspended:
            return "SUSPENDED"
        if lic.is_expired:
            return "EXPIRED"
        return "Active"


@admin.register(models.License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ("school", "tier", "max_students", "max_classrooms_per_year",
                     "max_teachers", "valid_until", "is_suspended")
    list_filter = ("tier", "is_suspended")
    search_fields = ("school__name",)
    actions = ["suspend_selected", "reinstate_selected", "reset_to_tier_defaults"]

    def suspend_selected(self, request, queryset):
        for lic in queryset:
            lic.is_suspended = True
            lic.save()
            models.LicenseAuditLog.objects.create(
                school=lic.school, action=models.LicenseAuditLog.Action.SUSPENDED,
                performed_by=request.user,
            )
        self.message_user(request, f"Suspended {queryset.count()} license(s).", messages.WARNING)

    def reinstate_selected(self, request, queryset):
        for lic in queryset:
            lic.is_suspended = False
            lic.save()
            models.LicenseAuditLog.objects.create(
                school=lic.school, action=models.LicenseAuditLog.Action.REINSTATED,
                performed_by=request.user,
            )
        self.message_user(request, f"Reinstated {queryset.count()} license(s).")

    def reset_to_tier_defaults(self, request, queryset):
        for lic in queryset:
            lic.apply_tier_defaults()
            lic.save()
        self.message_user(request, "Limits reset to tier defaults.")


@admin.register(models.LicenseToken)
class LicenseTokenAdmin(admin.ModelAdmin):
    """
    Your day-to-day workflow: school pays -> you come here -> "Add license token"
    -> pick school + tier + duration -> Save -> copy the generated token string
    from the list -> send it to the school admin.
    """
    list_display = ("token_short", "school", "tier", "valid_months", "is_redeemed", "is_active", "issued_at")
    list_filter = ("tier", "is_active")
    readonly_fields = ("token", "redeemed_at", "redeemed_by")
    search_fields = ("school__name", "token")

    def token_short(self, obj):
        return f"{obj.token[:16]}..."

    def is_redeemed(self, obj):
        return obj.is_redeemed
    is_redeemed.boolean = True

    def save_model(self, request, obj, form, change):
        if not change:
            obj.issued_by = obj.issued_by or request.user.get_full_name()
        super().save_model(request, obj, form, change)
        if not change and obj.school:
            models.LicenseAuditLog.objects.create(
                school=obj.school, action=models.LicenseAuditLog.Action.ISSUED,
                detail=f"Token issued for {obj.get_tier_display()}, {obj.valid_months} months.",
                performed_by=request.user,
            )


@admin.register(models.LicenseAuditLog)
class LicenseAuditLogAdmin(admin.ModelAdmin):
    list_display = ("school", "action", "detail", "performed_by", "created_at")
    list_filter = ("action",)
    readonly_fields = [f.name for f in models.LicenseAuditLog._meta.fields]
    search_fields = ("school__name",)

    def has_add_permission(self, request):
        return False


@admin.register(models.SubscriptionPackage)
class SubscriptionPackageAdmin(admin.ModelAdmin):
    """
    Where you actually set/adjust pricing - one row per tier. Edit
    monthly_price or the limit fields here and the License page picks it
    up immediately (no deploy). Untick is_active to pull a package off
    the Available Packages tab without deleting its history.
    """
    list_display = (
        "tier", "price_display", "max_students", "max_classrooms_per_year",
        "max_teachers", "active_badge", "display_order",
    )
    list_filter = ("tier", "is_active")
    search_fields = ("tier",)
    ordering = ("display_order", "monthly_price")
    list_editable = ("display_order",)

    @admin.display(description="Monthly Price")
    def price_display(self, obj):
        return f"KES {obj.monthly_price:,.0f}"

    @admin.display(description="Status")
    def active_badge(self, obj):
        return _badge("Active", "#2e7d32") if obj.is_active else _badge("Hidden", "#757575")