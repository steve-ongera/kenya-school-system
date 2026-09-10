from django.contrib.auth import password_validation
from rest_framework import serializers
from decimal import Decimal
from django.db.models import Count
from . import utils
from . import models, services


# ---------------------------------------------------------------------------
# USERS / AUTH
# ---------------------------------------------------------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone_number", "national_id", "is_active_staff",
        ]
        read_only_fields = ["id"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = models.User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone_number", "national_id", "password",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = models.User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class StudentProfileMiniSerializer(serializers.ModelSerializer):
    """Read-only slice of StudentProfile exposed on the unified /profile/me/ endpoint."""

    class Meta:
        model = models.StudentProfile
        fields = ["admission_no", "gender", "date_of_birth", "curriculum_type", "upi_number"]


class ProfileSerializer(serializers.ModelSerializer):
    """
    Read view of 'my own profile', for ANY role. Nests the student-specific
    fields (admission_no, gender, dob, curriculum) when the user is a student,
    so one endpoint serves every portal.
    """

    student_profile = serializers.SerializerMethodField()

    class Meta:
        model = models.User
        fields = [
            "id", "username", "first_name", "last_name", "role",
            "email", "phone_number", "national_id", "student_profile",
        ]
        read_only_fields = fields

    def get_student_profile(self, obj):
        profile = getattr(obj, "student_profile", None)
        return StudentProfileMiniSerializer(profile).data if profile else None


class ProfileUpdateSerializer(serializers.Serializer):
    """
    Self-service update: only NON-CRITICAL fields. Deliberately excludes
    username, role, admission_no, first_name/last_name - those are admin-only
    changes (see UserViewSet / StudentEnrollSerializer).
    """

    email = serializers.EmailField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True, max_length=20)
    national_id = serializers.CharField(required=False, allow_blank=True, max_length=20)
    # only meaningful for students - service layer ignores these for other roles
    gender = serializers.ChoiceField(choices=models.StudentProfile.Gender.choices, required=False)
    date_of_birth = serializers.DateField(required=False, allow_null=True)

    def validate_national_id(self, value):
        if not value:
            return value
        request = self.context.get("request")
        qs = models.User.objects.filter(national_id=value)
        if request is not None:
            qs = qs.exclude(pk=request.user.pk)
        if qs.exists():
            raise serializers.ValidationError("This national ID is already registered to another account.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField()

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value


# ---------------------------------------------------------------------------
# SCHOOL / CALENDAR
# ---------------------------------------------------------------------------
class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.School
        fields = "__all__"


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AcademicYear
        fields = "__all__"


class TermSerializer(serializers.ModelSerializer):
    academic_year_label = serializers.CharField(source="academic_year.year", read_only=True)

    class Meta:
        model = models.Term
        fields = "__all__"


# ---------------------------------------------------------------------------
# CURRICULUM / GRADE STRUCTURE
# ---------------------------------------------------------------------------
class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.GradeLevel
        fields = "__all__"


class StreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Stream
        fields = "__all__"


class ClassRoomSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    stream_name = serializers.CharField(source="stream.name", read_only=True)
    class_teacher_name = serializers.CharField(source="class_teacher.get_full_name", read_only=True)
    student_count = serializers.SerializerMethodField()
    academic_year_year = serializers.IntegerField(source="academic_year.year", read_only=True)
    academic_year_is_current = serializers.BooleanField(source="academic_year.is_current", read_only=True)

    class Meta:
        model = models.ClassRoom
        fields = "__all__"

    def get_student_count(self, obj):
        return obj.enrollments.filter(status=models.Enrollment.Status.ACTIVE).count()

# ---------------------------------------------------------------------------
# STUDENTS / GUARDIANS / ENROLLMENT
# ---------------------------------------------------------------------------
class StudentProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    current_classroom = serializers.SerializerMethodField()

    class Meta:
        model = models.StudentProfile
        fields = "__all__"

    def get_current_classroom(self, obj):
        enrollment = obj.current_enrollment
        return str(enrollment.classroom) if enrollment else None


class StudentEnrollSerializer(serializers.Serializer):
    """Used by the admin 'admit new student' endpoint - creates User + StudentProfile + Enrollment (+ parent/guardian) together."""

    first_name = serializers.CharField()
    last_name = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True, max_length=20)
    national_id = serializers.CharField(required=False, allow_blank=True, max_length=20)
    gender = serializers.ChoiceField(choices=models.StudentProfile.Gender.choices)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    curriculum_type = serializers.ChoiceField(choices=models.CurriculumType.choices)
    classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    upi_number = serializers.CharField(required=False, allow_blank=True)

    # Parent/guardian - optional, but strongly recommended so fee
    # notifications and communication have somewhere to go.
    parent_name = serializers.CharField(required=False, allow_blank=True)
    parent_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    parent_relationship = serializers.ChoiceField(
        choices=models.ParentStudentLink.Relationship.choices,
        required=False,
        default=models.ParentStudentLink.Relationship.GUARDIAN,
    )

    def validate_national_id(self, value):
        if not value:
            return value
        if models.User.objects.filter(national_id=value).exists():
            raise serializers.ValidationError("This national ID is already registered to another account.")
        return value

    def validate_classroom_id(self, value):
        """
        Guards against admitting a student into a classroom from a
        non-current academic year (e.g. 2023) - which silently produces a
        student whose current_classroom never shows up anywhere, since
        StudentProfile.current_enrollment filters on
        academic_year__is_current=True. Catching it here means this can't
        happen again even if the frontend dropdown ever regresses.
        """
        if not value.academic_year.is_current:
            raise serializers.ValidationError(
                f"'{value}' belongs to {value.academic_year.year}, which is not the current "
                "academic year. Choose a classroom from the current academic year."
            )
        return value

    def create(self, validated_data):
        classroom = validated_data.pop("classroom_id")
        parent_name = validated_data.pop("parent_name", "").strip()
        parent_phone = validated_data.pop("parent_phone", "").strip()
        parent_relationship = validated_data.pop(
            "parent_relationship", models.ParentStudentLink.Relationship.GUARDIAN
        )

        year = classroom.academic_year.year
        admission_no = services.generate_admission_no(year)

        user = models.User.objects.create(
            username=admission_no.replace("/", "-"),
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            email=validated_data.get("email", ""),
            phone_number=validated_data.get("phone_number", ""),
            national_id=validated_data.get("national_id") or None,
            role=models.User.Role.STUDENT,
        )
        # Fixed default password for every new student - "password123" -
        # matching services.reset_student_password()'s own default, so
        # there's exactly one default password for the front desk to
        # remember, instead of the admission number (which changes per
        # student and is easy to mistype when read out verbally).
        user.set_password("password123")
        user.save()

        profile = models.StudentProfile.objects.create(
            user=user,
            admission_no=admission_no,
            gender=validated_data["gender"],
            date_of_birth=validated_data.get("date_of_birth"),
            curriculum_type=validated_data["curriculum_type"],
            upi_number=validated_data.get("upi_number", ""),
        )
        enrollment = models.Enrollment.objects.create(
            student=profile, classroom=classroom, academic_year=classroom.academic_year,
        )

        # Link (or create) the parent/guardian, if one was provided at
        # the admission desk.
        if parent_phone:
            services.attach_guardian(profile, parent_name, parent_phone, parent_relationship)

        # Invoice the student for the current term right away, so admitting
        # someone mid-term (e.g. a walk-in admission today) doesn't leave
        # them without a fee statement until tomorrow's scheduled run.
        # If the current term's FeeStructure for this grade isn't set up
        # yet, this quietly raises the same FeeStructureMissingAlert the
        # daily engine would - it never blocks admission.
        current_term = models.Term.objects.filter(is_current=True).first()
        if current_term:
            try:
                services.generate_invoice(enrollment, current_term)
            except ValueError:
                services._record_missing_fee_structure(classroom.grade_level, current_term)

        return profile

    def to_representation(self, instance):
        enrollment = instance.current_enrollment
        guardian_link = models.ParentStudentLink.objects.filter(
            student=instance
        ).select_related("parent__user").first()
        return {
            "id": instance.id,
            "admission_no": instance.admission_no,
            "username": instance.user.username,
            "full_name": instance.user.get_full_name(),
            "email": instance.user.email,
            "phone_number": instance.user.phone_number,
            "national_id": instance.user.national_id,
            "gender": instance.gender,
            "date_of_birth": instance.date_of_birth,
            "curriculum_type": instance.curriculum_type,
            "upi_number": instance.upi_number,
            "current_classroom": str(enrollment.classroom) if enrollment else None,
            "guardian": {
                "name": guardian_link.parent.user.get_full_name(),
                "phone_number": guardian_link.parent.user.phone_number,
                "relationship": guardian_link.get_relationship_display(),
            } if guardian_link else None,
        }
        

class ParentGuardianProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = models.ParentGuardianProfile
        fields = "__all__"


class ParentStudentLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ParentStudentLink
        fields = "__all__"


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="student.admission_no", read_only=True)
    classroom_label = serializers.CharField(source="classroom.__str__", read_only=True)

    class Meta:
        model = models.Enrollment
        fields = "__all__"


class PromoteSerializer(serializers.Serializer):
    target_classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    force = serializers.BooleanField(default=False)


class BulkPromoteSerializer(serializers.Serializer):
    source_classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    target_classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    force = serializers.BooleanField(default=False)


# ---------------------------------------------------------------------------
# SUBJECTS
# ---------------------------------------------------------------------------
class SubjectPaperSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubjectPaper
        fields = "__all__"


class SubjectSerializer(serializers.ModelSerializer):
    papers = SubjectPaperSerializer(many=True, read_only=True)

    class Meta:
        model = models.Subject
        fields = "__all__"


class GradeSubjectSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = models.GradeSubject
        fields = "__all__"


class SubjectSelectionRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubjectSelectionRule
        fields = "__all__"


class SetStudentSubjectsSerializer(serializers.Serializer):
    subject_ids = serializers.ListField(child=serializers.IntegerField())


class StudentSubjectSelectionSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = models.StudentSubjectSelection
        fields = "__all__"


