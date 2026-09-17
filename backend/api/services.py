"""
Service layer - business rules live here, NOT in views/serializers.
Views should stay thin: parse request -> call a service -> return response.
"""
import base64
import io
import random
from collections import defaultdict, namedtuple
from datetime import timedelta
from decimal import Decimal
from itertools import cycle

import qrcode
import requests
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import transaction
from django.db.models import Avg, Count, F, Q, Sum
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework_simplejwt.tokens import RefreshToken

from . import models, serializers, utils

_signer = TimestampSigner(salt="2fa-login-challenge")


# ---------------------------------------------------------------------------
# ADMISSION NUMBERS
# ---------------------------------------------------------------------------
def generate_admission_no(year: int) -> str:
    """
    Generates a sequential admission number, e.g. ADM00001, ADM00081,
    ADM11871.

    Admission numbers are independent of the User.id (UUID) and are
    short, sequential and human-readable.

    The `year` argument is retained for backwards compatibility but does
    not affect the sequence. Admission numbers are sequential across
    all years.

    Format:
        ADM + 5-digit zero-padded sequence
    """
    last = (
        models.StudentProfile.objects
        .filter(admission_no__regex=r"^ADM\d+$")
        .order_by("-admission_no")
        .first()
    )

    next_seq = 1
    if last:
        try:
            next_seq = int(last.admission_no[3:]) + 1
        except (ValueError, TypeError):
            pass

    return f"ADM{next_seq:05d}"


# ---------------------------------------------------------------------------
# SELF-SERVICE PROFILE UPDATES
# ---------------------------------------------------------------------------
def update_profile(user: models.User, data: dict) -> models.User:
    """
    Applies a self-service profile edit. Only ever touches:
      - User: email, phone_number, national_id
      - StudentProfile (if the user is a student): gender, date_of_birth
    Never touches username, role, admission_no, or names - those stay
    admin-controlled so identity/records can't be self-edited.
    """
    user_fields = [f for f in ("email", "phone_number", "national_id") if f in data]
    if user_fields:
        for field in user_fields:
            setattr(user, field, data[field])
        user.save(update_fields=user_fields)

    student_profile = getattr(user, "student_profile", None)
    if student_profile:
        student_fields = [f for f in ("gender", "date_of_birth") if f in data]
        if student_fields:
            for field in student_fields:
                setattr(student_profile, field, data[field])
            student_profile.save(update_fields=student_fields)

    return user


# ---------------------------------------------------------------------------
# AUTH / LOGIN - tokens, lockout, OTP (2FA), password reset
# ---------------------------------------------------------------------------
def issue_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": serializers.UserSerializer(user).data,
    }


def make_challenge_token(user):
    return _signer.sign(str(user.id))


def read_challenge_token(token):
    """Returns the user id (a UUID string), or None if the token is missing/expired/tampered."""
    try:
        return _signer.unsign(token, max_age=settings.OTP_EXPIRY_MINUTES * 60)
    except (BadSignature, SignatureExpired):
        return None


def validate_login_username(username):
    """Blocks the "giant garbage string" case before it ever touches the database."""
    if not username or len(username) > utils.USERNAME_MAX_LENGTH or not utils.USERNAME_PATTERN.match(username):
        raise ValueError("Invalid username format.")
    return username


def register_failed_login(user, ip_address, result):
    models.LoginAttemptLog.objects.create(
        username_attempted=user.username, user=user, ip_address=ip_address, result=result
    )

    # In DEBUG, track it in the log for visibility but never actually lock
    # the account - matches the STK-push DEBUG-bypass convention already
    # used elsewhere in this codebase.
    if settings.DEBUG or not user.requires_2fa:
        return False

    user.failed_login_attempts += 1
    user.last_failed_login_at = timezone.now()
    locked_now = False
    if user.failed_login_attempts >= settings.ACCOUNT_LOCKOUT_MAX_ATTEMPTS:
        user.locked_until = timezone.now() + timedelta(minutes=settings.ACCOUNT_LOCKOUT_DURATION_MINUTES)
        locked_now = True

    user.save(update_fields=["failed_login_attempts", "last_failed_login_at", "locked_until"])

    if locked_now:
        models.LoginAttemptLog.objects.create(
            username_attempted=user.username, user=user, ip_address=ip_address,
            result=models.LoginAttemptLog.Result.ACCOUNT_LOCKED,
        )
        notify_admins_account_locked(user)
    elif user.failed_login_attempts == settings.ACCOUNT_LOCKOUT_MAX_ATTEMPTS - 1:
        # warn admins one attempt before lockout, not on every single failure
        notify_admins_suspicious_activity(user)

    return locked_now


def reset_failed_logins(user):
    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
        user.save(update_fields=["failed_login_attempts", "locked_until"])


def unlock_user(user):
    user.failed_login_attempts = 0
    user.locked_until = None
    user.save(update_fields=["failed_login_attempts", "locked_until"])


def generate_and_send_otp(user):
    code = f"{random.randint(0, 999999):06d}"
    user.otp_code = code
    user.otp_expires_at = timezone.now() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)
    user.save(update_fields=["otp_code", "otp_expires_at"])

    if settings.DEBUG:
        # dev convenience only - never do this in production
        print(f"[DEV OTP] {user.username} -> {code}")
    else:
        _dispatch_otp(user, code)

    models.LoginAttemptLog.objects.create(
        username_attempted=user.username, user=user, result=models.LoginAttemptLog.Result.OTP_SENT
    )
    return code


def _dispatch_otp(user, code):
    """Wire this to your real SMS/email provider. Placeholder uses Django's send_mail."""
    if user.email:
        send_mail(
            subject="Your login verification code",
            message=f"Your one-time code is {code}. It expires in {settings.OTP_EXPIRY_MINUTES} minutes. "
                    f"If you did not request this, contact IT immediately.",
            from_email=None,
            recipient_list=[user.email],
        )
    # else: plug in your SMS gateway (Africa's Talking / Twilio) using user.phone_number


def verify_otp(user, submitted_code, ip_address):
    submitted_code = (submitted_code or "").strip()

    if not user.otp_code or not user.otp_expires_at or timezone.now() > user.otp_expires_at:
        register_failed_login(user, ip_address, models.LoginAttemptLog.Result.OTP_FAILED)
        return False
    if submitted_code != user.otp_code.strip():
        register_failed_login(user, ip_address, models.LoginAttemptLog.Result.OTP_FAILED)
        return False

    user.otp_code = None
    user.otp_expires_at = None
    user.save(update_fields=["otp_code", "otp_expires_at"])
    models.LoginAttemptLog.objects.create(
        username_attempted=user.username, user=user, ip_address=ip_address,
        result=models.LoginAttemptLog.Result.OTP_SUCCESS,
    )
    return True


def _notify_admins(subject, body):
    """Reuses the existing Communication/notification system to alert every active Admin."""
    admin_ids = models.User.objects.filter(role=models.User.Role.ADMIN, is_active_staff=True)
    if not admin_ids.exists():
        return
    comm = models.Communication.objects.create(
        sender=None,
        subject=subject,
        body=body,
        category=models.Communication.Category.GENERAL,
        audience_type=models.Communication.AudienceType.ROLE,
        target_roles=[models.User.Role.ADMIN],
        include_students=False,
        include_guardians=False,
        send_in_app=True,
        send_sms=False,
        send_email=False,
    )
    send_communication(comm)  # existing function - resolves audience + dispatches


def notify_admins_suspicious_activity(user):
    _notify_admins(
        subject=f"Repeated failed login: {user.get_full_name() or user.username}",
        body=(
            f"{user.username} ({user.get_role_display()}) has {user.failed_login_attempts} failed login "
            f"attempt(s) at {timezone.now():%Y-%m-%d %H:%M}. One more failure will lock this account."
        ),
    )


def notify_admins_account_locked(user):
    _notify_admins(
        subject=f"Account locked: {user.get_full_name() or user.username}",
        body=(
            f"{user.username} ({user.get_role_display()}) was locked after "
            f"{user.failed_login_attempts} failed login attempts. Unlock it from User Accounts "
            f"if this was the legitimate user."
        ),
    )


# ---------------------------------------------------------------------------
# PASSWORD MANAGEMENT (students)
# ---------------------------------------------------------------------------
def reset_student_password(student: models.StudentProfile, new_password: str = None) -> str:
    """
    Resets a student's login password.

    If new_password is omitted/blank, resets back to the same simple
    default used on admission - "password123" (see
    StudentEnrollSerializer.create()). This makes the same function double
    as a plain "forgot password" reset with no extra endpoint needed.

    Returns the password that was actually set, so the caller (the admin
    UI) can display it once for the admin to share with the student.
    """
    password = new_password or "password123"
    student.user.set_password(password)
    student.user.save(update_fields=["password"])
    return password


def generate_password_reset_token(student_user):
    token = get_random_string(48)
    student_user.password_reset_token = token
    student_user.password_reset_expires_at = timezone.now() + timedelta(
        minutes=settings.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES
    )
    student_user.save(update_fields=["password_reset_token", "password_reset_expires_at"])
    return token


