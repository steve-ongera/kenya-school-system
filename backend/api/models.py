"""
School Management System - Models
Supports Kenyan high schools running BOTH:
  - CBC (Junior Secondary Grade 9, Senior Secondary Grade 10-12)
  - 8-4-4 (legacy, Form 1-4)
side by side, since schools currently have both cohorts of learners.
"""
import uuid
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# 1. IDENTITY & RBAC
# ---------------------------------------------------------------------------
class User(AbstractUser):
    """
    Custom user used for authentication ONLY.
    NOTE: admission_no is NOT here - it lives on StudentProfile.
    A user's login identity (id/username/email) must never be the same
    field as the school admission number, because admission numbers are
    school-business data (reused in reports, printed on report forms,
    sometimes re-issued) while the user id is a system identity.
    """

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrator"
        TEACHER = "TEACHER", "Teacher"
        STUDENT = "STUDENT", "Student"
        PARENT = "PARENT", "Parent/Guardian"
        FINANCE = "FINANCE", "Finance Officer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=Role.choices)
    phone_number = models.CharField(max_length=20, blank=True)
    national_id = models.CharField(max_length=20, blank=True, null=True, unique=True)
    is_active_staff = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    ROLES_REQUIRING_2FA = ("ADMIN", "TEACHER", "FINANCE")

    # --- brute-force protection ---
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_failed_login_at = models.DateTimeField(null=True, blank=True)

    # --- 2FA (OTP) ---
    otp_code = models.CharField(max_length=6, blank=True, null=True)
    otp_expires_at = models.DateTimeField(null=True, blank=True)

    # --- student-only password reset ---
    password_reset_token = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    password_reset_expires_at = models.DateTimeField(null=True, blank=True)

    

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"
    
    @property
    def requires_2fa(self):
            return self.role in self.ROLES_REQUIRING_2FA
    
    @property
    def is_locked(self):
            return bool(self.locked_until and self.locked_until > timezone.now())


class LoginAttemptLog(models.Model):
    """
    Every login/OTP attempt, successful or not. Powers the admin
    'Security' view and is what notify_admins_* references back to.
    """

    class Result(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        BAD_PASSWORD = "BAD_PASSWORD", "Bad Password"
        UNKNOWN_USER = "UNKNOWN_USER", "Unknown Username"
        INVALID_FORMAT = "INVALID_FORMAT", "Invalid Username Format"
        ACCOUNT_LOCKED = "ACCOUNT_LOCKED", "Blocked - Account Locked"
        OTP_SENT = "OTP_SENT", "OTP Sent"
        OTP_SUCCESS = "OTP_SUCCESS", "OTP Verified"
        OTP_FAILED = "OTP_FAILED", "OTP Incorrect/Expired"

    username_attempted = models.CharField(max_length=50)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="login_attempts")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    result = models.CharField(max_length=20, choices=Result.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "login_attempt_logs"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"])]

    def __str__(self):
        return f"{self.username_attempted} - {self.result} @ {self.created_at:%Y-%m-%d %H:%M}"

# ---------------------------------------------------------------------------
# 2. SCHOOL / ACADEMIC CALENDAR
# ---------------------------------------------------------------------------
class School(models.Model):
    class SchoolType(models.TextChoices):
        MIXED = "MIXED", "Mixed"
        BOYS = "BOYS", "Boys"
        GIRLS = "GIRLS", "Girls"

    name = models.CharField(max_length=150)
    school_type = models.CharField(max_length=10, choices=SchoolType.choices, default=SchoolType.MIXED)
    knec_code = models.CharField(max_length=30, blank=True)
    county = models.CharField(max_length=60, blank=True)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to="school/", blank=True, null=True)

    class Meta:
        db_table = "schools"

    def __str__(self):
        return self.name