# ---------------------------------------------------------------------------
# TEACHER ALLOCATION
# ---------------------------------------------------------------------------
class TeacherSubjectAllocationSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.get_full_name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    classroom_label = serializers.CharField(source="classroom.__str__", read_only=True)

    class Meta:
        model = models.TeacherSubjectAllocation
        fields = "__all__"


# ---------------------------------------------------------------------------
# EXAMS / RESULTS / GRADING / RANKING
# ---------------------------------------------------------------------------
class ExamTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ExamType
        fields = "__all__"


class ExamSerializer(serializers.ModelSerializer):
    exam_type_name = serializers.CharField(source="exam_type.name", read_only=True)
    term_label = serializers.CharField(source="term.__str__", read_only=True)

    class Meta:
        model = models.Exam
        fields = "__all__"



class ExamResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="enrollment.student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="enrollment.student.admission_no", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    paper_name = serializers.SerializerMethodField()
    percentage = serializers.ReadOnlyField()
 
    class Meta:
        model = models.ExamResult
        fields = "__all__"
        read_only_fields = ["entered_by", "entered_at"]
 
    def get_paper_name(self, obj):
        return obj.paper.name if obj.paper_id else None
 
    def validate(self, attrs):
        marks = attrs.get("marks_obtained")
        max_marks = attrs.get("max_marks", 100)
        is_absent = attrs.get("is_absent", False)
        if not is_absent:
            if marks is None:
                raise serializers.ValidationError("marks_obtained is required unless is_absent is true.")
            if marks < 0 or marks > max_marks:
                raise serializers.ValidationError("marks_obtained must be between 0 and max_marks.")
        return attrs
 


class BulkExamResultRowSerializer(serializers.Serializer):
    """One row of a bulk mark-entry sheet submitted by a teacher."""

    enrollment_id = serializers.IntegerField()
    marks_obtained = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    is_absent = serializers.BooleanField(default=False)


class BulkExamResultSerializer(serializers.Serializer):
    exam_id = serializers.IntegerField()
    subject_id = serializers.IntegerField()
    paper_id = serializers.IntegerField(required=False, allow_null=True)
    max_marks = serializers.DecimalField(max_digits=6, decimal_places=2, default=100)
    rows = BulkExamResultRowSerializer(many=True)


class GradingScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.GradingScale
        fields = "__all__"


class TermPositionRankingSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="enrollment.student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="enrollment.student.admission_no", read_only=True)
    classroom_label = serializers.CharField(source="enrollment.classroom.__str__", read_only=True)

    class Meta:
        model = models.TermPositionRanking
        fields = "__all__"


class RankRequestSerializer(serializers.Serializer):
    term_id = serializers.IntegerField()
    classroom_id = serializers.IntegerField(required=False)
    grade_level_id = serializers.IntegerField(required=False)
    checkpoint = serializers.ChoiceField(choices=models.TermPositionRanking.Checkpoint.choices)