def send_password_reset_link(student_user, token):
    link = f"{settings.FRONTEND_URL}/reset-password/{token}"
    if settings.DEBUG:
        print(f"[DEV RESET LINK] {student_user.username} -> {link}")
        return
    guardian_link = models.ParentStudentLink.objects.filter(
        student__user=student_user
    ).select_related("parent__user").first()
    recipient_email = student_user.email or (guardian_link.parent.user.email if guardian_link else None)
    if recipient_email:
        send_mail(
            subject="Password reset request",
            message=f"A password reset was requested for admission number "
                     f"{student_user.student_profile.admission_no}. "
                     f"Use this link within {settings.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes: {link}\n\n"
                     f"If you didn't request this, ignore this message.",
            from_email=None,
            recipient_list=[recipient_email],
        )


# ---------------------------------------------------------------------------
# SUBJECT SELECTION VALIDATION
# ---------------------------------------------------------------------------
def validate_subject_selection(
    grade_level: models.GradeLevel,
    subject_ids: list[int],
    pathway_id: int | None = None,
    track_id: int | None = None,
):
    grade_subjects = models.GradeSubject.objects.filter(grade_level=grade_level).select_related("subject")
    compulsory_ids = {gs.subject_id for gs in grade_subjects if gs.is_compulsory}
    optional_ids = {gs.subject_id for gs in grade_subjects if not gs.is_compulsory}
    valid_ids = compulsory_ids | optional_ids

    chosen = set(subject_ids)
    invalid = chosen - valid_ids
    if invalid:
        raise ValueError(f"Subjects not offered at {grade_level}: {invalid}")

    missing_compulsory = compulsory_ids - chosen
    if missing_compulsory:
        raise ValueError(f"Missing compulsory subjects: {missing_compulsory}")

    chosen_optional = chosen & optional_ids
    rule = getattr(grade_level, "selection_rule", None)

    # ---- CBC single-pathway check ----
    if rule and rule.requires_pathway:
        if not pathway_id:
            raise ValueError("Please choose a pathway (STEM / Social Sciences / Arts & Sports Science) first.")
        pathway = models.Pathway.objects.filter(pk=pathway_id, is_active=True).first()
        if not pathway:
            raise ValueError("Invalid or inactive pathway selected.")
        mismatched = models.Subject.objects.filter(id__in=chosen_optional).exclude(
            Q(pathway=pathway) | Q(pathway__isnull=True)
        )
        if mismatched.exists():
            raise ValueError(f"All optional subjects must belong to the {pathway.name} pathway you selected.")

    # ---- 8-4-4 group/track check ----
    if models.SelectionTrack.objects.filter(grade_level=grade_level, is_active=True).exists():
        if not track_id:
            raise ValueError("Please choose an elective track first (e.g. Technical + Humanities, or Triple Science).")
        track = models.SelectionTrack.objects.filter(
            pk=track_id, grade_level=grade_level, is_active=True
        ).prefetch_related("group_rules__group").first()
        if not track:
            raise ValueError("Invalid track for this grade.")

        allowed_group_ids = {r.group_id for r in track.group_rules.all()}
        chosen_subjects = models.Subject.objects.filter(id__in=chosen_optional).select_related("elective_group")

        # any optional subject with a group must belong to a group this track allows
        stray = [s.name for s in chosen_subjects if s.elective_group_id and s.elective_group_id not in allowed_group_ids]
        if stray:
            raise ValueError(f"These subjects don't belong to the '{track.name}' track: {', '.join(stray)}")

        for tgr in track.group_rules.all():
            count = sum(1 for s in chosen_subjects if s.elective_group_id == tgr.group_id)
            if count < tgr.min_choose:
                raise ValueError(f"Choose at least {tgr.min_choose} {tgr.group.name} subject(s).")
            if count > tgr.max_choose:
                raise ValueError(f"Choose at most {tgr.max_choose} {tgr.group.name} subject(s).")

    if rule:
        if len(chosen_optional) < rule.min_optional_subjects:
            raise ValueError(f"Must select at least {rule.min_optional_subjects} optional subject(s).")
        if len(chosen_optional) > rule.max_optional_subjects:
            raise ValueError(f"May select at most {rule.max_optional_subjects} optional subject(s).")
        total = len(chosen)
        if not (rule.min_total_subjects <= total <= rule.max_total_subjects):
            raise ValueError(f"Total subjects must be between {rule.min_total_subjects} and {rule.max_total_subjects}.")

    return models.Subject.objects.filter(id__in=chosen)


@transaction.atomic
def set_student_subjects(enrollment, subject_ids, pathway_id=None, track_id=None, allow_relock=False):
    """
    allow_relock=True bypasses the lock - reserved for Admin/Teacher calls.
    A regular student self-service call must leave this False: once a
    student has submitted their subject selection, subjects_locked_at is
    set and every subsequent student-initiated call is rejected until an
    admin clears it via EnrollmentViewSet.unlock_subjects.
    """
    if enrollment.subjects_locked_at and not allow_relock:
        raise ValueError(
            "Your subject selection has already been submitted and locked. "
            "Contact the school office if you need to make changes."
        )

    subjects = validate_subject_selection(enrollment.classroom.grade_level, subject_ids, pathway_id, track_id)
    models.StudentSubjectSelection.objects.filter(enrollment=enrollment).delete()
    models.StudentSubjectSelection.objects.bulk_create(
        [models.StudentSubjectSelection(enrollment=enrollment, subject=s) for s in subjects]
    )

    update_fields = []
    if pathway_id:
        enrollment.pathway_id = pathway_id
        update_fields.append("pathway")
    if track_id:
        enrollment.selection_track_id = track_id
        update_fields.append("selection_track")
    if not enrollment.subjects_locked_at:
        enrollment.subjects_locked_at = timezone.now()
        update_fields.append("subjects_locked_at")
    if update_fields:
        enrollment.save(update_fields=update_fields)

    return subjects


# ---------------------------------------------------------------------------
# GRADING (with fallback to a standard high-school scale)
# ---------------------------------------------------------------------------
GradeResult = namedtuple("GradeResult", ["grade_letter", "points", "remark"])

# Standard KCSE-style 12-point scale — used ONLY when the school hasn't
# configured a GradingScale for this curriculum/subject yet, so a report
# card never shows a blank grade just because Grading Scales isn't set up.
_DEFAULT_GRADING_SCALE = [
    (80, 100,   "A",  12, "Excellent"),
    (75, 79.99, "A-", 11, "Very Good"),
    (70, 74.99, "B+", 10, "Very Good"),
    (65, 69.99, "B",  9,  "Good"),
    (60, 64.99, "B-", 8,  "Good"),
    (55, 59.99, "C+", 7,  "Average"),
    (50, 54.99, "C",  6,  "Average"),
    (45, 49.99, "C-", 5,  "Below Average"),
    (40, 44.99, "D+", 4,  "Below Average"),
    (35, 39.99, "D",  3,  "Weak"),
    (30, 34.99, "D-", 2,  "Weak"),
    (0,  29.99, "E",  1,  "Needs Improvement"),
]


def default_grade_for_percentage(percentage) -> GradeResult:
    pct = float(percentage)
    for lo, hi, letter, points, remark in _DEFAULT_GRADING_SCALE:
        if lo <= pct <= hi:
            return GradeResult(letter, Decimal(points), remark)
    return GradeResult("E", Decimal(1), "Needs Improvement")


def grade_for_percentage(curriculum_type: str, percentage: Decimal, subject: models.Subject = None):
    """
    Looks up the applicable GradingScale row for a percentage score.
    Falls back to the standard high-school scale when nothing is
    configured, so grade/points are ALWAYS returned, never None.
    """
    qs = models.GradingScale.objects.filter(
        curriculum_type=curriculum_type,
        min_percentage__lte=percentage,
        max_percentage__gte=percentage,
    )
    specific = qs.filter(subject=subject).first() if subject else None
    scale = specific or qs.filter(subject__isnull=True).first()
    return scale or default_grade_for_percentage(percentage)


# ---------------------------------------------------------------------------
# REPORT CARD QR VERIFICATION (stateless — signed token, no DB row needed)
# ---------------------------------------------------------------------------
REPORT_CARD_TOKEN_SALT = "report-card-verify-v1"


def generate_report_card_token(enrollment_id: int, term_id: int, exam_id: int = None) -> str:
    return signing.dumps(
        {"enrollment_id": enrollment_id, "term_id": term_id, "exam_id": exam_id},
        salt=REPORT_CARD_TOKEN_SALT,
    )


def read_report_card_token(token: str):
    try:
        return signing.loads(token, salt=REPORT_CARD_TOKEN_SALT)
    except signing.BadSignature:
        return None


def generate_report_card_qr_base64(token: str) -> str:
    verify_url = f"{settings.FRONTEND_URL}/verify-report-card/{token}"
    img = qrcode.make(verify_url)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