class AcademicYear(models.Model):
    year = models.PositiveIntegerField(unique=True)  # e.g. 2026
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "academic_years"
        ordering = ["-year"]

    def __str__(self):
        return str(self.year)

    def save(self, *args, **kwargs):
        # only one academic year may be "current"
        if self.is_current:
            AcademicYear.objects.exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class Term(models.Model):
    class TermNumber(models.IntegerChoices):
        TERM_1 = 1, "Term 1"
        TERM_2 = 2, "Term 2"
        TERM_3 = 3, "Term 3"

    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="terms")
    term_number = models.PositiveSmallIntegerField(choices=TermNumber.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "terms"
        unique_together = ("academic_year", "term_number")
        ordering = ["academic_year__year", "term_number"]

    def __str__(self):
        return f"{self.get_term_number_display()} - {self.academic_year}"

    def save(self, *args, **kwargs):
        if self.is_current:
            Term.objects.exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# 3. CURRICULUM / GRADE STRUCTURE (supports CBC + 8-4-4 simultaneously)
# ---------------------------------------------------------------------------
class CurriculumType(models.TextChoices):
    CBC = "CBC", "Competency Based Curriculum"
    LEGACY_844 = "8-4-4", "8-4-4 (Legacy)"


class GradeLevel(models.Model):
    """
    e.g. Grade 9 (CBC, Junior Secondary), Grade 10 (CBC, Senior Secondary),
    Form 1 (8-4-4), Form 4 (8-4-4).
    `level_order` gives the promotion sequence WITHIN a curriculum_type.
    """

    class EducationLevel(models.TextChoices):
        JUNIOR_SECONDARY = "JSS", "Junior Secondary"
        SENIOR_SECONDARY = "SSS", "Senior Secondary"
        LEGACY_SECONDARY = "LEGACY", "Secondary (8-4-4)"

    name = models.CharField(max_length=50)  # "Grade 9", "Form 2"
    curriculum_type = models.CharField(max_length=10, choices=CurriculumType.choices)
    education_level = models.CharField(max_length=10, choices=EducationLevel.choices)
    level_order = models.PositiveSmallIntegerField(
        help_text="Sequence for promotion, e.g. Grade9=9, Grade10=10, Form1=101, Form2=102"
    )
    next_grade = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="previous_grade"
    )

    class Meta:
        db_table = "grade_levels"
        unique_together = ("name", "curriculum_type")
        ordering = ["curriculum_type", "level_order"]

    def __str__(self):
        return f"{self.name} ({self.get_curriculum_type_display()})"


class Stream(models.Model):
    """Red / Blue / Green etc. A stream label is reusable across grades & years."""

    name = models.CharField(max_length=40)  # "Red", "Blue"

    class Meta:
        db_table = "streams"

    def __str__(self):
        return self.name


class ClassRoom(models.Model):
    """
    A concrete, enrollable class for one academic year, e.g.
    'Grade 9 Red - 2026' or 'Form 2 Blue - 2026'.
    Marks/attendance/fees for a student always reference the ClassRoom
    they were in for that academic year - so promoting a student to a
    new ClassRoom next year does not touch old records.
    """

    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="classrooms")
    stream = models.ForeignKey(Stream, on_delete=models.CASCADE, related_name="classrooms")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="classrooms")
    class_teacher = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="classes_as_teacher", limit_choices_to={"role": User.Role.TEACHER},
    )

    class Meta:
        db_table = "classrooms"
        unique_together = ("grade_level", "stream", "academic_year")

    def __str__(self):
        return f"{self.grade_level.name} {self.stream.name} ({self.academic_year.year})"