# ---------------------------------------------------------------------------
# PROMOTION RULES
# ---------------------------------------------------------------------------
class PromotionRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PromotionRule
        fields = "__all__"


# ---------------------------------------------------------------------------
# FEES
# ---------------------------------------------------------------------------
class FeeStructureItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.FeeStructureItem
        fields = "__all__"
 
 
class FeeStructureSerializer(serializers.ModelSerializer):
    items = FeeStructureItemSerializer(many=True, required=False)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    term_label = serializers.CharField(source="term.__str__", read_only=True)
 
    class Meta:
        model = models.FeeStructure
        fields = "__all__"
 
    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        fee_structure = models.FeeStructure.objects.create(**validated_data)
        for item in items_data:
            models.FeeStructureItem.objects.create(fee_structure=fee_structure, **item)
        return fee_structure
 
 
class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="enrollment.student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="enrollment.student.admission_no", read_only=True)
    term_label = serializers.CharField(source="fee_structure.term.__str__", read_only=True)
    grade_level_name = serializers.CharField(source="fee_structure.grade_level.name", read_only=True)
    balance = serializers.ReadOnlyField()
    term_charge = serializers.ReadOnlyField()
    payments = serializers.SerializerMethodField()
 
    class Meta:
        model = models.Invoice
        fields = "__all__"
 
    def get_payments(self, obj):
        return PaymentSerializer(obj.payments.order_by("-paid_at"), many=True).data
 
 
class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Payment
        fields = "__all__"
        read_only_fields = ["recorded_by", "receipt_no"]
 
 
class InitiatePaymentSerializer(serializers.Serializer):
    """Used by students/parents/finance to pay an invoice - partial or full, via STK push (or the DEBUG bypass)."""
 
    invoice_id = serializers.IntegerField()
    phone_number = serializers.CharField(max_length=15)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("1"))
 
    def validate_phone_number(self, value):
        cleaned = value.strip().replace(" ", "").replace("+", "")
        if cleaned.startswith("0") and len(cleaned) == 10:
            cleaned = "254" + cleaned[1:]
        if not (cleaned.startswith("254") and len(cleaned) == 12 and cleaned.isdigit()):
            raise serializers.ValidationError(
                "Enter a valid Kenyan phone number, e.g. 07XXXXXXXX or 2547XXXXXXXX."
            )
        return cleaned
 
 
class ReceiptSerializer(serializers.Serializer):
    """Shape returned by GET /payments/{id}/receipt/ and the public verify endpoint."""
 
    receipt_no = serializers.CharField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    method = serializers.CharField()
    reference = serializers.CharField()
    paid_at = serializers.DateTimeField()
    student_name = serializers.CharField()
    admission_no = serializers.CharField()
    term = serializers.CharField()
    qr_code_base64 = serializers.CharField(required=False)
    
    
    
    
# ===========================================================================
# ADD THESE TO serializers.py
# (password_validation is already imported at the top of the file)
#
# Where to put them: right after your existing StudentProfileSerializer.
# They do NOT replace StudentProfileSerializer — that one still powers the
# list view. These power the View/Edit modals and the reset-password action.
# ===========================================================================


class StudentUserSerializer(serializers.ModelSerializer):
    """
    Nested user-account fields, editable alongside a StudentProfile.
    `username` is deliberately read-only here: it's set once, at admission,
    to equal admission_no (see StudentEnrollSerializer.create()), and must
    never drift out of sync with it. If it ever needs to change, that has
    to happen together with admission_no via a dedicated admin action, not
    through this general-purpose edit form.
    """

    class Meta:
        model = models.User
        fields = ["username", "email", "first_name", "last_name", "phone_number", "national_id"]
        read_only_fields = ["username"]


