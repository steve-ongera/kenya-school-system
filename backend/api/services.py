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
    Generates a sequential admission number, e.g. 00001, 00081, 11871.

    Deliberately independent of the User.id (uuid) or any login
    credential - admission numbers are printed on report forms and
    must stay short, sequential and human-readable.

    Purely numeric (zero-padded to 5 digits): this value is also used
    directly, unchanged, as the student's login username (see
    StudentEnrollSerializer.create()) - Django's default username
    validator accepts digit-only strings.

    Note: `year` is accepted for backwards compatibility with existing
    callers but no longer affects the generated number - admission
    numbers are now sequential across all years, not scoped per intake.
    """
    last = (
        models.StudentProfile.objects.filter(admission_no__regex=r"^\d+$")
        .order_by("-admission_no")
        .first()
    )
    next_seq = 1
    if last:
        try:
            next_seq = int(last.admission_no) + 1
        except ValueError:
            pass
    return f"{next_seq:05d}"

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
def attach_guardian(student: models.StudentProfile, full_name: str, phone_number: str, relationship: str):
    """
    Links a parent/guardian to a newly admitted student.

    Reuses an existing ParentGuardianProfile if a PARENT user with this
    exact phone number already exists (e.g. admitting a second child of
    the same parent) instead of creating a duplicate account/login for
    the same person. Only creates a new User+ParentGuardianProfile when
    no match is found.
    """
    existing_user = models.User.objects.filter(
        role=models.User.Role.PARENT, phone_number=phone_number
    ).first()

    if existing_user:
        guardian_profile, _ = models.ParentGuardianProfile.objects.get_or_create(user=existing_user)
    else:
        name_parts = full_name.split(" ", 1) if full_name else ["Guardian"]
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        # phone number doubles as the login username for parents; guard
        # against a collision the same way admission numbers never do
        # (phone numbers can occasionally repeat across records/typos).
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
            role=models.User.Role.PARENT,
        )
        guardian_user.set_password("password123")
        guardian_user.save()
        guardian_profile = models.ParentGuardianProfile.objects.create(user=guardian_user)

    models.ParentStudentLink.objects.get_or_create(
        parent=guardian_profile, student=student,
        defaults={"relationship": relationship},
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