# ---------------------------------------------------------------------------
# 4. STUDENTS, GUARDIANS, ENROLLMENT HISTORY
# ---------------------------------------------------------------------------
class StudentProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="student_profile")
    admission_no = models.CharField(max_length=30, unique=True, db_index=True)
    gender = models.CharField(max_length=1, choices=Gender.choices)
    date_of_birth = models.DateField(null=True, blank=True)
    curriculum_type = models.CharField(max_length=10, choices=CurriculumType.choices)
    date_admitted = models.DateField(default=timezone.now)
    upi_number = models.CharField(max_length=20, blank=True, help_text="NEMIS/UPI number")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "student_profiles"

    def __str__(self):
        return f"{self.admission_no} - {self.user.get_full_name()}"

    @property
    def current_enrollment(self):
        return self.enrollments.filter(academic_year__is_current=True).first()


class ParentGuardianProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="parent_profile")
    students = models.ManyToManyField(StudentProfile, through="ParentStudentLink", related_name="guardians")

    class Meta:
        db_table = "parent_profiles"

    def __str__(self):
        return self.user.get_full_name()


class ParentStudentLink(models.Model):
    class Relationship(models.TextChoices):
        MOTHER = "MOTHER", "Mother"
        FATHER = "FATHER", "Father"
        GUARDIAN = "GUARDIAN", "Guardian"

    parent = models.ForeignKey(ParentGuardianProfile, on_delete=models.CASCADE)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    relationship = models.CharField(max_length=20, choices=Relationship.choices)

    class Meta:
        db_table = "parent_student_links"
        unique_together = ("parent", "student")