class StudentProfileDetailSerializer(serializers.ModelSerializer):
    """
    Full view used by the admin View/Edit modals: the student profile
    together with its linked user account, nested under `user`.

    GET   -> everything needed to populate a "view" or "edit" modal.
    PATCH -> updates both StudentProfile fields AND the nested User fields
             in one call, so the admin can edit "the student" as one unit
             instead of juggling two separate forms/requests.

    Password is intentionally NOT settable here — use
    /students/{id}/reset_password/ instead, so password changes always go
    through one auditable, single-purpose path.
    """

    user = StudentUserSerializer()
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    current_classroom = serializers.SerializerMethodField()

    class Meta:
        model = models.StudentProfile
        fields = [
            "id", "user", "admission_no", "full_name", "gender", "date_of_birth",
            "curriculum_type", "date_admitted", "upi_number", "is_active", "current_classroom",
        ]
        read_only_fields = ["admission_no", "date_admitted"]

    def get_current_classroom(self, obj):
        enrollment = obj.current_enrollment
        return str(enrollment.classroom) if enrollment else None

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        if user_data:
            user = instance.user
            for field in ("email", "first_name", "last_name", "phone_number", "national_id"):
                if field in user_data:
                    setattr(user, field, user_data[field])
            user.save()
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class ResetStudentPasswordSerializer(serializers.Serializer):
    """
    POST body for /students/{id}/reset_password/.
    Leave new_password blank to reset back to the default used on
    admission (the admission number itself) — doubles as a plain
    "forgot password" reset with no extra endpoint needed.
    """

    new_password = serializers.CharField(required=False, allow_blank=True)

    def validate_new_password(self, value):
        if value:
            password_validation.validate_password(value)
        return value
    
    
class BulkCreateClassroomsSerializer(serializers.Serializer):
    """
    POST body: { "academic_year": 4, "grade_level_ids": [1,2,3,4], "stream_ids": [1,2,3,4] }
    Creates the cross-product of grades x streams for that year in one call.
    """
    academic_year = serializers.PrimaryKeyRelatedField(queryset=models.AcademicYear.objects.all())
    grade_level_ids = serializers.PrimaryKeyRelatedField(
        queryset=models.GradeLevel.objects.all(), many=True
    )
    stream_ids = serializers.PrimaryKeyRelatedField(
        queryset=models.Stream.objects.all(), many=True
    )

    def create(self, validated_data):
        result = services.bulk_create_classrooms(
            academic_year=validated_data["academic_year"],
            grade_level_ids=[g.id for g in validated_data["grade_level_ids"]],
            stream_ids=[s.id for s in validated_data["stream_ids"]],
        )
        return result
    
    
    
