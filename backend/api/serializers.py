from django.contrib.auth import password_validation
from rest_framework import serializers
from decimal import Decimal

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
    password = serializers.CharField(write_only=True)

    class Meta:
        model = models.User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone_number", "national_id", "password",
        ]

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

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
    """Used by the admin 'admit new student' endpoint - creates User + StudentProfile + Enrollment together."""

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
        user.set_password(admission_no.replace("/", "-"))
        user.save()

        profile = models.StudentProfile.objects.create(
            user=user,
            admission_no=admission_no,
            gender=validated_data["gender"],
            date_of_birth=validated_data.get("date_of_birth"),
            curriculum_type=validated_data["curriculum_type"],
            upi_number=validated_data.get("upi_number", ""),
        )
        models.Enrollment.objects.create(
            student=profile, classroom=classroom, academic_year=classroom.academic_year,
        )
        return profile

    def to_representation(self, instance):
        enrollment = instance.current_enrollment
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
    percentage = serializers.ReadOnlyField()

    class Meta:
        model = models.ExamResult
        fields = "__all__"
        read_only_fields = ["entered_by", "entered_at"]

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