class Enrollment(models.Model):
    """
    ONE ROW PER STUDENT PER ACADEMIC YEAR.
    This is the historical backbone: a student promoted from Grade 9 to
    Grade 10 gets a NEW Enrollment row for the new year/classroom; the old
    row (and everything FK'd to it - results, fees) is untouched.
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        PROMOTED = "PROMOTED", "Promoted"
        REPEATED = "REPEATED", "Repeated"
        GRADUATED = "GRADUATED", "Graduated"
        TRANSFERRED_OUT = "TRANSFERRED_OUT", "Transferred Out"
        DROPPED = "DROPPED", "Dropped"

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="enrollments")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="enrollments")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="enrollments")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    promoted_from = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="promoted_to"
    )
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "enrollments"
        unique_together = ("student", "academic_year")

    def __str__(self):
        return f"{self.student.admission_no} -> {self.classroom} [{self.status}]"


# ---------------------------------------------------------------------------
# 5. SUBJECTS (compulsory/optional, min/max selection, papers pp1/pp2)
# ---------------------------------------------------------------------------
class Subject(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    curriculum_type = models.CharField(max_length=10, choices=CurriculumType.choices)
    has_papers = models.BooleanField(
        default=False, help_text="e.g. Mathematics PP1/PP2, English PP1/PP2/PP3"
    )

    class Meta:
        db_table = "subjects"
        unique_together = ("code", "curriculum_type")

    def __str__(self):
        return f"{self.name} ({self.get_curriculum_type_display()})"


class SubjectPaper(models.Model):
    """Only used when Subject.has_papers = True. e.g. PP1, PP2."""

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="papers")
    paper_number = models.PositiveSmallIntegerField()  # 1, 2, 3...
    name = models.CharField(max_length=50)  # "Paper 1", "PP2"
    max_marks = models.PositiveIntegerField(default=100)

    class Meta:
        db_table = "subject_papers"
        unique_together = ("subject", "paper_number")
        ordering = ["subject", "paper_number"]

    def __str__(self):
        return f"{self.subject.code} - {self.name}"


class GradeSubject(models.Model):
    """
    Which subjects are offered at a given grade, and whether compulsory.
    e.g. Grade 9 English = compulsory, Grade 10 French = optional.
    """

    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="grade_subjects")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="grade_subjects")
    is_compulsory = models.BooleanField(default=False)

    class Meta:
        db_table = "grade_subjects"
        unique_together = ("grade_level", "subject")

    def __str__(self):
        return f"{self.grade_level} - {self.subject} ({'Compulsory' if self.is_compulsory else 'Optional'})"


class SubjectSelectionRule(models.Model):
    """
    e.g. At Grade 10, on top of compulsory subjects, a student must pick
    a MIN of 2 and MAX of 4 from the optional pool.
    """

    grade_level = models.OneToOneField(GradeLevel, on_delete=models.CASCADE, related_name="selection_rule")
    min_optional_subjects = models.PositiveSmallIntegerField(default=0)
    max_optional_subjects = models.PositiveSmallIntegerField(default=0)
    min_total_subjects = models.PositiveSmallIntegerField(default=7)
    max_total_subjects = models.PositiveSmallIntegerField(default=9)

    class Meta:
        db_table = "subject_selection_rules"

    def __str__(self):
        return f"Selection rule for {self.grade_level}"


class StudentSubjectSelection(models.Model):
    """The actual subjects a student is registered for, in a given academic year."""

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="subject_selections")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)

    class Meta:
        db_table = "student_subject_selections"
        unique_together = ("enrollment", "subject")

    def __str__(self):
        return f"{self.enrollment.student.admission_no} - {self.subject.code}"


# ---------------------------------------------------------------------------
# 6. TEACHER ALLOCATION
# ---------------------------------------------------------------------------
class TeacherSubjectAllocation(models.Model):
    """
    A teacher can be allocated the SAME subject in MULTIPLE classrooms,
    e.g. Grade 9 Red English AND Grade 9 Green English -> two rows.
    """

    teacher = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="teaching_allocations",
        limit_choices_to={"role": User.Role.TEACHER},
    )
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="allocations")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="allocations")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="allocations")
    
    periods_per_week = models.PositiveSmallIntegerField(
        default=5, help_text="How many lesson periods/week this allocation needs."
    )
    double_lesson = models.BooleanField(
        default=False,
        help_text="Schedule periods in consecutive pairs (e.g. double Maths) instead of singles.",
    )


    class Meta:
        db_table = "teacher_subject_allocations"
        unique_together = ("teacher", "subject", "classroom", "academic_year")

    def __str__(self):
        return f"{self.teacher} -> {self.subject.code} @ {self.classroom}"


# ---------------------------------------------------------------------------
# 7. EXAMS, RESULTS, GRADING, RANKING
# ---------------------------------------------------------------------------
class ExamType(models.Model):
    """Opening Exam, Midterm Exam, End-term Exam, CAT... configurable per school."""

    name = models.CharField(max_length=50, unique=True)
    weight = models.DecimalField(
        max_digits=5, decimal_places=2, default=1,
        help_text="Relative weight when combining exams for term ranking",
    )
    order = models.PositiveSmallIntegerField(default=1, help_text="Sequence within the term")
    counts_towards_midterm_rank = models.BooleanField(default=False)
    counts_towards_endterm_rank = models.BooleanField(default=True)

    class Meta:
        db_table = "exam_types"
        ordering = ["order"]

    def __str__(self):
        return self.name


class Exam(models.Model):
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="exams")
    exam_type = models.ForeignKey(ExamType, on_delete=models.CASCADE, related_name="exams")
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="exams")
    name = models.CharField(max_length=120)
    start_date = models.DateField()
    end_date = models.DateField()
    is_published = models.BooleanField(default=False)

    class Meta:
        db_table = "exams"
        unique_together = ("term", "exam_type", "grade_level")

    def __str__(self):
        return f"{self.name} - {self.grade_level} - {self.term}"


class ExamResult(models.Model):
    """
    One row per student per subject (+ optional paper) per exam.
    entered_by / entered_at gives an audit trail since teachers key in marks
    from their own portal.
    """

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="results")
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="exam_results")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="results")
    paper = models.ForeignKey(SubjectPaper, on_delete=models.CASCADE, null=True, blank=True, related_name="results")
    marks_obtained = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    max_marks = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    is_absent = models.BooleanField(default=False)
    entered_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="results_entered"
    )
    entered_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_results"
        unique_together = ("exam", "enrollment", "subject", "paper")

    def __str__(self):
        return f"{self.enrollment.student.admission_no} - {self.subject.code} - {self.marks_obtained}"

    @property
    def percentage(self):
        if self.is_absent or self.marks_obtained is None or not self.max_marks:
            return None
        return round((self.marks_obtained / self.max_marks) * 100, 2)


class GradingScale(models.Model):
    """
    Grading differs per subject/curriculum, e.g. CBC uses Exceeding/Meeting/
    Approaching/Below Expectation while 8-4-4 uses A-E with points.
    If `subject` is null the scale applies as the curriculum-wide default.
    """

    curriculum_type = models.CharField(max_length=10, choices=CurriculumType.choices)
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, null=True, blank=True, related_name="grading_scales"
    )
    min_percentage = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(0)])
    max_percentage = models.DecimalField(max_digits=5, decimal_places=2, validators=[MaxValueValidator(100)])
    grade_letter = models.CharField(max_length=10)  # "A", "E.E", "B-"
    points = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    remark = models.CharField(max_length=60, blank=True)

    class Meta:
        db_table = "grading_scales"
        ordering = ["curriculum_type", "-min_percentage"]

    def __str__(self):
        return f"{self.grade_letter} ({self.min_percentage}-{self.max_percentage}%)"


class TermPositionRanking(models.Model):
    """
    Cached/computed ranking snapshot for a student in a classroom for a
    term, at a given ranking checkpoint (midterm or endterm).
    Recomputed by services.rank_classroom() whenever marks change.
    """

    class Checkpoint(models.TextChoices):
        MIDTERM = "MIDTERM", "Midterm Ranking"
        ENDTERM = "ENDTERM", "End of Term Ranking"

    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="rankings")
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="rankings")
    checkpoint = models.CharField(max_length=10, choices=Checkpoint.choices)
    total_marks = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    average_marks = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    class_position = models.PositiveIntegerField(null=True, blank=True)
    grade_position = models.PositiveIntegerField(null=True, blank=True, help_text="Rank across the whole grade (all streams)")
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "term_position_rankings"
        unique_together = ("term", "enrollment", "checkpoint")

    def __str__(self):
        return f"{self.enrollment.student.admission_no} - {self.term} - {self.checkpoint}: #{self.class_position}"


# ---------------------------------------------------------------------------
# 8. PROMOTION RULES
# ---------------------------------------------------------------------------
class PromotionRule(models.Model):
    """Minimum performance required at Grade X to be promoted to the next grade."""

    grade_level = models.OneToOneField(GradeLevel, on_delete=models.CASCADE, related_name="promotion_rule")
    minimum_average_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    minimum_subjects_passed = models.PositiveSmallIntegerField(default=0)
    pass_mark_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=30,
        help_text="Percentage below which a subject is considered failed",
    )

    class Meta:
        db_table = "promotion_rules"

    def __str__(self):
        return f"Promotion rule for {self.grade_level}"


# ---------------------------------------------------------------------------
# 9. FEES
# ---------------------------------------------------------------------------
class FeeStructure(models.Model):
    """Fee structure differs by grade AND term AND academic year."""

    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="fee_structures")
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="fee_structures")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "fee_structures"
        unique_together = ("grade_level", "term")

    def __str__(self):
        return f"{self.grade_level} - {self.term}: KES {self.total_amount}"


class FeeStructureItem(models.Model):
    """Line-item breakdown, e.g. Tuition, Boarding, Activity fee, Lunch."""

    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "fee_structure_items"


class Invoice(models.Model):
    """
    One invoice per (enrollment, fee_structure) - i.e. per student per term.
    `brought_forward` is the balance carried in from ALL previous terms at
    the moment this invoice was generated: positive = arrears the student
    still owed, negative = credit/overpayment that reduces what's due this
    term. See services.generate_invoice() / services.get_outstanding_balance().
    """
 
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="invoices")
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name="invoices")
    brought_forward = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Balance carried in from previous terms. Positive=arrears, negative=credit.",
    )
    amount_due = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    issued_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        db_table = "invoices"
        unique_together = ("enrollment", "fee_structure")
 
    @property
    def balance(self):
        """Positive = still owing. Negative = this invoice is itself in credit (rare, but possible on a big overpayment)."""
        return self.amount_due - self.amount_paid
 
    @property
    def term_charge(self):
        """This term's fee alone, excluding whatever was brought forward."""
        return self.amount_due - self.brought_forward
 
    def __str__(self):
        return f"Invoice {self.id} - {self.enrollment.student.admission_no}"
 
 