class ClassroomStudentSerializer(serializers.ModelSerializer):
    """
    Full student detail used by the classroom View modal's roster + CSV
    export - flattens the User account fields onto the student row and
    nests each linked parent/guardian's contact details.
    """

    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    national_id = serializers.CharField(source="user.national_id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    guardians = serializers.SerializerMethodField()

    class Meta:
        model = models.StudentProfile
        fields = [
            "id", "admission_no", "username", "full_name", "email", "phone_number",
            "national_id", "gender", "date_of_birth", "curriculum_type", "upi_number",
            "is_active", "date_admitted", "guardians",
        ]

    def get_guardians(self, obj):
        links = models.ParentStudentLink.objects.filter(student=obj).select_related("parent__user")
        return [
            {
                "name": link.parent.user.get_full_name(),
                "relationship": link.get_relationship_display(),
                "phone_number": link.parent.user.phone_number,
                "email": link.parent.user.email,
            }
            for link in links
        ]
        
        

# ===========================================================================
# ADD TO serializers.py, directly after the existing PaymentSerializer.
# Read-only, enriched view of a Payment for the Finance "all payments" list:
# who the student is, their own phone, their guardian's name/phone, which
# class/term/year the payment's invoice belongs to, and who recorded it
# (front-desk staff for manual entries, or the student/parent themselves
# for a self-service STK push - see services.initiate_payment).
# ===========================================================================
class PaymentListSerializer(serializers.ModelSerializer):
    admission_no = serializers.CharField(source="invoice.enrollment.student.admission_no", read_only=True)
    student_name = serializers.CharField(
        source="invoice.enrollment.student.user.get_full_name", read_only=True
    )
    student_phone = serializers.CharField(
        source="invoice.enrollment.student.user.phone_number", read_only=True
    )
    classroom = serializers.CharField(source="invoice.enrollment.classroom.__str__", read_only=True)
    academic_year = serializers.IntegerField(source="invoice.enrollment.academic_year.year", read_only=True)
    term = serializers.CharField(source="invoice.fee_structure.term.__str__", read_only=True)
    guardian_name = serializers.SerializerMethodField()
    guardian_phone = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    recorded_by_role = serializers.SerializerMethodField()

    class Meta:
        model = models.Payment
        fields = [
            "id", "paid_at", "amount", "method", "reference", "receipt_no",
            "admission_no", "student_name", "student_phone",
            "guardian_name", "guardian_phone",
            "classroom", "academic_year", "term",
            "recorded_by_name", "recorded_by_role",
        ]

    def _guardian_link(self, obj):
        student = obj.invoice.enrollment.student
        return models.ParentStudentLink.objects.filter(student=student).select_related("parent__user").first()

    def get_guardian_name(self, obj):
        link = self._guardian_link(obj)
        return link.parent.user.get_full_name() if link else None

    def get_guardian_phone(self, obj):
        link = self._guardian_link(obj)
        return link.parent.user.phone_number if link else None

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() if obj.recorded_by else "Self-service (STK push)"

    def get_recorded_by_role(self, obj):
        return obj.recorded_by.get_role_display() if obj.recorded_by else None
    
    
    

# ===========================================================================
# COMMUNICATIONS & MESSAGING 
# ===========================================================================

# ---- bulk Communication (Admin/Finance broadcast) --------------------------
class CommunicationCreateSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=150)
    body = serializers.CharField()
    category = serializers.ChoiceField(choices=models.Communication.Category.choices, default=models.Communication.Category.GENERAL)

    audience_type = serializers.ChoiceField(choices=models.Communication.AudienceType.choices)
    target_roles = serializers.ListField(child=serializers.ChoiceField(choices=models.User.Role.choices), required=False, default=list)
    academic_year_id = serializers.PrimaryKeyRelatedField(queryset=models.AcademicYear.objects.all(), required=False, allow_null=True)
    grade_level_id = serializers.PrimaryKeyRelatedField(queryset=models.GradeLevel.objects.all(), required=False, allow_null=True)
    classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all(), required=False, allow_null=True)
    target_student_ids = serializers.PrimaryKeyRelatedField(
        queryset=models.StudentProfile.objects.all(), many=True, required=False, default=list
    )

    include_students = serializers.BooleanField(default=True)
    include_guardians = serializers.BooleanField(default=False)
    send_in_app = serializers.BooleanField(default=True)
    send_sms = serializers.BooleanField(default=False)
    send_email = serializers.BooleanField(default=False)

    def validate(self, attrs):
        audience = attrs["audience_type"]
        if audience == models.Communication.AudienceType.ROLE and not attrs.get("target_roles"):
            raise serializers.ValidationError("Select at least one role for a role-based announcement.")
        if audience == models.Communication.AudienceType.GRADE and not attrs.get("grade_level_id"):
            raise serializers.ValidationError("Select a grade level.")
        if audience == models.Communication.AudienceType.CLASSROOM and not attrs.get("classroom_id"):
            raise serializers.ValidationError("Select a classroom.")
        if audience == models.Communication.AudienceType.INDIVIDUAL and not attrs.get("target_student_ids"):
            raise serializers.ValidationError("Select at least one student.")
        if not (attrs.get("send_in_app") or attrs.get("send_sms") or attrs.get("send_email")):
            raise serializers.ValidationError("Choose at least one channel: in-app, SMS, or email.")
        if not (attrs.get("include_students") or attrs.get("include_guardians")):
            raise serializers.ValidationError("Choose at least one of: send to students, send to guardians.")
        return attrs

    def create(self, validated_data):
        target_students = validated_data.pop("target_student_ids", [])
        communication = models.Communication.objects.create(
            sender=self.context["request"].user,
            subject=validated_data["subject"],
            body=validated_data["body"],
            category=validated_data["category"],
            audience_type=validated_data["audience_type"],
            target_roles=validated_data.get("target_roles", []),
            academic_year=validated_data.get("academic_year_id"),
            grade_level=validated_data.get("grade_level_id"),
            classroom=validated_data.get("classroom_id"),
            include_students=validated_data["include_students"],
            include_guardians=validated_data["include_guardians"],
            send_in_app=validated_data["send_in_app"],
            send_sms=validated_data["send_sms"],
            send_email=validated_data["send_email"],
        )
        if target_students:
            communication.target_students.set(target_students)
        services.send_communication(communication)
        return communication


