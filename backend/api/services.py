"""
Service layer - business rules live here, NOT in views/serializers.
Views should stay thin: parse request -> call a service -> return response.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Avg, Count, Q

from . import models


# ---------------------------------------------------------------------------
# ADMISSION NUMBERS
# ---------------------------------------------------------------------------
def generate_admission_no(year: int) -> str:
    """
    Generates a sequential admission number scoped to the intake year,
    e.g. 2026/0001. Deliberately independent of the User.id (uuid) or any
    login credential - admission numbers are printed on report forms and
    must stay short, sequential and human-readable.
    """
    prefix = f"{year}/"
    last = (
        models.StudentProfile.objects.filter(admission_no__startswith=prefix)
        .order_by("-admission_no")
        .first()
    )
    next_seq = 1
    if last:
        try:
            next_seq = int(last.admission_no.split("/")[-1]) + 1
        except ValueError:
            pass
    return f"{prefix}{next_seq:04d}"


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
# SUBJECT SELECTION VALIDATION
# ---------------------------------------------------------------------------
def validate_subject_selection(grade_level: models.GradeLevel, subject_ids: list[int]):
    """
    Raises ValueError with a human-readable message if the chosen subject
    list breaks the grade's compulsory / min / max rules.
    Returns the cleaned list of Subject instances on success.
    """
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
    if rule:
        if len(chosen_optional) < rule.min_optional_subjects:
            raise ValueError(
                f"Must select at least {rule.min_optional_subjects} optional subject(s)."
            )
        if len(chosen_optional) > rule.max_optional_subjects:
            raise ValueError(
                f"May select at most {rule.max_optional_subjects} optional subject(s)."
            )
        total = len(chosen)
        if not (rule.min_total_subjects <= total <= rule.max_total_subjects):
            raise ValueError(
                f"Total subjects must be between {rule.min_total_subjects} and {rule.max_total_subjects}."
            )

    return models.Subject.objects.filter(id__in=chosen)


@transaction.atomic
def set_student_subjects(enrollment: models.Enrollment, subject_ids: list[int]):
    subjects = validate_subject_selection(enrollment.classroom.grade_level, subject_ids)
    models.StudentSubjectSelection.objects.filter(enrollment=enrollment).delete()
    models.StudentSubjectSelection.objects.bulk_create(
        [models.StudentSubjectSelection(enrollment=enrollment, subject=s) for s in subjects]
    )
    return subjects


# ---------------------------------------------------------------------------
# GRADING
# ---------------------------------------------------------------------------
def grade_for_percentage(curriculum_type: str, percentage: Decimal, subject: models.Subject = None):
    """Looks up the applicable grading scale row for a percentage score."""
    qs = models.GradingScale.objects.filter(
        curriculum_type=curriculum_type,
        min_percentage__lte=percentage,
        max_percentage__gte=percentage,
    )
    # subject-specific scale takes priority over the curriculum-wide default
    specific = qs.filter(subject=subject).first() if subject else None
    return specific or qs.filter(subject__isnull=True).first()


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


# ---------------------------------------------------------------------------
# FEES
# ---------------------------------------------------------------------------
def generate_invoice(enrollment: models.Enrollment, term: models.Term):
    fee_structure = models.FeeStructure.objects.filter(
        grade_level=enrollment.classroom.grade_level, term=term
    ).first()
    if not fee_structure:
        raise ValueError("No fee structure defined for this grade/term yet.")
    invoice, _ = models.Invoice.objects.get_or_create(
        enrollment=enrollment,
        fee_structure=fee_structure,
        defaults={"amount_due": fee_structure.total_amount},
    )
    return invoice


def record_payment(invoice: models.Invoice, amount: Decimal, method: str, reference: str, recorded_by):
    payment = models.Payment.objects.create(
        invoice=invoice, amount=amount, method=method, reference=reference, recorded_by=recorded_by
    )
    invoice.amount_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or 0
    invoice.save(update_fields=["amount_paid"])
    return payment