class Payment(models.Model):
    class Method(models.TextChoices):
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank"
        CASH = "CASH", "Cash"
        CHEQUE = "CHEQUE", "Cheque"
 
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    receipt_no = models.CharField(max_length=30, null=True, editable=False)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=10, choices=Method.choices)
    reference = models.CharField(max_length=60, blank=True, help_text="M-Pesa code, bank slip no, etc.")
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="payments_recorded")
    paid_at = models.DateTimeField(default=timezone.now)
 
    class Meta:
        db_table = "payments"
 
    def __str__(self):
        return f"KES {self.amount} - {self.invoice.enrollment.student.admission_no} ({self.receipt_no})"
 
 
class MpesaSTKPushRequest(models.Model):
    """
    Tracks a real Safaricom Daraja STK push from initiation to callback.
    Only used when settings.DEBUG is False - see services.initiate_payment().
    In DEBUG, payments bypass this entirely and are recorded immediately.
    """
 
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"
 
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="stk_requests")
    phone_number = models.CharField(max_length=15)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    checkout_request_id = models.CharField(max_length=60, unique=True, null=True, blank=True)
    merchant_request_id = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    result_description = models.CharField(max_length=200, blank=True)
    initiated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="stk_requests_initiated")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
 
    class Meta:
        db_table = "mpesa_stk_push_requests"
 
    def __str__(self):
        return f"STK {self.checkout_request_id} - KES {self.amount} [{self.status}]"
 
 

