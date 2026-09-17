from django.contrib.auth import password_validation
from rest_framework import serializers
from decimal import Decimal
from django.db.models import Count
from django.db import transaction

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


class LoginRequestSerializer(serializers.Serializer):
    # hard length cap rejects the "600-character garbage username" case
    # before it ever touches the database
    username = serializers.CharField(max_length=utils.USERNAME_MAX_LENGTH, trim_whitespace=True)
    password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate_username(self, value):
        try:
            return services.validate_login_username(value)
        except ValueError:
            raise serializers.ValidationError("Invalid username format.")


class VerifyOtpSerializer(serializers.Serializer):
    challenge_token = serializers.CharField(max_length=200, trim_whitespace=True)
    otp_code = serializers.RegexField(
        r"^\d{6}$",
        trim_whitespace=True,
        error_messages={"invalid": "Enter the 6-digit code."},
    )


class ForgotPasswordRequestSerializer(serializers.Serializer):
    admission_no = serializers.CharField(max_length=30)


class ResetPasswordConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=64)
    new_password = serializers.CharField()

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value


class LockedUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.User
        fields = ["id", "username", "first_name", "last_name", "role", "failed_login_attempts", "locked_until"]


class LoginAttemptLogSerializer(serializers.ModelSerializer):
    user_full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_role = serializers.CharField(source="user.role", read_only=True)

    class Meta:
        model = models.LoginAttemptLog
        fields = [
            "id", "username_attempted", "user", "user_full_name", "user_role",
            "ip_address", "result", "created_at",
        ]


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
    curriculum_type = serializers.CharField(source="grade_level.curriculum_type", read_only=True)
    curriculum_display = serializers.CharField(source="grade_level.get_curriculum_type_display", read_only=True)
    stream_name = serializers.CharField(source="stream.name", read_only=True)
    class_teacher_name = serializers.CharField(source="class_teacher.get_full_name", read_only=True)
    student_count = serializers.SerializerMethodField()
    academic_year_year = serializers.IntegerField(source="academic_year.year", read_only=True)
    academic_year_is_current = serializers.BooleanField(source="academic_year.is_current", read_only=True)
    # Lets the frontend show "Promoted -> Grade 10 (2027)" or "Graduated"
    # on a past classroom instead of just an empty student_count.
    is_promoted = serializers.SerializerMethodField()
    promoted_to_label = serializers.SerializerMethodField()

    class Meta:
        model = models.ClassRoom
        fields = "__all__"

    def get_student_count(self, obj):
        # Deliberately ACTIVE-only: this is "how many students are sitting
        # in this class right now", used on the live Classes page. It
        # correctly goes to 0 once the class is promoted - the /students/
        # roster endpoint must NOT use this same filter, or it will hide
        # the historical list entirely.
        return obj.enrollments.filter(status=models.Enrollment.Status.ACTIVE).count()

    def get_is_promoted(self, obj):
        return hasattr(obj, "promotion_record")

    def get_promoted_to_label(self, obj):
        record = getattr(obj, "promotion_record", None)
        if not record:
            return None
        return str(record.target_classroom) if record.target_classroom else "Graduated"


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

    # For migrating a student who already has an admission number and a
    # real admission date from a previous system. Leave both blank for a
    # genuinely new admission: admission_no auto-generates as normal, and
    # date_admitted defaults to today (the model's own default).
    admission_no = serializers.CharField(
        required=False, allow_blank=True, max_length=30,
        help_text="Leave blank to auto-generate. Provide one only when migrating an "
                   "already-admitted student from a previous system.",
    )
    date_admitted = serializers.DateField(
        required=False, allow_null=True,
        help_text="Leave blank to default to today. Provide the original admission date "
                   "when migrating an already-admitted student.",
    )

    parent_name = serializers.CharField(required=False, allow_blank=True)
    parent_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    parent_email = serializers.EmailField(required=False, allow_blank=True)
    parent_relationship = serializers.ChoiceField(
        choices=models.ParentStudentLink.Relationship.choices,
        required=False,
        default=models.ParentStudentLink.Relationship.GUARDIAN,
    )

    def validate_admission_no(self, value):
        value = value.strip()
        if not value:
            return value
        if models.StudentProfile.objects.filter(admission_no=value).exists():
            raise serializers.ValidationError("This admission number is already in use.")
        # The username is derived from admission_no with "/" -> "-", so two
        # differently-formatted admission numbers could still collide on
        # username - catch that here rather than as an opaque 500 on save.
        username_candidate = value.replace("/", "-")
        if models.User.objects.filter(username=username_candidate).exists():
            raise serializers.ValidationError(
                f"The username '{username_candidate}' derived from this admission number is already taken."
            )
        return value

    def validate_classroom_id(self, value):
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
        parent_email = validated_data.pop("parent_email", "").strip()
        parent_relationship = validated_data.pop(
            "parent_relationship", models.ParentStudentLink.Relationship.GUARDIAN
        )

        # Use the supplied admission_no / date_admitted if given, otherwise
        # fall back to the auto-generate / today's-date behavior.
        admission_no = validated_data.pop("admission_no", "").strip()
        date_admitted = validated_data.pop("date_admitted", None)

        year = classroom.academic_year.year
        if not admission_no:
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
        user.set_password("password123")
        user.save()

        profile_kwargs = dict(
            user=user,
            admission_no=admission_no,
            gender=validated_data["gender"],
            date_of_birth=validated_data.get("date_of_birth"),
            curriculum_type=validated_data["curriculum_type"],
            upi_number=validated_data.get("upi_number", ""),
        )
        if date_admitted:
            profile_kwargs["date_admitted"] = date_admitted
        profile = models.StudentProfile.objects.create(**profile_kwargs)

        enrollment = models.Enrollment.objects.create(
            student=profile, classroom=classroom, academic_year=classroom.academic_year,
        )

        if parent_phone:
            services.attach_guardian(profile, parent_name, parent_phone, parent_relationship, parent_email)

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
                "email": guardian_link.parent.user.email,
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
    grade_level_id = serializers.IntegerField(source="classroom.grade_level_id", read_only=True)
    grade_level_name = serializers.CharField(source="classroom.grade_level.name", read_only=True)
    curriculum_type = serializers.CharField(source="classroom.grade_level.curriculum_type", read_only=True)
    pathway_name = serializers.CharField(source="pathway.name", read_only=True)
    selection_track_name = serializers.CharField(source="selection_track.name", read_only=True)
    subjects_locked = serializers.SerializerMethodField()

    class Meta:
        model = models.Enrollment
        fields = "__all__"

    def get_subjects_locked(self, obj):
        return obj.subjects_locked_at is not None