def get_report_card_verification(token: str) -> dict:
    """
    Recomputes the student's result LIVE — never trusts a stored snapshot —
    so if a mark is corrected after printing, an old report card's QR will
    show the discrepancy instead of falsely confirming stale figures.
    Deliberately excludes fee data - this endpoint is public.
    """
    payload = read_report_card_token(token)
    if not payload:
        return {"valid": False, "detail": "This QR code is invalid or has been tampered with."}

    enrollment = models.Enrollment.objects.select_related(
        "student__user", "classroom__grade_level", "classroom__stream", "classroom__academic_year"
    ).filter(pk=payload["enrollment_id"]).first()
    term = models.Term.objects.filter(pk=payload["term_id"]).first()
    if not enrollment or not term:
        return {"valid": False, "detail": "This report card no longer exists."}

    exam = models.Exam.objects.filter(pk=payload["exam_id"]).first() if payload.get("exam_id") else None
    classroom = enrollment.classroom

    def result_filter(**extra):
        base = {"exam__term": term, **extra}
        if exam:
            base = {"exam": exam, **extra}
        return models.ExamResult.objects.filter(
            is_absent=False, marks_obtained__isnull=False, max_marks__gt=0, **base
        )

    offered_subject_ids = set(
        models.Subject.objects.filter(grade_subjects__grade_level=classroom.grade_level).values_list("id", flat=True)
    )
    scored_subject_ids = set(result_filter(enrollment=enrollment).values_list("subject_id", flat=True))
    subjects = models.Subject.objects.filter(id__in=(offered_subject_ids | scored_subject_ids))

    pct_values, points_values = [], []
    for subject in subjects:
        qs = result_filter(enrollment=enrollment, subject=subject)
        if qs.exists():
            total_pct = sum(float(r.marks_obtained) / float(r.max_marks) * 100 for r in qs)
            avg_pct = round(total_pct / qs.count(), 1)
            grade = grade_for_percentage(classroom.grade_level.curriculum_type, Decimal(str(avg_pct)), subject)
            pct_values.append(avg_pct)
            points_values.append(float(grade.points))

    has_marks = bool(pct_values)
    average = round(sum(pct_values) / len(pct_values), 1) if has_marks else None
    overall_grade = (
        grade_for_percentage(classroom.grade_level.curriculum_type, Decimal(str(average))) if has_marks else None
    )
    ranking = models.TermPositionRanking.objects.filter(
        enrollment=enrollment, term=term, checkpoint=models.TermPositionRanking.Checkpoint.ENDTERM
    ).first()

    return {
        "valid": True,
        "student_name": enrollment.student.user.get_full_name(),
        "admission_no": enrollment.student.admission_no,
        "classroom": str(classroom),
        "academic_year": classroom.academic_year.year,
        "term": str(term),
        "exam": exam.name if exam else "All Exams (Combined)",
        "average_marks": average,
        "overall_grade": overall_grade.grade_letter if overall_grade else None,
        "total_points": round(sum(points_values), 1) if points_values else None,
        "average_points": round(sum(points_values) / len(points_values), 2) if points_values else None,
        "class_position": ranking.class_position if ranking else None,
    }


# ---------------------------------------------------------------------------
# RANKING
# ---------------------------------------------------------------------------
def rank_classroom(term: models.Term, classroom: models.ClassRoom, checkpoint: str):
    """
    Computes and stores TermPositionRanking for every student in a classroom.

    checkpoint = "MIDTERM"  -> combine exams flagged counts_towards_midterm_rank
    checkpoint = "ENDTERM"  -> combine exams flagged counts_towards_endterm_rank

    Weighted average per student = sum(marks * exam_weight) / sum(max_marks * exam_weight)
    across all subjects and all included exams, expressed back out of 100.
    """
    flag = "counts_towards_midterm_rank" if checkpoint == "MIDTERM" else "counts_towards_endterm_rank"
    exams = models.Exam.objects.filter(
        term=term, grade_level=classroom.grade_level, **{f"exam_type__{flag}": True}
    ).select_related("exam_type")

    enrollments = models.Enrollment.objects.filter(classroom=classroom, academic_year=term.academic_year)

    scored = []
    for enrollment in enrollments:
        weighted_sum = Decimal("0")
        weighted_max = Decimal("0")
        for exam in exams:
            weight = exam.exam_type.weight
            results = models.ExamResult.objects.filter(
                exam=exam, enrollment=enrollment, is_absent=False, marks_obtained__isnull=False
            )
            for r in results:
                weighted_sum += r.marks_obtained * weight
                weighted_max += r.max_marks * weight

        average = float(weighted_sum / weighted_max * 100) if weighted_max else 0
        scored.append({"enrollment": enrollment, "total": weighted_sum, "average": round(average, 2)})

    # class position: rank by average, descending, ties share a rank (1,2,2,4 style)
    scored.sort(key=lambda x: x["average"], reverse=True)
    with transaction.atomic():
        prev_avg, rank = None, 0
        for idx, row in enumerate(scored, start=1):
            if row["average"] != prev_avg:
                rank = idx
            prev_avg = row["average"]
            models.TermPositionRanking.objects.update_or_create(
                term=term, enrollment=row["enrollment"], checkpoint=checkpoint,
                defaults={
                    "total_marks": row["total"],
                    "average_marks": row["average"],
                    "class_position": rank,
                },
            )
    return scored


def rank_grade(term: models.Term, grade_level: models.GradeLevel, checkpoint: str):
    """Ranks a student across ALL streams of a grade (e.g. Grade 9 Red + Blue + Green combined)."""
    classrooms = models.ClassRoom.objects.filter(grade_level=grade_level, academic_year=term.academic_year)
    all_scores = []
    for classroom in classrooms:
        all_scores += rank_classroom(term, classroom, checkpoint)

    all_scores.sort(key=lambda x: x["average"], reverse=True)
    prev_avg, rank = None, 0
    for idx, row in enumerate(all_scores, start=1):
        if row["average"] != prev_avg:
            rank = idx
        prev_avg = row["average"]
        models.TermPositionRanking.objects.filter(
            term=term, enrollment=row["enrollment"], checkpoint=checkpoint
        ).update(grade_position=rank)
    return all_scores


# ---------------------------------------------------------------------------
# PROMOTION
# ---------------------------------------------------------------------------
@transaction.atomic
def promote_student(enrollment: models.Enrollment, target_classroom: models.ClassRoom, force: bool = False):
    """
    Creates a new Enrollment for the next academic year, linked back to the
    old one via promoted_from. The OLD enrollment (and every ExamResult /
    Invoice FK'd to it) is left completely untouched.
    """
    rule = getattr(enrollment.classroom.grade_level, "promotion_rule", None)
    if rule and not force:
        ranking = models.TermPositionRanking.objects.filter(
            enrollment=enrollment, checkpoint="ENDTERM"
        ).order_by("-term__term_number").first()
        if not ranking or ranking.average_marks < rule.minimum_average_percentage:
            raise ValueError(
                "Student does not meet the minimum average "
                f"({rule.minimum_average_percentage}%) required for promotion. "
                "Pass force=True to override."
            )

    enrollment.status = models.Enrollment.Status.PROMOTED
    enrollment.save(update_fields=["status"])

    new_enrollment = models.Enrollment.objects.create(
        student=enrollment.student,
        classroom=target_classroom,
        academic_year=target_classroom.academic_year,
        status=models.Enrollment.Status.ACTIVE,
        promoted_from=enrollment,
    )
    return new_enrollment


def bulk_promote_classroom(classroom: models.ClassRoom, target_classroom: models.ClassRoom, force: bool = False):
    results = {"promoted": [], "failed": []}
    for enrollment in classroom.enrollments.filter(status=models.Enrollment.Status.ACTIVE):
        try:
            new_e = promote_student(enrollment, target_classroom, force=force)
            results["promoted"].append(new_e.id)
        except ValueError as exc:
            results["failed"].append({"student": enrollment.student.admission_no, "reason": str(exc)})
    return results


def resolve_next_classroom_target(source_classroom: models.ClassRoom) -> dict:
    """
    Dry-run resolution of where `source_classroom` promotes TO: same
    stream, grade_level.next_grade, and the AcademicYear whose year is
    source_classroom.academic_year.year + 1. Curriculum-agnostic - this
    walks the SAME next_grade chain whether the grade is CBC (Grade 9 ->
    Grade 10 -> ...) or legacy 8-4-4 (Form 1 -> Form 2 -> Form 3 -> Form 4).
    Does NOT create anything - used by the preview endpoint.
    """
    grade_level = source_classroom.grade_level
    next_grade = grade_level.next_grade
    if next_grade is None:
        return {"graduating": True}

    if next_grade.curriculum_type != grade_level.curriculum_type:
        raise ValueError(
            f"{grade_level}'s next grade is set to {next_grade}, which is a different "
            f"curriculum ({next_grade.get_curriculum_type_display()} vs "
            f"{grade_level.get_curriculum_type_display()}). Fix the 'next grade' link on "
            "Grade Levels before promoting this class."
        )

    target_year_value = source_classroom.academic_year.year + 1
    target_academic_year = models.AcademicYear.objects.filter(year=target_year_value).first()
    if not target_academic_year:
        raise ValueError(
            f"Academic year {target_year_value} hasn't been set up yet. "
            "Create it under Academic Calendar before promoting this class."
        )

    existing_classroom = models.ClassRoom.objects.filter(
        grade_level=next_grade, stream=source_classroom.stream, academic_year=target_academic_year,
    ).first()

    return {
        "graduating": False,
        "grade_level": next_grade,
        "stream": source_classroom.stream,
        "academic_year": target_academic_year,
        "existing_classroom": existing_classroom,
    }


def get_or_create_next_classroom(source_classroom: models.ClassRoom) -> models.ClassRoom:
    """Same resolution as above, but creates the target ClassRoom if it doesn't exist yet."""
    info = resolve_next_classroom_target(source_classroom)
    if info["graduating"]:
        raise ValueError("This grade has no next grade configured - it's a graduating class, not a promotion.")

    target_classroom, _ = models.ClassRoom.objects.get_or_create(
        grade_level=info["grade_level"], stream=info["stream"], academic_year=info["academic_year"],
    )
    return target_classroom