class FeeStructureMissingAlert(models.Model):
    """
    Raised automatically by the invoice generation engine (see
    services.generate_invoices_for_term) whenever a (grade_level, term)
    combination has active students but NO FeeStructure has been
    configured for it yet.

    The student/parent portal reads this via GET /fees/status/ to show
    "kindly check with the ICT/Finance office for your class" instead of
    silently showing an empty fees page.

    One row per (grade_level, term) - re-running the engine daily just
    refreshes last_checked_at / affected_student_count on the same row
    rather than creating duplicates. Once ICT adds the missing
    FeeStructure and the engine successfully generates invoices for that
    grade/term, the alert is auto-resolved.
    """

    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.CASCADE, related_name="fee_alerts"
    )
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="fee_alerts")
    affected_student_count = models.PositiveIntegerField(default=0)
    is_resolved = models.BooleanField(default=False)
    first_detected_at = models.DateTimeField(auto_now_add=True)
    last_checked_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "fee_structure_missing_alerts"
        unique_together = ("grade_level", "term")
        ordering = ["-last_checked_at"]

    def __str__(self):
        status = "RESOLVED" if self.is_resolved else "OPEN"
        return f"[{status}] {self.grade_level} - {self.term} ({self.affected_student_count} students)"
    
    
    
# ===========================================================================
# 10. COMMUNICATIONS & MESSAGING
# Append this whole section to the end of models.py.
#
# Two distinct features sharing the same file:
#   - Communication / CommunicationRecipient: ADMIN/FINANCE broadcast a
#     message to an audience (by role, grade+year, classroom, or hand-picked
#     students) over in-app / SMS / email. CommunicationRecipient is the
#     per-person, per-channel delivery record - it's also what powers the
#     navbar notification bell for EVERY user, since it's just "my in-app
#     rows".
#   - Conversation / DirectMessage: 1:1 threads, e.g. a class teacher
#     messaging a parent about their child. Only staff (Admin/Teacher/
#     Finance) can start a thread; parents/students can only reply within
#     threads they're already part of.
# ===========================================================================
class Communication(models.Model):
    class AudienceType(models.TextChoices):
        ROLE = "ROLE", "By Role"
        GRADE = "GRADE", "By Grade / Academic Year"
        CLASSROOM = "CLASSROOM", "By Classroom"
        INDIVIDUAL = "INDIVIDUAL", "Specific Students"

    class Category(models.TextChoices):
        GENERAL = "GENERAL", "General Announcement"
        EVENT = "EVENT", "Event / Visiting Day"
        CLOSING = "CLOSING", "School Closing"
        FEE_REMINDER = "FEE_REMINDER", "Fee Balance Reminder"
        ACADEMIC = "ACADEMIC", "Academic"

    sender = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="communications_sent"
    )
    subject = models.CharField(max_length=150)
    body = models.TextField()
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.GENERAL)

    audience_type = models.CharField(max_length=20, choices=AudienceType.choices)
    # For AudienceType.ROLE - list of User.Role values, e.g. ["TEACHER"]
    target_roles = models.JSONField(default=list, blank=True)
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.SET_NULL, null=True, blank=True, related_name="communications"
    )
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.SET_NULL, null=True, blank=True, related_name="communications"
    )
    classroom = models.ForeignKey(
        ClassRoom, on_delete=models.SET_NULL, null=True, blank=True, related_name="communications"
    )
    target_students = models.ManyToManyField(StudentProfile, blank=True, related_name="communications_targeted")

    include_students = models.BooleanField(default=True, help_text="Send to the students themselves.")
    include_guardians = models.BooleanField(default=False, help_text="Also send to each student's parent/guardian.")

    send_in_app = models.BooleanField(default=True)
    send_sms = models.BooleanField(default=False)
    send_email = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communications"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} ({self.get_audience_type_display()})"