class PromoteSerializer(serializers.Serializer):
    target_classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    force = serializers.BooleanField(default=False)


class BulkPromoteSerializer(serializers.Serializer):
    source_classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    target_classroom_id = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())
    force = serializers.BooleanField(default=False)


class StudentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.User
        fields = ["username", "email", "first_name", "last_name", "phone_number", "national_id"]
        read_only_fields = ["username"]
        # national_id is unique=True on User. As a NESTED field this serializer
        # has no way to know which user it's validating against, so DRF's
        # auto-generated UniqueValidator always compares against the whole
        # table and rejects even an unchanged value on every edit. Dropped
        # here; StudentProfileDetailSerializer.validate() below does the
        # real check, correctly excluding the student's own account.
        extra_kwargs = {"national_id": {"validators": []}}


class StudentProfileDetailSerializer(serializers.ModelSerializer):
    """Powers the Student View/Edit modals and the reset-password action.
    Does not replace StudentProfileSerializer, which still powers the list view."""

    user = StudentUserSerializer()
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)

    current_classroom = serializers.SerializerMethodField()
    classroom_id = serializers.PrimaryKeyRelatedField(
        queryset=models.ClassRoom.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Reassigns the student's CURRENT enrollment to this classroom. "
                   "Does not create a new enrollment/history row - use Promote for that.",
    )

    guardian = serializers.SerializerMethodField()
    guardian_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    guardian_phone = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=20)
    guardian_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    guardian_relationship = serializers.ChoiceField(
        choices=models.ParentStudentLink.Relationship.choices,
        write_only=True,
        required=False,
        default=models.ParentStudentLink.Relationship.GUARDIAN,
    )

    class Meta:
        model = models.StudentProfile
        fields = [
            "id", "user", "admission_no", "full_name", "gender", "date_of_birth",
            "curriculum_type", "date_admitted", "upi_number", "is_active",
            "current_classroom", "classroom_id",
            "guardian", "guardian_name", "guardian_phone", "guardian_email", "guardian_relationship",
        ]
        read_only_fields = ["admission_no", "date_admitted"]

    def get_current_classroom(self, obj):
        enrollment = obj.current_enrollment
        if not enrollment:
            return None
        return {
            "id": enrollment.classroom_id,
            "label": str(enrollment.classroom),
            "grade_level_id": enrollment.classroom.grade_level_id,
            "academic_year": enrollment.classroom.academic_year.year,
        }

    def get_guardian(self, obj):
        link = models.ParentStudentLink.objects.filter(student=obj).select_related("parent__user").first()
        if not link:
            return None
        return {
            "id": link.parent.id,
            "name": link.parent.user.get_full_name(),
            "phone_number": link.parent.user.phone_number,
            "email": link.parent.user.email,
            "relationship": link.relationship,
            "relationship_display": link.get_relationship_display(),
        }

    def validate(self, attrs):
        # Manual national_id uniqueness check, excluding THIS student's own
        # account - see the note on StudentUserSerializer above for why the
        # nested field can't safely do this itself.
        national_id = (attrs.get("user") or {}).get("national_id")
        if national_id:
            qs = models.User.objects.filter(national_id=national_id)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.user_id)
            if qs.exists():
                raise serializers.ValidationError(
                    {"user": {"national_id": ["This national ID is already registered to another account."]}}
                )
        return attrs

    def validate_classroom_id(self, value):
        if value and not value.academic_year.is_current:
            raise serializers.ValidationError(
                f"'{value}' belongs to {value.academic_year.year}, which is not the current "
                "academic year. Choose a classroom from the current academic year."
            )
        return value

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        if user_data:
            user = instance.user
            for field in ("email", "first_name", "last_name", "phone_number", "national_id"):
                if field in user_data:
                    setattr(user, field, user_data[field])
            user.save()

        new_classroom = validated_data.pop("classroom_id", None)
        if new_classroom:
            enrollment = instance.current_enrollment
            if enrollment:
                enrollment.classroom = new_classroom
                enrollment.save(update_fields=["classroom"])
            else:
                models.Enrollment.objects.create(
                    student=instance, classroom=new_classroom, academic_year=new_classroom.academic_year,
                )

        guardian_phone = validated_data.pop("guardian_phone", "").strip() if "guardian_phone" in validated_data else ""
        guardian_name = validated_data.pop("guardian_name", "").strip() if "guardian_name" in validated_data else ""
        guardian_email = validated_data.pop("guardian_email", "").strip() if "guardian_email" in validated_data else ""
        guardian_relationship = validated_data.pop(
            "guardian_relationship", models.ParentStudentLink.Relationship.GUARDIAN
        )
        if guardian_phone:
            services.upsert_guardian(instance, guardian_name, guardian_phone, guardian_relationship, guardian_email)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class ResetStudentPasswordSerializer(serializers.Serializer):
    """
    POST body for /students/{id}/reset_password/.
    Leave new_password blank to reset back to the default used on
    admission (the admission number itself) - doubles as a plain
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


# ---------------------------------------------------------------------------
# SUBJECTS
# ---------------------------------------------------------------------------
class SubjectPaperSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubjectPaper
        fields = "__all__"


class SubjectGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubjectGroup
        fields = "__all__"


class TrackGroupRuleSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = models.TrackGroupRule
        fields = "__all__"


class SelectionTrackSerializer(serializers.ModelSerializer):
    group_rules = TrackGroupRuleSerializer(many=True, read_only=True)

    class Meta:
        model = models.SelectionTrack
        fields = "__all__"


class PathwaySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Pathway
        fields = "__all__"


class SubjectSerializer(serializers.ModelSerializer):
    papers = SubjectPaperSerializer(many=True, read_only=True)
    pathway_name = serializers.CharField(source="pathway.name", read_only=True)
    elective_group_name = serializers.CharField(source="elective_group.name", read_only=True)

    class Meta:
        model = models.Subject
        fields = "__all__"


class GradeSubjectSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    pathway = serializers.IntegerField(source="subject.pathway_id", read_only=True)
    pathway_name = serializers.CharField(source="subject.pathway.name", read_only=True)
    elective_group = serializers.IntegerField(source="subject.elective_group_id", read_only=True)
    elective_group_name = serializers.CharField(source="subject.elective_group.name", read_only=True)

    class Meta:
        model = models.GradeSubject
        fields = "__all__"


class SubjectSelectionRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubjectSelectionRule
        fields = "__all__"


class SetStudentSubjectsSerializer(serializers.Serializer):
    subject_ids = serializers.ListField(child=serializers.IntegerField())
    pathway_id = serializers.IntegerField(required=False, allow_null=True)
    track_id = serializers.IntegerField(required=False, allow_null=True)


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
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)

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


class ClassroomPromotionSerializer(serializers.ModelSerializer):
    source_classroom_label = serializers.CharField(source="source_classroom.__str__", read_only=True)
    target_classroom_label = serializers.CharField(source="target_classroom.__str__", read_only=True)
    promoted_by_name = serializers.CharField(source="promoted_by.get_full_name", read_only=True)

    class Meta:
        model = models.ClassroomPromotion
        fields = "__all__"


# ---------------------------------------------------------------------------
# FEES
# ---------------------------------------------------------------------------
class FeeStructureItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.FeeStructureItem
        fields = "__all__"
        # fee_structure is assigned by FeeStructureSerializer.create()
        # after the parent FeeStructure has been created.
        read_only_fields = ["fee_structure"]


class FeeStructureSerializer(serializers.ModelSerializer):
    items = FeeStructureItemSerializer(many=True, required=False)
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    term_label = serializers.CharField(source="term.__str__", read_only=True)
    academic_year_label = serializers.CharField(source="term.academic_year.year", read_only=True)
    curriculum_type = serializers.CharField(source="grade_level.curriculum_type", read_only=True)
    curriculum_display = serializers.CharField(source="grade_level.get_curriculum_type_display", read_only=True)

    class Meta:
        model = models.FeeStructure
        fields = "__all__"

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        fee_structure = models.FeeStructure.objects.create(**validated_data)
        for item_data in items_data:
            models.FeeStructureItem.objects.create(
                fee_structure=fee_structure,
                **item_data
            )
        return fee_structure

    def update(self, instance, validated_data):
        # DRF's default update() can't assign a list to a reverse-FK
        # manager, so nested `items` must be handled manually: replace
        # the whole set (delete + recreate) rather than trying to diff it.
        items_data = validated_data.pop("items", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                models.FeeStructureItem.objects.create(fee_structure=instance, **item_data)

        return instance


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


class BulkPaymentSerializer(serializers.Serializer):
    """
    POST body for paying a student's TOTAL outstanding balance in one go.
    services.record_bulk_payment() splits it across their unpaid
    invoices automatically (oldest first).
    """
    admission_no = serializers.CharField(max_length=30)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("1"))
    method = serializers.ChoiceField(choices=models.Payment.Method.choices)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=60)


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


class PaymentListSerializer(serializers.ModelSerializer):
    """
    Enriched, read-only view of a Payment for the Finance "all payments"
    list: who the student is, their own phone, their guardian's name/phone,
    which class/term/year the payment's invoice belongs to, and who
    recorded it (front-desk staff for manual entries, or the student/parent
    themselves for a self-service STK push - see services.initiate_payment).
    """

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


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ExpenseCategory
        fields = "__all__"


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True)
    term_label = serializers.CharField(source="term.__str__", read_only=True)

    class Meta:
        model = models.Expense
        fields = "__all__"
        read_only_fields = ["total_amount", "recorded_by"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_cost(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit cost cannot be negative.")
        return value


# ---------------------------------------------------------------------------
# LICENSING / SUBSCRIPTIONS
# ---------------------------------------------------------------------------
class LicenseUsageSerializer(serializers.Serializer):
    tier = serializers.CharField()
    tier_display = serializers.CharField()
    valid_until = serializers.DateTimeField(allow_null=True)
    trial_ends_at = serializers.DateTimeField(allow_null=True)
    is_suspended = serializers.BooleanField()
    is_expired = serializers.BooleanField()
    usage = serializers.DictField()


class RedeemTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=64)


class SubscriptionPackageSerializer(serializers.ModelSerializer):
    tier_display = serializers.CharField(source="get_tier_display", read_only=True)

    class Meta:
        model = models.SubscriptionPackage
        fields = [
            "id", "tier", "tier_display", "monthly_price",
            "max_students", "max_classrooms_per_year", "max_teachers",
            "features", "display_order",
        ]


# ---------------------------------------------------------------------------
# COMMUNICATIONS & MESSAGING
# ---------------------------------------------------------------------------
class CommunicationCreateSerializer(serializers.Serializer):
    """Bulk Communication (Admin/Finance broadcast)."""

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

        # Reuse an existing thread between the same two people about the
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


# ---------------------------------------------------------------------------
# TIMETABLE MANAGEMENT
# ---------------------------------------------------------------------------
class PeriodSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PeriodSlot
        fields = "__all__"


class PeriodSlotBulkItemSerializer(serializers.Serializer):
    """One row of the structure-builder form."""
    day = serializers.ChoiceField(choices=models.PeriodSlot.Day.choices)
    order = serializers.IntegerField(min_value=1)
    slot_type = serializers.ChoiceField(choices=models.PeriodSlot.SlotType.choices)
    label = serializers.CharField(required=False, allow_blank=True, max_length=40)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()

    def validate_label(self, value):
        # Frontend sometimes sends None instead of "" for a not-yet-typed
        # label - CharField(allow_blank=True) accepts "" but chokes on None
        # unless allow_null is also set, so normalize here instead.
        return value or ""

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError(
                f"{attrs['day']} order {attrs['order']}: end_time must be after start_time "
                f"(got {attrs['start_time']}–{attrs['end_time']})."
            )
        return attrs


class PeriodSlotBulkSetSerializer(serializers.Serializer):
    """
    POST body: { "slots": [ {day, order, slot_type, label, start_time, end_time}, ... ] }
    Replaces the ENTIRE weekly structure in one call - this is what the
    Structure Setup tab submits. Wipes existing PeriodSlots first, since a
    structure change (e.g. removing a period) can't be reconciled row by
    row without leaving stale slots (and their TimetableEntries) behind.
    """
    slots = PeriodSlotBulkItemSerializer(many=True)

    def validate_slots(self, value):
        if not value:
            raise serializers.ValidationError("At least one slot is required.")
        seen = set()
        duplicates = set()
        for row in value:
            key = (row["day"], row["order"])
            if key in seen:
                duplicates.add(key)
            seen.add(key)
        if duplicates:
            raise serializers.ValidationError(
                f"Duplicate day/order pairs in the payload: {sorted(duplicates)}. "
                "Each (day, order) can only appear once."
            )
        return value

    def save(self):
        with transaction.atomic():
            models.PeriodSlot.objects.all().delete()  # cascades TimetableEntry too
            objs = [models.PeriodSlot(**row) for row in self.validated_data["slots"]]
            return models.PeriodSlot.objects.bulk_create(objs)


class TimetableEntrySerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="allocation.subject.name", read_only=True)
    subject_code = serializers.CharField(source="allocation.subject.code", read_only=True)
    teacher_name = serializers.CharField(source="allocation.teacher.get_full_name", read_only=True)
    day = serializers.CharField(source="period_slot.day", read_only=True)
    period_order = serializers.IntegerField(source="period_slot.order", read_only=True)
    period_label = serializers.CharField(source="period_slot.label", read_only=True)

    class Meta:
        model = models.TimetableEntry
        fields = "__all__"
        read_only_fields = ["auto_generated"]

    def validate(self, attrs):
        classroom = attrs.get("classroom") or getattr(self.instance, "classroom", None)
        period_slot = attrs.get("period_slot") or getattr(self.instance, "period_slot", None)
        term = attrs.get("term") or getattr(self.instance, "term", None)
        allocation = attrs.get("allocation") or getattr(self.instance, "allocation", None)

        if period_slot and period_slot.slot_type != models.PeriodSlot.SlotType.LESSON:
            raise serializers.ValidationError("Can only schedule a lesson into a LESSON slot.")
        if allocation and classroom and allocation.classroom_id != classroom.id:
            raise serializers.ValidationError("This allocation does not belong to the selected classroom.")

        # Teacher clash: same period_slot+term, different classroom, same teacher.
        if period_slot and term and allocation:
            clash = models.TimetableEntry.objects.filter(
                period_slot=period_slot, term=term, allocation__teacher=allocation.teacher
            ).exclude(classroom=classroom)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    f"{allocation.teacher.get_full_name()} is already teaching another class in this slot."
                )
        return attrs


class TimetableGridQuerySerializer(serializers.Serializer):
    term = serializers.PrimaryKeyRelatedField(queryset=models.Term.objects.all())
    classroom = serializers.PrimaryKeyRelatedField(queryset=models.ClassRoom.objects.all())


class AutoGenerateTimetableSerializer(serializers.Serializer):
    term = serializers.PrimaryKeyRelatedField(queryset=models.Term.objects.all())