@transaction.atomic
def bulk_promote_classroom_auto(source_classroom: models.ClassRoom, force: bool = False, promoted_by=None) -> dict:
    """
    The guarded, auto-targeting entry point the UI calls. Refuses outright
    if this source_classroom already has a ClassroomPromotion record -
    that's the single source of truth for "already promoted", independent
    of how many ACTIVE enrollments happen to remain in it.
    """
    existing = models.ClassroomPromotion.objects.select_related("target_classroom").filter(
        source_classroom=source_classroom
    ).first()
    if existing:
        target_label = str(existing.target_classroom) if existing.target_classroom else "graduation"
        raise ValueError(
            f"This class has already been promoted (to {target_label}) on "
            f"{existing.promoted_at:%d %b %Y, %H:%M} by "
            f"{existing.promoted_by.get_full_name() if existing.promoted_by else 'an admin'}. "
            "Ask an administrator to clear that record first if this needs to be redone."
        )

    next_grade = source_classroom.grade_level.next_grade

    if next_grade is None:
        # Top of the ladder (Grade 12 / Form 4) - nowhere to promote TO,
        # so this bulk action graduates the class instead.
        active = source_classroom.enrollments.filter(status=models.Enrollment.Status.ACTIVE)
        count = active.count()
        active.update(status=models.Enrollment.Status.GRADUATED)
        models.ClassroomPromotion.objects.create(
            source_classroom=source_classroom, target_classroom=None,
            promoted_by=promoted_by, student_count=count,
        )
        return {"promoted": [], "failed": [], "graduated_count": count, "target_classroom": None}

    target_classroom = get_or_create_next_classroom(source_classroom)
    results = bulk_promote_classroom(source_classroom, target_classroom, force=force)  # existing function, unchanged

    models.ClassroomPromotion.objects.create(
        source_classroom=source_classroom,
        target_classroom=target_classroom,
        promoted_by=promoted_by,
        student_count=len(results["promoted"]),
    )
    results["target_classroom"] = str(target_classroom)
    results["target_classroom_id"] = target_classroom.id
    results["graduated_count"] = 0
    return results


# ---------------------------------------------------------------------------
# FEES - carry-forward ledger, STK push (with DEBUG bypass), receipts
# ---------------------------------------------------------------------------
def get_outstanding_balance(student: models.StudentProfile) -> Decimal:
    """
    Sums each invoice's OWN term charge (amount_due minus whatever was
    already brought forward into it) minus everything ever paid.

    Summing amount_due directly double-counts arrears, since invoice N's
    amount_due already includes invoice N-1's unpaid balance via
    brought_forward - summing raw amount_due across invoices re-adds that
    same arrears again for every later invoice. See Invoice.term_charge.
    """
    invoices = models.Invoice.objects.filter(enrollment__student=student)
    total_charged = invoices.aggregate(
        s=Sum(F("amount_due") - F("brought_forward"))
    )["s"] or Decimal("0")
    total_paid = invoices.aggregate(s=Sum("amount_paid"))["s"] or Decimal("0")
    return total_charged - total_paid


def generate_invoice(enrollment: models.Enrollment, term: models.Term) -> models.Invoice:
    """
    Creates this term's invoice, automatically folding in whatever the
    student's running balance was from ALL previous terms:
      - Unpaid arrears (positive balance) get ADDED to this term's fee.
      - A credit/prepaid balance (negative, from an earlier overpayment)
        gets SUBTRACTED from this term's fee - "pushed to next term
        automatically when it's active", exactly as requested.
    Calling this twice for the same enrollment/fee_structure is safe - it
    just returns the existing invoice rather than recomputing brought_forward.
    """
    fee_structure = models.FeeStructure.objects.filter(
        grade_level=enrollment.classroom.grade_level, term=term
    ).first()
    if not fee_structure:
        raise ValueError("No fee structure defined for this grade/term yet.")

    existing = models.Invoice.objects.filter(enrollment=enrollment, fee_structure=fee_structure).first()
    if existing:
        return existing

    brought_forward = get_outstanding_balance(enrollment.student)
    invoice = models.Invoice.objects.create(
        enrollment=enrollment,
        fee_structure=fee_structure,
        brought_forward=brought_forward,
        amount_due=fee_structure.total_amount + brought_forward,
    )
    return invoice


def generate_receipt_no() -> str:
    """RCT-<year>-00001, sequential per calendar year, independent of admission numbers."""
    prefix = f"RCT-{timezone.now().year}-"
    last = models.Payment.objects.filter(receipt_no__startswith=prefix).order_by("-receipt_no").first()
    next_seq = 1
    if last:
        try:
            next_seq = int(last.receipt_no.split("-")[-1]) + 1
        except ValueError:
            pass
    return f"{prefix}{next_seq:05d}"


def recalculate_student_invoice_chain(student: models.StudentProfile):
    """
    Walks every invoice for `student`, oldest term first, and recomputes
    brought_forward / amount_due from ACTUAL payments made so far -
    never trusting the stale snapshot Invoice.brought_forward normally
    holds.

    This is what fixes the "phantom balance" bug: if an older term's
    invoice gets paid off directly, AFTER a newer invoice had already
    baked that old unpaid amount in as its brought_forward, the newer
    invoice's amount_due never used to shrink to reflect it - leaving a
    balance that could never be cleared no matter what you paid.

    Call this after EVERY payment (any invoice, any student) - see
    record_payment() below - so the chain is always self-correcting
    instead of drifting further out of sync over time.
    """
    invoices = list(
        models.Invoice.objects.filter(enrollment__student=student)
        .select_related("fee_structure")
        .order_by("fee_structure__term__academic_year__year", "fee_structure__term__term_number")
    )

    running_balance = Decimal("0")  # unpaid (or credit, if negative) carried into the NEXT invoice
    changed_ids = []

    for invoice in invoices:
        own_charge = invoice.fee_structure.total_amount
        correct_brought_forward = running_balance
        correct_amount_due = own_charge + correct_brought_forward

        if invoice.brought_forward != correct_brought_forward or invoice.amount_due != correct_amount_due:
            invoice.brought_forward = correct_brought_forward
            invoice.amount_due = correct_amount_due
            invoice.save(update_fields=["brought_forward", "amount_due"])
            changed_ids.append(invoice.id)

        # what carries into the NEXT invoice: this invoice's own balance
        # (negative = this invoice is itself in credit)
        running_balance = correct_amount_due - invoice.amount_paid

    return changed_ids


def record_payment(invoice: models.Invoice, amount: Decimal, method: str, reference: str, recorded_by):
    """
    Records a payment against an invoice, then immediately recalculates
    that student's ENTIRE invoice chain so every later invoice's
    brought_forward/amount_due reflects what was just paid - regardless
    of which invoice (oldest or not) the payment landed on.
    """
    payment = models.Payment.objects.create(
        invoice=invoice, amount=amount, method=method, reference=reference,
        recorded_by=recorded_by, receipt_no=generate_receipt_no(),
    )
    invoice.amount_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or 0
    invoice.save(update_fields=["amount_paid"])

    recalculate_student_invoice_chain(invoice.enrollment.student)
    invoice.refresh_from_db()  # amount_due/brought_forward may have just changed above

    return payment