class CommunicationRecipient(models.Model):
    """One row per (communication, recipient, channel) - the delivery record for that channel, and (for IN_APP) the navbar notification itself."""

    class Channel(models.TextChoices):
        IN_APP = "IN_APP", "In-App"
        SMS = "SMS", "SMS"
        EMAIL = "EMAIL", "Email"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    communication = models.ForeignKey(Communication, on_delete=models.CASCADE, related_name="recipients")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="communications_received")
    channel = models.CharField(max_length=10, choices=Channel.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    is_read = models.BooleanField(default=False, help_text="Only meaningful for the IN_APP channel.")
    # Per-recipient rendered body - lets a FEE_REMINDER communication show
    # each guardian THEIR child's actual balance instead of the generic body.
    personalized_body = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error_message = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "communication_recipients"
        unique_together = ("communication", "user", "channel")
        indexes = [models.Index(fields=["user", "channel", "is_read"])]
        ordering = ["-communication__created_at"]

    def __str__(self):
        return f"{self.communication.subject} -> {self.user} [{self.channel}]"


class Conversation(models.Model):
    """A 1:1 thread - e.g. a class teacher and a parent discussing their child. `student` is optional context (which child the thread concerns)."""

    participants = models.ManyToManyField(User, related_name="conversations")
    student = models.ForeignKey(
        StudentProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name="conversations"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "conversations"
        ordering = ["-created_at"]

    def __str__(self):
        names = ", ".join(u.get_full_name() or u.username for u in self.participants.all()[:3])
        return f"Conversation #{self.id} ({names})"


class DirectMessage(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="direct_messages_sent")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    read_by = models.ManyToManyField(User, blank=True, related_name="direct_messages_read")

    class Meta:
        db_table = "direct_messages"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender} in Conversation #{self.conversation_id}"