class CommunicationSerializer(serializers.ModelSerializer):
    """Read view for the communications log - shows what was sent and delivery counts per channel."""

    sender_name = serializers.CharField(source="sender.get_full_name", read_only=True)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    classroom_label = serializers.CharField(source="classroom.__str__", read_only=True)
    academic_year_year = serializers.IntegerField(source="academic_year.year", read_only=True)
    recipient_count = serializers.SerializerMethodField()
    delivery_summary = serializers.SerializerMethodField()

    class Meta:
        model = models.Communication
        fields = [
            "id", "subject", "body", "category", "audience_type", "target_roles",
            "academic_year", "academic_year_year", "grade_level", "grade_level_name",
            "classroom", "classroom_label", "include_students", "include_guardians",
            "send_in_app", "send_sms", "send_email", "sender_name", "created_at",
            "recipient_count", "delivery_summary",
        ]

    def get_recipient_count(self, obj):
        return obj.recipients.values("user_id").distinct().count()

    def get_delivery_summary(self, obj):
        rows = obj.recipients.values("channel", "status").annotate(count=Count("id"))
        summary = {}
        for row in rows:
            summary.setdefault(row["channel"], {}).update({row["status"]: row["count"]})
        return summary


# ---- Notifications (navbar bell) -------------------------------------------
class NotificationSerializer(serializers.ModelSerializer):
    """One row = one in-app CommunicationRecipient - what the navbar bell renders."""

    subject = serializers.CharField(source="communication.subject", read_only=True)
    category = serializers.CharField(source="communication.category", read_only=True)
    body = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source="communication.created_at", read_only=True)
    sender_name = serializers.CharField(source="communication.sender.get_full_name", read_only=True)

    class Meta:
        model = models.CommunicationRecipient
        fields = ["id", "subject", "body", "category", "sender_name", "is_read", "created_at"]

    def get_body(self, obj):
        return obj.personalized_body or obj.communication.body


# ---- Direct Messaging (1:1 threads) ----------------------------------------
class ConversationParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.User
        fields = ["id", "first_name", "last_name", "role"]


class DirectMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.get_full_name", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = models.DirectMessage
        fields = ["id", "conversation", "sender", "sender_name", "body", "created_at", "is_read"]
        read_only_fields = ["sender"]

    def get_is_read(self, obj):
        request = self.context.get("request")
        return request.user in obj.read_by.all() if request else False


class ConversationSerializer(serializers.ModelSerializer):
    participants = ConversationParticipantSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True, default=None)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = models.Conversation
        fields = ["id", "participants", "student", "student_name", "created_at", "last_message", "unread_count"]

    def get_last_message(self, obj):
        last = obj.messages.order_by("-created_at").first()
        if not last:
            return None
        return {"body": last.body, "sender_name": last.sender.get_full_name() if last.sender else "", "created_at": last.created_at}

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request:
            return 0
        return obj.messages.exclude(read_by=request.user).exclude(sender=request.user).count()


class ConversationCreateSerializer(serializers.Serializer):
    """POST { recipient_id, student_id?, body } - starts a thread and sends the first message in one call."""

    recipient_id = serializers.PrimaryKeyRelatedField(queryset=models.User.objects.all())
    student_id = serializers.PrimaryKeyRelatedField(queryset=models.StudentProfile.objects.all(), required=False, allow_null=True)
    body = serializers.CharField()

    def validate(self, attrs):
        sender = self.context["request"].user
        recipient = attrs["recipient_id"]
        if recipient.role not in (models.User.Role.PARENT, models.User.Role.STUDENT):
            raise serializers.ValidationError("You can only start a conversation with a student or parent/guardian.")
        student = attrs.get("student_id")
        if sender.role == models.User.Role.TEACHER and student is not None:
            if not utils.teacher_can_message_student(sender, student):
                raise serializers.ValidationError("You are not allocated to this student's class or subject.")
        return attrs

    def create(self, validated_data):
        sender = self.context["request"].user
        recipient = validated_data["recipient_id"]
        student = validated_data.get("student_id")

        # reuse an existing thread between the same two people about the
        # same student, instead of spawning a duplicate every time.
        existing = (
            models.Conversation.objects.filter(participants=sender)
            .filter(participants=recipient)
            .filter(student=student)
            .first()
        )
        conversation = existing or models.Conversation.objects.create(student=student)
        if not existing:
            conversation.participants.set([sender, recipient])

        message = models.DirectMessage.objects.create(conversation=conversation, sender=sender, body=validated_data["body"])
        message.read_by.add(sender)
        return conversation