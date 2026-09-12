"""
Service layer - business rules live here, NOT in views/serializers.
Views should stay thin: parse request -> call a service -> return response.
"""
import base64
import io
from decimal import Decimal
from django.core.mail import send_mail

import qrcode
import requests
from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Avg, Count, Q
from django.utils import timezone

from . import models


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
# FEES - carry-forward ledger, STK push (with DEBUG bypass), receipts
# ---------------------------------------------------------------------------
def get_outstanding_balance(student: models.StudentProfile) -> Decimal:
    """
    Sums balance (amount_due - amount_paid) across EVERY invoice this
    student has ever had, across every enrollment/classroom/academic year.
    Positive = still owes money overall. Negative = has a credit/prepaid
    balance that will reduce what's due on their next invoice.
    """
    invoices = models.Invoice.objects.filter(enrollment__student=student)
    total_due = invoices.aggregate(s=Sum("amount_due"))["s"] or Decimal("0")
    total_paid = invoices.aggregate(s=Sum("amount_paid"))["s"] or Decimal("0")
    return total_due - total_paid


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


def record_payment(invoice: models.Invoice, amount: Decimal, method: str, reference: str, recorded_by):
    """
    Records a payment against an invoice. Deliberately does NOT clamp the
    amount to the outstanding balance - a student paying more than they owe
    is allowed, and simply leaves the invoice with a negative `balance`
    (a credit), which get_outstanding_balance() picks up and
    generate_invoice() then carries forward to the next term automatically.
    """
    payment = models.Payment.objects.create(
        invoice=invoice, amount=amount, method=method, reference=reference,
        recorded_by=recorded_by, receipt_no=generate_receipt_no(),
    )
    invoice.amount_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or 0
    invoice.save(update_fields=["amount_paid"])
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


# ===========================================================================
# COMMUNICATIONS - append to services.py.
# Needs at top of services.py (add if not already present):
#   from django.conf import settings
#   from django.core.mail import send_mail
#   from django.utils import timezone
#   from . import models
#
# ASSUMPTION: this calls services.get_outstanding_balance(student), inferred
# from the docstring on Invoice.brought_forward referencing it. If your
# actual signature differs, that's the only call site to fix.
# ===========================================================================

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
        try:
            balance = get_outstanding_balance(student)  # existing helper - see module docstring above
            lines.append(f"{student.user.get_full_name()} ({student.admission_no}): KES {balance:,.2f} outstanding")
        except NameError:
            # get_outstanding_balance isn't defined under that exact name in
            # this project - adjust the call above to match your services.py.
            break
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



import random
from datetime import timedelta
from django.conf import settings
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from django.utils.crypto import get_random_string
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from . import models, serializers, utils

_signer = TimestampSigner(salt="2fa-login-challenge")


# ---------------------------------------------------------------------------
# TOKEN ISSUING
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


# ---------------------------------------------------------------------------
# USERNAME VALIDATION (blocks the "giant garbage string" case)
# ---------------------------------------------------------------------------
def validate_login_username(username):
    if not username or len(username) > utils.USERNAME_MAX_LENGTH or not utils.USERNAME_PATTERN.match(username):
        raise ValueError("Invalid username format.")
    return username


# ---------------------------------------------------------------------------
# LOCKOUT / FAILED ATTEMPTS
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# OTP (2FA) - Admin / Teacher / Finance only
# ---------------------------------------------------------------------------
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
    from django.core.mail import send_mail
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


# ---------------------------------------------------------------------------
# ADMIN NOTIFICATIONS (reuses the existing Communication/notification system)
# ---------------------------------------------------------------------------
def _notify_admins(subject, body):
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
# STUDENT-ONLY PASSWORD RESET
# ---------------------------------------------------------------------------
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
    from django.core.mail import send_mail
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
    
    
    
# ===========================================================================
# TIMETABLE MANAGEMENT - append to services.py
# ===========================================================================
from collections import defaultdict
from itertools import cycle


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

    Algorithm (per classroom, subjects interleaved so the same subject
    doesn't cluster on one day):
      - build a "todo" queue from each TeacherSubjectAllocation's
        periods_per_week / double_lesson
      - walk the week's days in round-robin, and for each todo item find
        the first day where: the subject hasn't already been placed that
        day (skipped for double lessons, which may still take 2 days) AND
        there's a free block of the right size (1 or 2 consecutive
        LESSON slots) AND the teacher isn't already busy in that slot
        (checked against every other classroom too)
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

    classrooms = models.ClassRoom.objects.filter(academic_year=term.academic_year)

    # wipe only the auto-generated entries for this term - manual edits survive
    models.TimetableEntry.objects.filter(term=term, auto_generated=True).delete()

    teacher_busy = defaultdict(set)  # period_slot_id -> {teacher_id, ...}
    for entry in models.TimetableEntry.objects.filter(term=term).select_related("allocation"):
        teacher_busy[entry.period_slot_id].add(entry.allocation.teacher_id)

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
            for _ in range(len(days) * 2):  # bounded attempts across the week
                day = next(day_cycle)
                if alloc.subject_id in subjects_placed_today[day] and not alloc.double_lesson:
                    continue
                slots = lesson_slots_by_day[day]
                for start in range(len(slots) - block_size + 1):
                    block = slots[start:start + block_size]
                    if any(s.id in classroom_occupied for s in block):
                        continue
                    if any(alloc.teacher_id in teacher_busy[s.id] for s in block):
                        continue
                    for s in block:
                        entry = models.TimetableEntry.objects.create(
                            classroom=classroom, period_slot=s, term=term, allocation=alloc,
                            is_double=(block_size == 2), auto_generated=True,
                        )
                        created.append(entry.id)
                        classroom_occupied.add(s.id)
                        teacher_busy[s.id].add(alloc.teacher_id)
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