def _get_mpesa_access_token() -> str:
    response = requests.get(
        f"{settings.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
        auth=(settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def initiate_payment(invoice: models.Invoice, phone_number: str, amount: Decimal, initiated_by):
    """
    Single entry point a student/parent/finance officer calls to pay fees.

    - DEBUG=True (local dev / demos): bypasses Safaricom completely and
      completes the payment immediately, so the whole flow (including the
      receipt + QR code) can be exercised without real M-Pesa credentials.
    - DEBUG=False (production): sends a genuine STK push via the Safaricom
      Daraja API. The Payment row is only created once Safaricom calls back
      to handle_mpesa_callback() - this function returns a PENDING result
      and the frontend polls /payments/status/<checkout_request_id>/.
    """
    if amount <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    if settings.DEBUG:
        payment = record_payment(
            invoice, amount, models.Payment.Method.MPESA,
            reference="DEBUG-BYPASS", recorded_by=initiated_by,
        )
        return {"status": "COMPLETED", "payment": payment}

    # ---- production: real Safaricom Daraja STK Push ----
    access_token = _get_mpesa_access_token()
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(
        f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}".encode()
    ).decode()

    payload = {
        "BusinessShortCode": settings.MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": phone_number,
        "PartyB": settings.MPESA_SHORTCODE,
        "PhoneNumber": phone_number,
        "CallBackURL": settings.MPESA_CALLBACK_URL,
        "AccountReference": f"FEES-{invoice.id}",
        "TransactionDesc": f"School fees - {invoice.enrollment.student.admission_no}",
    }
    response = requests.post(
        f"{settings.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    data = response.json()

    stk_request = models.MpesaSTKPushRequest.objects.create(
        invoice=invoice,
        phone_number=phone_number,
        amount=amount,
        checkout_request_id=data.get("CheckoutRequestID"),
        merchant_request_id=data.get("MerchantRequestID", ""),
        status=models.MpesaSTKPushRequest.Status.PENDING,
        initiated_by=initiated_by,
    )
    return {"status": "PENDING", "stk_request": stk_request, "raw_response": data}


@transaction.atomic
def handle_mpesa_callback(payload: dict):
    """
    Processes Safaricom's STK push callback:
    { "Body": { "stkCallback": {
          "CheckoutRequestID": "...", "ResultCode": 0,
          "CallbackMetadata": { "Item": [{"Name": "Amount", ...}, {"Name": "MpesaReceiptNumber", ...}] }
    }}}
    ResultCode 0 = success; anything else = failed/cancelled by the user.
    """
    callback = payload.get("Body", {}).get("stkCallback", {})
    checkout_id = callback.get("CheckoutRequestID")
    result_code = callback.get("ResultCode")

    stk_request = models.MpesaSTKPushRequest.objects.filter(checkout_request_id=checkout_id).first()
    if not stk_request or stk_request.status != models.MpesaSTKPushRequest.Status.PENDING:
        return None

    if result_code == 0:
        items = {i.get("Name"): i.get("Value") for i in callback.get("CallbackMetadata", {}).get("Item", [])}
        mpesa_receipt = items.get("MpesaReceiptNumber", "")
        amount = items.get("Amount", stk_request.amount)
        payment = record_payment(
            stk_request.invoice, Decimal(str(amount)), models.Payment.Method.MPESA,
            reference=mpesa_receipt, recorded_by=stk_request.initiated_by,
        )
        stk_request.status = models.MpesaSTKPushRequest.Status.COMPLETED
        stk_request.save(update_fields=["status"])
        return payment

    stk_request.status = models.MpesaSTKPushRequest.Status.FAILED
    stk_request.result_description = callback.get("ResultDesc", "")
    stk_request.save(update_fields=["status", "result_description"])
    return None


def generate_receipt_qr_base64(payment: models.Payment) -> str:
    """
    Encodes a QR code linking to the public receipt-verification page, so
    anyone (a bursar, an auditor, the parent themselves) can scan a printed
    receipt and confirm it's genuine without trusting the paper alone.
    """
    verify_url = f"{settings.FRONTEND_URL}/verify-receipt/{payment.receipt_no}"
    img = qrcode.make(verify_url)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


def record_bulk_payment(student: models.StudentProfile, amount: Decimal, method: str, reference: str, recorded_by):
    """
    Pays a student's TOTAL outstanding balance in one call, applying it
    oldest-invoice-first. Re-queries the student's invoices after EVERY
    payment (rather than working off a list computed once up front)
    because record_payment() now recalculates the whole chain each time,
    which can shrink a later invoice's balance mid-loop.
    """
    if amount <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    remaining = Decimal(amount)
    payments = []

    while remaining > 0:
        invoice = (
            models.Invoice.objects.filter(enrollment__student=student, amount_due__gt=F("amount_paid"))
            .select_related("fee_structure__term")
            .order_by("fee_structure__term__academic_year__year", "fee_structure__term__term_number")
            .first()
        )
        if not invoice:
            break  # every invoice is fully settled
        pay_amount = min(remaining, invoice.balance)
        payments.append(record_payment(invoice, pay_amount, method, reference, recorded_by))
        remaining -= pay_amount

    if remaining > 0:
        # every invoice fully settled but money's left over - park it as
        # credit on the most recent invoice, same as an ordinary
        # single-invoice overpayment
        target = (
            models.Invoice.objects.filter(enrollment__student=student)
            .order_by("-fee_structure__term__academic_year__year", "-fee_structure__term__term_number")
            .first()
        )
        if not target:
            raise ValueError("This student has no invoices yet - nothing to pay against.")
        payments.append(record_payment(target, remaining, method, reference, recorded_by))

    if not payments:
        raise ValueError("This student has no invoices yet - nothing to pay against.")

    return payments


# ---------------------------------------------------------------------------
# INVOICE GENERATION ENGINE (the daily scheduled job runs this)
# ---------------------------------------------------------------------------
def _terms_to_process(academic_year: "models.AcademicYear"):
    """
    Every term of the given academic year that has already started
    (start_date in the past or today).

    Processing every started term - not just the one flagged is_current -
    is what gives the engine its backfill behaviour for free: if Term 1's
    invoices were never generated (e.g. its FeeStructure was only added
    after the fact), running this while Term 2 is current still catches
    Term 1, because Term 1's start_date is still <= today.
    """
    today = timezone.now().date()
    return models.Term.objects.filter(
        academic_year=academic_year, start_date__lte=today
    ).order_by("term_number")


def _record_missing_fee_structure(grade_level, term, affected_count=None):
    """
    Creates or refreshes the FeeStructureMissingAlert for (grade_level, term).

    Pass affected_count when you know the precise number (the nightly
    engine always does, since it processes a whole grade at once). Leave
    it None for an ad-hoc single-student call (e.g. right after admitting
    one new student mid-term) so it doesn't stomp a more accurate count
    that a previous full run already recorded - the next nightly run
    corrects the count regardless.
    """
    alert, created = models.FeeStructureMissingAlert.objects.get_or_create(
        grade_level=grade_level,
        term=term,
        defaults={"affected_student_count": affected_count or 1},
    )
    if not created:
        alert.is_resolved = False
        alert.resolved_at = None
        if affected_count is not None:
            alert.affected_student_count = affected_count
        alert.save(update_fields=["is_resolved", "resolved_at", "affected_student_count"])
    return alert


def _resolve_fee_structure_alert(grade_level, term):
    models.FeeStructureMissingAlert.objects.filter(
        grade_level=grade_level, term=term, is_resolved=False
    ).update(is_resolved=True, resolved_at=timezone.now())


def generate_invoices_for_term(term: "models.Term", enrollments=None) -> dict:
    """
    Generates (or backfills) invoices for every ACTIVE enrollment, for one
    term, across EVERY grade level at once.

    Idempotent: generate_invoice() already returns the existing invoice
    instead of duplicating one (see its `existing = ...` check), so this
    is completely safe to run repeatedly - a student never gets billed
    twice for the same term no matter how many times the job fires.

    Students whose grade has no FeeStructure configured for this term are
    counted and rolled into a FeeStructureMissingAlert instead of raising
    - one bad/missing fee structure never blocks the other grades from
    being invoiced in the same run.
    """
    if enrollments is None:
        enrollments = models.Enrollment.objects.filter(
            academic_year=term.academic_year, status=models.Enrollment.Status.ACTIVE
        ).select_related("classroom__grade_level", "student__user")

    created, already_existed, missing_fee_structures = [], [], {}

    # Group by grade so FeeStructure is looked up once per grade (not once
    # per student) - this is what makes "run across all classes" cheap:
    # one query per grade rather than one per student per grade.
    by_grade = {}
    for enrollment in enrollments:
        by_grade.setdefault(enrollment.classroom.grade_level_id, []).append(enrollment)

    for grade_enrollments in by_grade.values():
        grade_level = grade_enrollments[0].classroom.grade_level
        fee_structure = models.FeeStructure.objects.filter(
            grade_level=grade_level, term=term
        ).first()

        if not fee_structure:
            _record_missing_fee_structure(grade_level, term, len(grade_enrollments))
            missing_fee_structures[grade_level.name] = len(grade_enrollments)
            continue

        # this grade/term is fully configured this run - clear any stale alert
        _resolve_fee_structure_alert(grade_level, term)

        for enrollment in grade_enrollments:
            existing = models.Invoice.objects.filter(
                enrollment=enrollment, fee_structure=fee_structure
            ).first()
            if existing:
                already_existed.append(existing.id)
                continue
            invoice = generate_invoice(enrollment, term)
            created.append(invoice.id)

    return {
        "term": str(term),
        "invoices_created": len(created),
        "invoices_already_existed": len(already_existed),
        "missing_fee_structures": missing_fee_structures,
    }


def run_daily_invoice_generation() -> dict:
    """
    Entry point for the scheduled job (scheduler.py / management command).

    For the CURRENT academic year only, walks every term that has already
    started and generates/backfills invoices for every active enrollment,
    across every grade level in one pass. Concretely, this means:

      - A student admitted TODAY gets billed for the current term the
        next time this job runs (it's also triggered immediately on
        admission - see the hook in StudentEnrollSerializer.create()).
      - If an earlier term in the SAME academic year was never invoiced
        for some students (e.g. their FeeStructure only got configured
        after that term had already started), it gets backfilled
        automatically the next time this runs - no manual re-run needed.
      - A grade with no FeeStructure yet doesn't block anything else;
        it's flagged via FeeStructureMissingAlert and simply picked up
        automatically once ICT/Finance adds the missing FeeStructure.

    Deliberately scoped to the CURRENT academic year only - a past
    cohort's invoices are historical records and are never touched or
    regenerated by this job.
    """
    current_year = models.AcademicYear.objects.filter(is_current=True).first()
    if not current_year:
        return {"detail": "No current academic year is configured.", "results": []}

    terms = _terms_to_process(current_year)
    if not terms.exists():
        return {
            "detail": "No terms have started yet for the current academic year.",
            "results": [],
        }

    active_enrollments = models.Enrollment.objects.filter(
        academic_year=current_year, status=models.Enrollment.Status.ACTIVE
    ).select_related("classroom__grade_level", "student__user")

    results = [generate_invoices_for_term(term, active_enrollments) for term in terms]

    return {
        "academic_year": current_year.year,
        "terms_processed": len(results),
        "results": results,
    }


# ---------------------------------------------------------------------------
# PARENTS / GUARDIANS
# ---------------------------------------------------------------------------
def attach_guardian(
        student: models.StudentProfile,
        full_name: str,
        phone_number: str,
        relationship: str,
        email: str = "",
    ):
    """
    Links a parent/guardian to a newly admitted student.

    Reuses an existing ParentGuardianProfile if a PARENT user with this
    exact phone number already exists (e.g. admitting a second child of
    the same parent) instead of creating a duplicate account/login for
    the same person.

    If an existing parent has no email and a new email is provided,
    the parent's email is updated.

    Only creates a new User + ParentGuardianProfile when no matching
    parent account is found.
    """
    existing_user = models.User.objects.filter(
        role=models.User.Role.PARENT,
        phone_number=phone_number
    ).first()

    if existing_user:
        guardian_profile, _ = models.ParentGuardianProfile.objects.get_or_create(
            user=existing_user
        )

        # Add email to existing parent if they don't already have one
        if email and not existing_user.email:
            existing_user.email = email
            existing_user.save(update_fields=["email"])

    else:
        name_parts = full_name.split(" ", 1) if full_name else ["Guardian"]

        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        # Phone number doubles as the login username for parents.
        # Guard against username collisions.
        username = phone_number
        suffix = 1

        while models.User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{phone_number}-{suffix}"

        guardian_user = models.User.objects.create(
            username=username,
            first_name=first_name,
            last_name=last_name,
            phone_number=phone_number,
            email=email,
            role=models.User.Role.PARENT,
        )

        guardian_user.set_password("password123")
        guardian_user.save()

        guardian_profile = models.ParentGuardianProfile.objects.create(
            user=guardian_user
        )

    models.ParentStudentLink.objects.get_or_create(
        parent=guardian_profile,
        student=student,
        defaults={
            "relationship": relationship,
        },
    )

    return guardian_profile


def upsert_guardian(
    student: models.StudentProfile,
    full_name: str,
    phone_number: str,
    relationship: str,
    email: str = "",
):
    """
    Used by the admin Edit-Student form to keep "one guardian per student"
    in sync with whatever's typed in the form.

    - If the student already has a guardian with the same phone number,
      update their relationship, name, and email in place.
    - If the phone number changed, remove the old guardian link and attach
      the new guardian through attach_guardian().
    - attach_guardian() handles reusing an existing PARENT account with
      the same phone number.
    - This intentionally supports one guardian per student through this form.
      Students with multiple guardians can still be managed directly via
      the parent-links endpoints.
    """
    if not phone_number:
        return None

    existing_links = (
        models.ParentStudentLink.objects
        .filter(student=student)
        .select_related("parent__user")
    )

    match = existing_links.filter(
        parent__user__phone_number=phone_number
    ).first()

    if match:
        # Update relationship
        if match.relationship != relationship:
            match.relationship = relationship
            match.save(update_fields=["relationship"])

        # Update guardian name
        if full_name and match.parent.user.get_full_name() != full_name:
            parts = full_name.split(" ", 1)

            match.parent.user.first_name = parts[0]
            match.parent.user.last_name = parts[1] if len(parts) > 1 else ""

            match.parent.user.save(
                update_fields=["first_name", "last_name"]
            )

        # Update guardian email
        if email and match.parent.user.email != email:
            match.parent.user.email = email
            match.parent.user.save(update_fields=["email"])

        return match.parent

    # Phone number changed / no matching guardian.
    # Remove the old guardian link(s) and attach the new/reused guardian.
    existing_links.delete()

    return attach_guardian(
        student,
        full_name,
        phone_number,
        relationship,
        email,
    )


# ---------------------------------------------------------------------------
# COMMUNICATIONS & MESSAGING
# ---------------------------------------------------------------------------
def send_sms_notification(phone_number, message):
    """
    Placeholder SMS gateway. Wire this up to Africa's Talking, Twilio, etc.
    Mirrors the DEBUG-bypass pattern already used for M-Pesa STK push
    (see initiate_payment): in DEBUG we simulate a successful send instead
    of calling a real API, so the whole flow is testable with no credentials.
    Returns (ok: bool, error_message: str).
    """
    if not phone_number:
        return False, "No phone number on file."
    if settings.DEBUG:
        print(f"[DEBUG SMS] To {phone_number}: {message}")
        return True, ""
    # TODO: call your SMS provider here, e.g. Africa's Talking:
    #   africastalking.SMS.send(message, [phone_number])
    return False, "SMS gateway not configured for production."


def send_email_notification(to_email, subject, body):
    """Returns (ok: bool, error_message: str)."""
    if not to_email:
        return False, "No email address on file."
    try:
        send_mail(subject, body, getattr(settings, "DEFAULT_FROM_EMAIL", None), [to_email], fail_silently=False)
        return True, ""
    except Exception as exc:  # noqa: BLE001 - surfaced to CommunicationRecipient.error_message
        return False, str(exc)


def resolve_communication_audience(communication):
    """
    Returns a list of (user, student_or_None) pairs for `communication`,
    respecting include_students / include_guardians. student_or_None is
    the StudentProfile this row concerns, used for fee-balance
    personalization - None for role-wide broadcasts with no student
    context (e.g. "all Teachers").
    """
    students_qs = models.StudentProfile.objects.none()

    if communication.audience_type == models.Communication.AudienceType.ROLE:
        users = models.User.objects.filter(
            role__in=communication.target_roles, is_active_staff=True
        ).distinct()
        return [(u, None) for u in users]

    if communication.audience_type == models.Communication.AudienceType.GRADE:
        enrollments = models.Enrollment.objects.filter(
            status=models.Enrollment.Status.ACTIVE,
            classroom__grade_level=communication.grade_level,
        )
        if communication.academic_year_id:
            enrollments = enrollments.filter(academic_year=communication.academic_year)
        students_qs = models.StudentProfile.objects.filter(id__in=enrollments.values("student_id"))

    elif communication.audience_type == models.Communication.AudienceType.CLASSROOM:
        enrollments = models.Enrollment.objects.filter(
            status=models.Enrollment.Status.ACTIVE, classroom=communication.classroom
        )
        students_qs = models.StudentProfile.objects.filter(id__in=enrollments.values("student_id"))

    elif communication.audience_type == models.Communication.AudienceType.INDIVIDUAL:
        students_qs = communication.target_students.all()

    students_qs = students_qs.select_related("user")
    pairs = {}  # user_id -> (user, student) - a guardian with 2 targeted kids collapses to 1 row

    if communication.include_students:
        for student in students_qs:
            pairs[student.user_id] = (student.user, student)

    if communication.include_guardians:
        links = models.ParentStudentLink.objects.filter(student__in=students_qs).select_related(
            "parent__user", "student"
        )
        for link in links:
            guardian_user = link.parent.user
            # keep the first linked student as the "primary" context for
            # this guardian; _personalize_fee_body below still lists ALL
            # of the guardian's targeted children, not just this one.
            pairs.setdefault(guardian_user.id, (guardian_user, link.student))

    return list(pairs.values())


def _personalize_fee_body(communication, user, primary_student):
    """For FEE_REMINDER communications, append each relevant student's live outstanding balance. Falls back to the plain body for every other category."""
    if communication.category != models.Communication.Category.FEE_REMINDER:
        return communication.body

    if user.role == models.User.Role.STUDENT:
        students = [primary_student] if primary_student else []
    elif user.role == models.User.Role.PARENT:
        target_ids = communication.target_students.values_list("id", flat=True)
        students = list(models.StudentProfile.objects.filter(id__in=target_ids, guardians__user=user))
    else:
        students = []

    if not students:
        return communication.body

    lines = [communication.body, ""]
    for student in students:
        balance = get_outstanding_balance(student)
        lines.append(f"{student.user.get_full_name()} ({student.admission_no}): KES {balance:,.2f} outstanding")
    return "\n".join(lines)


def send_communication(communication):
    """
    Resolves the audience, creates a CommunicationRecipient row per
    (user, channel), and dispatches each enabled channel immediately.
    Synchronous by design - there's no task queue in this project yet.
    If send volumes grow, move the per-recipient loop into a Celery task
    without changing this function's signature.
    """
    audience = resolve_communication_audience(communication)

    channels = []
    if communication.send_in_app:
        channels.append(models.CommunicationRecipient.Channel.IN_APP)
    if communication.send_sms:
        channels.append(models.CommunicationRecipient.Channel.SMS)
    if communication.send_email:
        channels.append(models.CommunicationRecipient.Channel.EMAIL)

    created = []
    for user, student in audience:
        body = _personalize_fee_body(communication, user, student)
        for channel in channels:
            recipient, _ = models.CommunicationRecipient.objects.get_or_create(
                communication=communication, user=user, channel=channel,
                defaults={"personalized_body": body},
            )
            if channel == models.CommunicationRecipient.Channel.IN_APP:
                recipient.status = models.CommunicationRecipient.Status.SENT
                recipient.sent_at = timezone.now()
            elif channel == models.CommunicationRecipient.Channel.SMS:
                ok, err = send_sms_notification(user.phone_number, body)
                recipient.status = models.CommunicationRecipient.Status.SENT if ok else models.CommunicationRecipient.Status.FAILED
                recipient.error_message = err
                recipient.sent_at = timezone.now() if ok else None
            elif channel == models.CommunicationRecipient.Channel.EMAIL:
                ok, err = send_email_notification(user.email, communication.subject, body)
                recipient.status = models.CommunicationRecipient.Status.SENT if ok else models.CommunicationRecipient.Status.FAILED
                recipient.error_message = err
                recipient.sent_at = timezone.now() if ok else None
            recipient.save()
            created.append(recipient)
    return created


# ---------------------------------------------------------------------------
# BULK CLASSROOM CREATION
# ---------------------------------------------------------------------------
def bulk_create_classrooms(academic_year, grade_level_ids, stream_ids):
    """
    Creates one ClassRoom for every (grade_level x stream) combination for
    the given academic_year. Idempotent - if a classroom already exists
    for a given combination (unique_together on ClassRoom), it's skipped
    rather than erroring, so this is safe to re-run e.g. after adding a
    new stream mid-year.
    """
    grade_levels = models.GradeLevel.objects.filter(id__in=grade_level_ids)
    streams = models.Stream.objects.filter(id__in=stream_ids)

    created, skipped = [], []
    for grade_level in grade_levels:
        for stream in streams:
            obj, was_created = models.ClassRoom.objects.get_or_create(
                grade_level=grade_level, stream=stream, academic_year=academic_year,
            )
            (created if was_created else skipped).append(obj)

    return {"created": created, "skipped": skipped}


# ---------------------------------------------------------------------------
# TIMETABLE MANAGEMENT
# ---------------------------------------------------------------------------
def get_unallocated_subjects(academic_year, classroom=None):
    """
    For each classroom in academic_year (or just one, if given), returns the
    subjects that GradeSubject says are offered at that grade but have no
    TeacherSubjectAllocation row yet. This is what powers the "Unallocated
    Subjects" tab on the Teacher Allocation page.
    """
    classrooms = models.ClassRoom.objects.filter(academic_year=academic_year).select_related(
        "grade_level", "stream"
    )
    if classroom:
        classrooms = classrooms.filter(pk=classroom.pk)

    result = []
    for room in classrooms:
        offered_ids = set(
            models.GradeSubject.objects.filter(grade_level=room.grade_level).values_list("subject_id", flat=True)
        )
        allocated_ids = set(
            models.TeacherSubjectAllocation.objects.filter(
                classroom=room, academic_year=academic_year
            ).values_list("subject_id", flat=True)
        )
        missing_ids = offered_ids - allocated_ids
        if missing_ids:
            result.append({"classroom": room, "subjects": models.Subject.objects.filter(id__in=missing_ids)})
    return result


def full_allocation_check(academic_year):
    """True/False + the gap list - the auto-generator's precondition."""
    gaps = get_unallocated_subjects(academic_year)
    return (len(gaps) == 0, gaps)


@transaction.atomic
def auto_generate_timetable(term):
    """
    Greedy weekly scheduler. Preconditions: every classroom in
    term.academic_year must have every offered subject allocated to a
    teacher (see full_allocation_check) - raises ValueError otherwise so
    the frontend can show exactly which classroom/subject is still open.

    TEACHER CLASH RULE:
    A teacher may only be in ONE (subject, classroom) at a time, with a
    single deliberate exception: if the SAME teacher teaches the SAME
    subject to a DIFFERENT stream of the SAME grade (e.g. Form 4 Blue and
    Form 4 Red both doing Maths with the same teacher), those lessons are
    allowed to share the same slot - that's a genuinely combined class,
    not a double-booking. Any other overlap (different subject, and/or
    different grade) is always blocked, no exceptions.

    Classrooms are processed grade-by-grade, then stream name
    alphabetically (e.g. "Form 4 Blue" before "Form 4 Red"), so that when
    the second stream's allocation is placed, the scheduler actively
    looks for the slot where the first stream's matching (teacher,
    subject, grade) lesson already sits and tries to land on it - this is
    what makes combining actually happen, rather than the two streams
    merely avoiding a clash in unrelated slots.

    Algorithm (per classroom, subjects interleaved so the same subject
    doesn't cluster on one day):
      - build a "todo" queue from each TeacherSubjectAllocation's
        periods_per_week / double_lesson
      - walk the week's days in round-robin, and for each todo item:
          1. FIRST try to align onto a slot where this exact teacher is
             already teaching this exact subject to a sibling classroom
             in the same grade (the "combine" pass).
          2. Otherwise fall back to the normal search: the first day
             where the subject hasn't already been placed that day
             (skipped for double lessons) AND there's a free block of
             the right size AND the teacher has no clashing booking
             elsewhere (clashing = a different subject or grade).
      - anything that can't be placed after a full pass is reported back
        as "skipped" for manual placement on the grid

    This clears and regenerates only the slots this function created for
    this term/classroom that are still auto_generated=True (hand-placed
    entries are left alone) before writing the new layout.
    """
    ok, gaps = full_allocation_check(term.academic_year)
    if not ok:
        raise ValueError({
            "detail": "Cannot auto-generate: some classrooms still have unallocated subjects.",
            "gaps": [
                {"classroom": str(g["classroom"]), "subjects": [s.name for s in g["subjects"]]}
                for g in gaps
            ],
        })

    lesson_slots_by_day = defaultdict(list)
    for slot in models.PeriodSlot.objects.filter(slot_type=models.PeriodSlot.SlotType.LESSON).order_by(
        "day", "order"
    ):
        lesson_slots_by_day[slot.day].append(slot)
    days = [d for d, _ in models.PeriodSlot.Day.choices if d in lesson_slots_by_day]
    if not days:
        raise ValueError({"detail": "No LESSON period slots configured yet. Set up the timetable structure first."})

    # Deterministic order: grade level sequence, then stream name -
    # e.g. Form 4 Blue is fully placed before Form 4 Red is attempted,
    # so Red's matching allocations have something to combine onto.
    classrooms = models.ClassRoom.objects.filter(academic_year=term.academic_year).select_related(
        "grade_level", "stream"
    ).order_by("grade_level__level_order", "stream__name")

    # wipe only the auto-generated entries for this term - manual edits survive
    models.TimetableEntry.objects.filter(term=term, auto_generated=True).delete()

    # period_slot_id -> teacher_id -> [(subject_id, grade_level_id, classroom_id), ...]
    teacher_busy = defaultdict(lambda: defaultdict(list))
    for entry in models.TimetableEntry.objects.filter(term=term).select_related(
        "allocation__subject", "classroom__grade_level"
    ):
        teacher_busy[entry.period_slot_id][entry.allocation.teacher_id].append(
            (entry.allocation.subject_id, entry.classroom.grade_level_id, entry.classroom_id)
        )

    def bookings_compatible(bookings, subject_id, grade_level_id):
        """True if the teacher's existing bookings at this slot are all the
        SAME subject+grade as what we're trying to place (i.e. combinable),
        or if there are no existing bookings at all."""
        if not bookings:
            return True
        return all(b_subject == subject_id and b_grade == grade_level_id for b_subject, b_grade, _ in bookings)

    def has_matching_presence(bookings, subject_id, grade_level_id):
        """True if the teacher already has a compatible booking here that we
        could combine onto (used only for the 'prefer to align' pass)."""
        return bool(bookings) and bookings_compatible(bookings, subject_id, grade_level_id)

    created, skipped = [], []

    for classroom in classrooms:
        allocations = models.TeacherSubjectAllocation.objects.filter(
            classroom=classroom, academic_year=term.academic_year
        ).select_related("teacher", "subject")

        queue = []
        for alloc in allocations:
            periods = alloc.periods_per_week or 5
            if alloc.double_lesson:
                pairs, remainder = divmod(periods, 2)
                queue += [(alloc, 2)] * pairs + ([(alloc, 1)] if remainder else [])
            else:
                queue += [(alloc, 1)] * periods

        # interleave so the same subject isn't queued back-to-back
        by_subject = defaultdict(list)
        for item in queue:
            by_subject[item[0].subject_id].append(item)
        interleaved = []
        while any(by_subject.values()):
            for subj_id in list(by_subject):
                if by_subject[subj_id]:
                    interleaved.append(by_subject[subj_id].pop(0))
        queue = interleaved

        day_cycle = cycle(days)
        subjects_placed_today = defaultdict(set)  # day -> {subject_id, ...}

        # occupied slots for THIS classroom, refreshed as we place entries
        classroom_occupied = set(
            models.TimetableEntry.objects.filter(classroom=classroom, term=term).values_list(
                "period_slot_id", flat=True
            )
        )

        for alloc, block_size in queue:
            placed = False
            grade_level_id = classroom.grade_level_id

            # ---- Pass 1: try to COMBINE onto a slot where this teacher
            # already teaches this exact subject to a sibling stream of
            # the same grade. ----
            for day in days:
                if placed:
                    break
                if alloc.subject_id in subjects_placed_today[day] and not alloc.double_lesson:
                    continue
                slots = lesson_slots_by_day[day]
                for start in range(len(slots) - block_size + 1):
                    block = slots[start:start + block_size]
                    if any(s.id in classroom_occupied for s in block):
                        continue
                    if not all(
                        has_matching_presence(
                            teacher_busy[s.id].get(alloc.teacher_id, []), alloc.subject_id, grade_level_id
                        )
                        for s in block
                    ):
                        continue
                    for s in block:
                        entry = models.TimetableEntry.objects.create(
                            classroom=classroom, period_slot=s, term=term, allocation=alloc,
                            is_double=(block_size == 2), auto_generated=True,
                        )
                        created.append(entry.id)
                        classroom_occupied.add(s.id)
                        teacher_busy[s.id][alloc.teacher_id].append((alloc.subject_id, grade_level_id, classroom.id))
                    subjects_placed_today[day].add(alloc.subject_id)
                    placed = True
                    break

            if placed:
                continue

            # ---- Pass 2: normal search. A teacher may be placed here only
            # if they have no OTHER-subject/OTHER-grade booking in this
            # slot; a matching (same subject+grade) booking is fine too,
            # it just means Pass 1 will find it next time. ----
            for _ in range(len(days) * 2):  # bounded attempts across the week
                day = next(day_cycle)
                if alloc.subject_id in subjects_placed_today[day] and not alloc.double_lesson:
                    continue
                slots = lesson_slots_by_day[day]
                for start in range(len(slots) - block_size + 1):
                    block = slots[start:start + block_size]
                    if any(s.id in classroom_occupied for s in block):
                        continue
                    if any(
                        not bookings_compatible(
                            teacher_busy[s.id].get(alloc.teacher_id, []), alloc.subject_id, grade_level_id
                        )
                        for s in block
                    ):
                        continue
                    for s in block:
                        entry = models.TimetableEntry.objects.create(
                            classroom=classroom, period_slot=s, term=term, allocation=alloc,
                            is_double=(block_size == 2), auto_generated=True,
                        )
                        created.append(entry.id)
                        classroom_occupied.add(s.id)
                        teacher_busy[s.id][alloc.teacher_id].append((alloc.subject_id, grade_level_id, classroom.id))
                    subjects_placed_today[day].add(alloc.subject_id)
                    placed = True
                    break
                if placed:
                    break
            if not placed:
                skipped.append({
                    "classroom": str(classroom), "subject": alloc.subject.name,
                    "teacher": alloc.teacher.get_full_name(),
                })

    return {"created_count": len(created), "skipped": skipped}


# ---------------------------------------------------------------------------
# ADMIN CROSS-SUBJECT MARK SPREADSHEET
# ---------------------------------------------------------------------------
def get_admin_exam_spreadsheet(classroom: models.ClassRoom, exam: models.Exam) -> dict:
    grade_level = classroom.grade_level
    subject_ids = list(
        models.GradeSubject.objects.filter(grade_level=grade_level).values_list("subject_id", flat=True)
    )
    subjects = (
        models.Subject.objects.filter(id__in=subject_ids)
        .prefetch_related("papers")
        .order_by("name")
    )

    subject_payload = []
    for s in subjects:
        papers = list(s.papers.order_by("paper_number"))
        if papers:
            columns = [
                {"paper_id": p.id, "label": f"{s.code}{p.paper_number}", "max_marks": float(p.max_marks)}
                for p in papers
            ]
        else:
            columns = [{"paper_id": None, "label": s.code, "max_marks": 100.0}]
        subject_payload.append({
            "subject_id": s.id,
            "subject_name": s.name,
            "subject_code": s.code,
            "columns": columns,
        })

    enrollments = (
        classroom.enrollments.filter(status=models.Enrollment.Status.ACTIVE)
        .select_related("student__user")
        .order_by("student__user__first_name")
    )
    students = [
        {"enrollment_id": e.id, "admission_no": e.student.admission_no, "full_name": e.student.user.get_full_name()}
        for e in enrollments
    ]

    results = models.ExamResult.objects.filter(
        exam=exam, enrollment__classroom=classroom, subject_id__in=subject_ids
    )
    marks = {}
    for r in results:
        key = f"{r.enrollment_id}:{r.subject_id}:{r.paper_id or 'single'}"
        marks[key] = {
            "marks_obtained": None if r.is_absent or r.marks_obtained is None else float(r.marks_obtained),
            "is_absent": r.is_absent,
        }

    return {
        "classroom": str(classroom),
        "exam": str(exam),
        "subjects": subject_payload,
        "students": students,
        "marks": marks,
    }


@transaction.atomic
def save_admin_exam_spreadsheet(exam: models.Exam, entries: list, entered_by) -> dict:
    """
    entries: [{enrollment_id, subject_id, paper_id|None, max_marks, marks_obtained|None, is_absent}, ...]
    Blank, untouched cells (not absent, marks_obtained None) are skipped
    silently rather than counted as errors - the admin may only be filling
    in some subjects/students in this pass.
    """
    saved, errors = [], []
    for row in entries:
        enrollment_id = row.get("enrollment_id")
        subject_id = row.get("subject_id")
        paper_id = row.get("paper_id")
        max_marks = row.get("max_marks") or 100
        marks_obtained = row.get("marks_obtained")
        is_absent = bool(row.get("is_absent", False))

        if not is_absent and marks_obtained in (None, ""):
            continue

        enrollment = models.Enrollment.objects.filter(pk=enrollment_id).first()
        if not enrollment:
            errors.append({"enrollment_id": enrollment_id, "subject_id": subject_id, "error": "Enrollment not found"})
            continue

        try:
            obj, _ = models.ExamResult.objects.update_or_create(
                exam=exam, enrollment=enrollment, subject_id=subject_id, paper_id=paper_id,
                defaults={
                    "marks_obtained": None if is_absent else marks_obtained,
                    "max_marks": max_marks,
                    "is_absent": is_absent,
                    "entered_by": entered_by,
                },
            )
            saved.append(obj.id)
        except Exception as exc:  # noqa: BLE001
            errors.append({"enrollment_id": enrollment_id, "subject_id": subject_id, "error": str(exc)})

    return {"saved": saved, "errors": errors}


# ---------------------------------------------------------------------------
# LICENSING / SUBSCRIPTIONS
# ---------------------------------------------------------------------------
class LicenseLimitExceeded(Exception):
    pass


def get_school_license(school):
    lic, created = models.License.objects.get_or_create(
        school=school,
        defaults={"tier": models.PlanTier.TRIAL, "trial_ends_at": timezone.now() + timedelta(days=30)},
    )
    if created:
        lic.apply_tier_defaults()
        lic.valid_until = lic.trial_ends_at
        lic.save()
    return lic


def check_license_limit(school, resource, current_count, increment=1):
    """
    resource: "students" | "classrooms_per_year" | "teachers"
    current_count: caller supplies the live count (keeps this function
    query-agnostic - classrooms need scoping by academic_year, students/
    teachers don't).
    """
    lic = get_school_license(school)

    if lic.is_suspended:
        raise LicenseLimitExceeded("This account is suspended. Contact your software provider.")
    if lic.is_expired:
        models.LicenseAuditLog.objects.create(
            school=school, action=models.LicenseAuditLog.Action.EXPIRED,
            detail=f"Blocked action: license expired {lic.valid_until:%Y-%m-%d}.",
        )
        raise LicenseLimitExceeded("Your license has expired. Please renew to continue.")

    limit_field = {
        "students": lic.max_students,
        "classrooms_per_year": lic.max_classrooms_per_year,
        "teachers": lic.max_teachers,
    }[resource]

    if limit_field is None:
        return  # unlimited (Pro)

    if current_count + increment > limit_field:
        models.LicenseAuditLog.objects.create(
            school=school, action=models.LicenseAuditLog.Action.LIMIT_BLOCKED,
            detail=f"{resource}: {current_count}/{limit_field}, tried +{increment}.",
        )
        raise LicenseLimitExceeded(
            f"You've reached your plan's limit of {limit_field} {resource.replace('_', ' ')}. "
            f"Upgrade your plan to add more."
        )


def redeem_license_token(token_str, school, user):
    token = models.LicenseToken.objects.filter(token=token_str, is_active=True).first()
    if not token:
        raise ValueError("Invalid or deactivated code.")
    if token.is_redeemed:
        raise ValueError("This code has already been used.")
    if token.school_id and token.school_id != school.id:
        raise ValueError("This code isn't valid for your school.")

    lic = get_school_license(school)
    lic.tier = token.tier
    lic.apply_tier_defaults()
    for key, value in token.limits_override.items():
        setattr(lic, key, value)
    lic.valid_until = timezone.now() + timedelta(days=30 * token.valid_months)
    lic.is_suspended = False
    lic.save()

    token.school = school
    token.redeemed_at = timezone.now()
    token.redeemed_by = user
    token.save()

    models.LicenseAuditLog.objects.create(
        school=school, action=models.LicenseAuditLog.Action.REDEEMED,
        detail=f"Upgraded to {lic.get_tier_display()}, valid until {lic.valid_until:%Y-%m-%d}.",
        performed_by=user,
    )
    return lic


def _package_dict(package):
    if not package:
        return None
    return {
        "id": package.id,
        "tier": package.tier,
        "tier_display": package.get_tier_display(),
        "monthly_price": package.monthly_price,
        "max_students": package.max_students,
        "max_classrooms_per_year": package.max_classrooms_per_year,
        "max_teachers": package.max_teachers,
        "features": package.features,
    }


def get_license_usage(school):
    lic = get_school_license(school)
    current_year = models.AcademicYear.objects.filter(is_current=True).first()

    student_count = models.StudentProfile.objects.filter(is_active=True).count()
    teacher_count = models.User.objects.filter(role=models.User.Role.TEACHER, is_active_staff=True).count()
    classroom_count = (
        models.ClassRoom.objects.filter(academic_year=current_year).count() if current_year else 0
    )

    def usage_block(used, limit):
        return {"used": used, "limit": limit, "unlimited": limit is None}

    current_package = models.SubscriptionPackage.objects.filter(tier=lic.tier).first()

    return {
        "tier": lic.tier,
        "tier_display": lic.get_tier_display(),
        "valid_until": lic.valid_until,
        "trial_ends_at": lic.trial_ends_at,
        "is_suspended": lic.is_suspended,
        "is_expired": lic.is_expired,
        "usage": {
            "students": usage_block(student_count, lic.max_students),
            "classrooms_this_year": usage_block(classroom_count, lic.max_classrooms_per_year),
            "teachers": usage_block(teacher_count, lic.max_teachers),
        },
        "current_package": _package_dict(current_package),
    }


def list_active_packages():
    return models.SubscriptionPackage.objects.filter(is_active=True).order_by("display_order", "monthly_price")