from django.contrib.auth import password_validation
from rest_framework import serializers

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
    gender = serializers.ChoiceField(choices=models.StudentProfile.Gender.choices)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    curriculum_type = serializers.ChoiceField(choices=models.CurriculumType.choices)
    classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    upi_number = serializers.CharField(required=False, allow_blank=True)

    def create(self, validated_data):
        classroom = validated_data.pop("classroom_id")
        year = classroom.academic_year.year
        admission_no = services.generate_admission_no(year)

        user = models.User.objects.create(
            username=admission_no.replace("/", "-"),
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            role=models.User.Role.STUDENT,
        )
        user.set_password(admission_no.replace("/", "-"))  # default password = username; must change on first login
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
    balance = serializers.ReadOnlyField()

    class Meta:
        model = models.Invoice
        fields = "__all__"


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Payment
        fields = "__all__"
        read_only_fields = ["recorded_by"]