"""
Seed EVERYTHING for Junda High School Shanzu's live setup: base config (school,
admin, subjects, license, packages, expense categories, grading scale,
2 exam types, streams) plus the real 2024-2026 academic calendar, real
fee structures per grade/term, and the current Form 3 / Form 4 students
(admitted at the correct historical date, promoted year by year to
their current class, with their 2026 Term 3 balance).

8-4-4 ONLY - no CBC has ever been enrolled at this school, so no CBC
grade levels, pathways, or CBC-only tables are touched here.

Usage:
    python manage.py seed_data

Idempotent - safe to re-run after you add more students or fee rows;
existing rows are matched by natural key and updated, never duplicated.

------------------------------------------------------------------------
WHAT YOU NEED TO EDIT BELOW (search for "EDIT THIS"):
  1. SCHOOL            - real KNEC code / county / address
  2. ADMINS            - your real admin account(s)
  3. FEE_STRUCTURES    - real fee breakdown per (year, term, grade),
                         starting 2024 Term 1
  4. STUDENTS          - real students from your PDF (name, current
                         class, stream, current 2026 Term 3 balance)
------------------------------------------------------------------------

HOW THE 2024-2026 GRADE MAP WORKS (so fee structures line up correctly):
  This school currently runs only Form 3 and Form 4 (Blue & Red).
  Working backwards from that:
    - Today's Form 3 students were Form 1 in 2024, Form 2 in 2025.
    - Today's Form 4 students were Form 2 in 2024, Form 3 in 2025.
  So the grades that ACTUALLY had a running class each year are:
    2024: Form 1, Form 2
    2025: Form 2, Form 3
    2026: Form 3, Form 4
  This set is computed automatically from COHORT_TIMELINE below (not
  hardcoded), and every classroom/fee-structure entry is validated
  against it - e.g. "Form 4 in 2024" is impossible at this school and
  will be skipped with a warning rather than silently creating a
  classroom/fee structure that never existed.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from api.models import (
    AcademicYear,
    ClassRoom,
    CurriculumType,
    Enrollment,
    ExamType,
    ExpenseCategory,
    FeeStructure,
    FeeStructureItem,
    GradeLevel,
    GradeSubject,
    GradingScale,
    Invoice,
    License,
    LicenseAuditLog,
    PLAN_DEFAULTS,
    PlanTier,
    School,
    Stream,
    StudentProfile,
    Subject,
    SubjectPaper,
    SubjectSelectionRule,
    SubscriptionPackage,
    Term,
    User,
)

DEFAULT_PASSWORD = "password123"

# ---------------------------------------------------------------------------
# 1. EDIT THIS - school identity
# ---------------------------------------------------------------------------
SCHOOL = {
    "name": "Junda High School Shanzu",
    "school_type": School.SchoolType.MIXED,
    "knec_code": "",   # TODO: real KNEC centre code
    "county": "Mombasa",      # TODO: real county
    "address": "",     # TODO: real postal address
}

# ---------------------------------------------------------------------------
# 2. EDIT THIS - admin account(s). username, first, last, is_super_admin
# ---------------------------------------------------------------------------
ADMINS = [
    ("admin1", "Admin", "One", True),
]

# ---------------------------------------------------------------------------
# Fixed structure - shouldn't need editing.
# ---------------------------------------------------------------------------
STREAMS = ["Blue", "Red"]

FORMS = [
    {"name": "Form 1", "order": 101},
    {"name": "Form 2", "order": 102},
    {"name": "Form 3", "order": 103},
    {"name": "Form 4", "order": 104},
]

# (name, abbreviation, group, compulsory?, [(paper name, max marks), ...])
SUBJECTS = [
    ("Mathematics", "MAT", 1, True, [("Paper 1", 100), ("Paper 2", 100)]),
    ("English", "ENG", 1, True, [("Paper 1", 60), ("Paper 2", 80), ("Paper 3", 60)]),
    ("Kiswahili", "KIS", 1, True, [("Paper 1", 40), ("Paper 2", 80), ("Paper 3", 80)]),
    ("Chemistry", "CHE", 2, False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Biology", "BIO", 2, False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Physics", "PHY", 2, False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Geography", "GEO", 3, False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("History & Government", "HIS", 3, False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("CRE", "CRE", 3, False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("IRE", "IRE", 3, False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("Computer Studies", "COM", 4, False, [("Paper 1 (Theory)", 100), ("Paper 2 (Practical)", 100)]),
    ("Business Studies", "BST", 5, False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("French", "FRE", 5, False, [("Paper 1", 100), ("Paper 2", 100), ("Paper 3", 100)]),
    ("Home Science", "HSC", 4, False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Agriculture", "AGR", 4, False, [("Paper 1", 100), ("Paper 2", 100)]),
]

SELECTION_RULE = {
    "min_total_subjects": 7,
    "max_total_subjects": 8,
    "group_1_required": 3,
    "group_2_min": 2,
    "group_3_min": 1,
}

# Only 2 exam types, as requested.
# name, weight, order, counts_towards_midterm_rank, counts_towards_endterm_rank
EXAM_TYPES = [
    ("Midterm Exam", Decimal("0.30"), 1, True, True),
    ("End-term Exam", Decimal("0.70"), 2, False, True),
]

# KCSE-style grading (percentage bands -> letter, points)
GRADING = [
    ("A", "80", "100", "12", "Excellent performance. Demonstrates outstanding understanding and mastery."),
    ("A-", "75", "79.99", "11", "Very good performance. Demonstrates strong understanding and consistent application."),
    ("B+", "70", "74.99", "10", "Very good performance. Shows strong understanding and good application of concepts."),
    ("B", "65", "69.99", "9", "Good performance. Demonstrates sound understanding and satisfactory application."),
    ("B-", "60", "64.99", "8", "Good performance. Shows good understanding but needs greater consistency."),
    ("C+", "55", "59.99", "7", "Satisfactory performance. Shows reasonable understanding with room for improvement."),
    ("C", "50", "54.99", "6", "Fair performance. Demonstrates basic understanding but requires more practice."),
    ("C-", "45", "49.99", "5", "Below average performance. Requires more effort and regular revision."),
    ("D+", "40", "44.99", "4", "Weak performance. Requires greater effort and additional support."),
    ("D", "35", "39.99", "3", "Weak performance. Shows limited understanding and needs focused improvement."),
    ("D-", "30", "34.99", "2", "Poor performance. Requires more effort, guidance, and regular practice."),
    ("E", "0", "29.99", "1", "Very poor performance. Requires intensive support and focused improvement."),
]

PACKAGES = {
    PlanTier.TRIAL: (Decimal("0"), 1, ["Full feature access during the trial", "Email support"]),
    PlanTier.GO: (Decimal("2000"), 2, [
        "Student, teacher & class management", "Exams, results & report forms",
        "Fees & invoicing", "Email support",
    ]),
    PlanTier.STANDARD: (Decimal("6000"), 3, [
        "Everything in Go", "SMS & email notifications",
        "Timetable generator", "M-Pesa STK push fee collection",
    ]),
    PlanTier.PREMIUM: (Decimal("15000"), 4, [
        "Everything in Standard", "Expense tracking & finance reports",
        "Student clearance workflow", "Priority support",
    ]),
    PlanTier.PRO: (Decimal("50000"), 5, [
        "Everything in Premium", "Unlimited students, classes & teachers",
        "Dedicated account manager", "24/7 priority support",
    ]),
}

EXPENSE_CATEGORIES = [
    ("Stationery & Office Supplies", "STATIONERY"),
    ("Electricity", "ELECTRICITY"),
    ("Water", "WATER"),
    ("Internet & Airtime", "INTERNET"),
    ("Repairs & Maintenance", "REPAIRS"),
    ("Fuel & Transport", "TRANSPORT"),
    ("Food & Catering", "FOOD"),
    ("Cleaning & Sanitation", "CLEANING"),
    ("Laboratory Supplies", "LAB"),
    ("Sports & Games Equipment", "SPORTS"),
    ("Medical & First Aid", "MEDICAL"),
    ("Security", "SECURITY"),
    ("Printing & Exams", "PRINTING"),
    ("Miscellaneous", "MISC"),
]

# (year, term_number, start_date, end_date, is_current)
CALENDAR = [
    (2024, 1, date(2024, 1, 8), date(2024, 4, 5), False),
    (2024, 2, date(2024, 4, 29), date(2024, 8, 2), False),
    (2024, 3, date(2024, 8, 26), date(2024, 11, 15), False),
    (2025, 1, date(2025, 1, 6), date(2025, 4, 4), False),
    (2025, 2, date(2025, 4, 28), date(2025, 8, 1), False),
    (2025, 3, date(2025, 8, 25), date(2025, 11, 14), False),
    (2026, 1, date(2026, 1, 5), date(2026, 4, 3), False),
    (2026, 2, date(2026, 4, 27), date(2026, 7, 31), False),
    (2026, 3, date(2026, 8, 24), date(2026, 11, 27), True),
]

# Which grade each cohort was in, each year - this is what CLASSROOM_YEARS
# and the fee-structure validity check are both derived from. Only edit
# this if the school's cohort structure is actually different from what
# you described (Form 3/Form 4 now, both started 2024).
COHORT_TIMELINE = {
    "Form 3": {
        "admit_date": date(2024, 1, 15),
        "years": [(2024, "Form 1"), (2025, "Form 2"), (2026, "Form 3")],
        "admission_prefix": "24",
    },
    "Form 4": {
        "admit_date": date(2023, 1, 16),
        "years": [(2024, "Form 2"), (2025, "Form 3"), (2026, "Form 4")],
        "admission_prefix": "23",
    },
}

# Derived, not hand-maintained: every (year, grade) pair that actually had
# a running class, computed from COHORT_TIMELINE above.
CLASSROOM_YEARS = sorted({
    (year, grade) for cohort in COHORT_TIMELINE.values() for year, grade in cohort["years"]
})

# ---------------------------------------------------------------------------
# 3. EDIT THIS - real fee structure, per (academic_year, term_number,
# grade_level), starting 2024 Term 1. One tuple per term/grade; the list
# of (item_name, amount) becomes that FeeStructure's line items and its
# total_amount is the sum. Only fill in combos that actually existed -
# see CLASSROOM_YEARS in the docstring above (e.g. never "Form 4, 2024").
# ---------------------------------------------------------------------------
FEE_STRUCTURES = [
    # (2024, 1, "Form 1", [
    #     ("Tuition", Decimal("15000")),
    #     ("Boarding & Meals", Decimal("18000")),
    #     ("Activity Fee", Decimal("1500")),
    # ]),
    # (2024, 1, "Form 2", [
    #     ("Tuition", Decimal("15000")),
    #     ("Boarding & Meals", Decimal("18000")),
    #     ("Activity Fee", Decimal("1500")),
    # ]),
    # ... continue for every term through (2026, 3, "Form 3") and (2026, 3, "Form 4")
]

# ---------------------------------------------------------------------------
# 4. EDIT THIS - students from your PDF. gender required ("M"/"F"),
# current_grade must be "Form 3" or "Form 4", stream must be "Blue" or
# "Red". balance = what they owe right now for 2026 Term 3.
# ---------------------------------------------------------------------------
STUDENTS = [
    # {"first_name": "Brian", "last_name": "Mwangi", "gender": "M",
    #  "current_grade": "Form 3", "stream": "Blue", "balance": "12000"},
    # {"first_name": "Faith", "last_name": "Achieng", "gender": "F",
    #  "current_grade": "Form 4", "stream": "Red", "balance": "0"},
]


class Command(BaseCommand):
    help = "Seed Junda High School Shanzu's full base setup + 2024-2026 calendar/fees + current students."

    @transaction.atomic
    def handle(self, *args, **options):
        self.pw_hash = make_password(DEFAULT_PASSWORD)
        self.counts = {}

        self.stdout.write(self.style.MIGRATE_HEADING("Base setup"))
        school = self._seed_school()
        admins = self._seed_admins()
        self.streams = self._seed_streams()
        self.grades = self._seed_grade_levels()
        self._seed_subjects()
        self._seed_exam_types()
        self._seed_grading()
        self._seed_packages()
        self._seed_license(school, admins[0])
        self._seed_expense_categories()

        self.stdout.write(self.style.MIGRATE_HEADING("2024-2026 calendar"))
        self.terms = self._seed_calendar()

        self.stdout.write(self.style.MIGRATE_HEADING("Classrooms (derived from cohort timeline)"))
        self.classrooms = self._seed_classrooms()

        self.stdout.write(self.style.MIGRATE_HEADING("Fee structures"))
        self.fee_structures = self._seed_fee_structures()

        if STUDENTS:
            self.stdout.write(self.style.MIGRATE_HEADING(f"Admitting/promoting {len(STUDENTS)} student(s)"))
            seq_by_prefix = {}
            for row in STUDENTS:
                self._process_student(row, seq_by_prefix)
        else:
            self.stdout.write(self.style.WARNING("STUDENTS is empty - skipping student admission this run."))

        self._print_summary()

    # ------------------------------------------------------------------
    def _bump(self, key, created):
        if created:
            self.counts[key] = self.counts.get(key, 0) + 1

    # ------------------------------------------------------------------
    # school / admins
    # ------------------------------------------------------------------
    def _seed_school(self):
        school, created = School.objects.get_or_create(
            name=SCHOOL["name"], defaults={k: v for k, v in SCHOOL.items() if k != "name"},
        )
        self._bump("school", created)
        return school

    def _seed_admins(self):
        admins = []
        for username, first, last, is_super in ADMINS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults=dict(
                    role=User.Role.ADMIN, first_name=first, last_name=last,
                    password=self.pw_hash, is_super_admin=is_super,
                ),
            )
            self._bump("users:ADMIN", created)
            admins.append(user)
        return admins

    # ------------------------------------------------------------------
    # streams / grades
    # ------------------------------------------------------------------
    def _seed_streams(self):
        streams = {}
        for name in STREAMS:
            stream, created = Stream.objects.get_or_create(name=name)
            streams[name] = stream
            self._bump("streams", created)
        return streams

    def _seed_grade_levels(self):
        grades = {}
        for form in sorted(FORMS, key=lambda f: -f["order"]):
            next_grade = None
            for other in FORMS:
                if other["order"] == form["order"] + 1:
                    next_grade = grades[other["name"]]
            grade, created = GradeLevel.objects.update_or_create(
                name=form["name"], curriculum_type=CurriculumType.LEGACY_844,
                defaults={
                    "education_level": GradeLevel.EducationLevel.LEGACY_SECONDARY,
                    "level_order": form["order"],
                    "next_grade": next_grade,
                },
            )
            grades[form["name"]] = grade
            self._bump("grade levels", created)
        return grades

    # ------------------------------------------------------------------
    # subjects
    # ------------------------------------------------------------------
    def _seed_subjects(self):
        subjects = {}
        for name, code, compulsory, papers in SUBJECTS:
            subject, created = Subject.objects.update_or_create(
                code=code, curriculum_type=CurriculumType.LEGACY_844,
                defaults={"name": name, "has_papers": bool(papers)},
            )
            subjects[code] = subject
            self._bump("subjects", created)

            for number, (paper_name, max_marks) in enumerate(papers, start=1):
                _, p_created = SubjectPaper.objects.update_or_create(
                    subject=subject, paper_number=number,
                    defaults={"name": paper_name, "max_marks": max_marks},
                )
                self._bump("subject papers", p_created)

            for grade in self.grades.values():
                _, g_created = GradeSubject.objects.update_or_create(
                    grade_level=grade, subject=subject, defaults={"is_compulsory": compulsory},
                )
                self._bump("grade subjects", g_created)

        for grade in self.grades.values():
            _, created = SubjectSelectionRule.objects.update_or_create(
                grade_level=grade, defaults={"requires_pathway": False, **SELECTION_RULE},
            )
            self._bump("selection rules", created)
        return subjects

    # ------------------------------------------------------------------
    # exam types / grading
    # ------------------------------------------------------------------
    def _seed_exam_types(self):
        for name, weight, order, mid, end in EXAM_TYPES:
            _, created = ExamType.objects.update_or_create(
                name=name,
                defaults={
                    "weight": weight, "order": order,
                    "counts_towards_midterm_rank": mid, "counts_towards_endterm_rank": end,
                },
            )
            self._bump("exam types", created)

    def _seed_grading(self):
        for letter, lo, hi, points, remark in GRADING:
            _, created = GradingScale.objects.update_or_create(
                curriculum_type=CurriculumType.LEGACY_844, subject=None, grade_letter=letter,
                defaults={
                    "min_percentage": Decimal(lo), "max_percentage": Decimal(hi),
                    "points": Decimal(points), "remark": remark,
                },
            )
            self._bump("grading scales", created)

    # ------------------------------------------------------------------
    # calendar
    # ------------------------------------------------------------------
    def _seed_calendar(self):
        terms = {}
        for year_no, term_no, start, end, is_current in CALENDAR:
            year, y_created = AcademicYear.objects.update_or_create(
                year=year_no,
                defaults={"start_date": date(year_no, 1, 1), "end_date": date(year_no, 12, 31), "is_current": False},
            )
            self._bump("academic years", y_created)
            term, t_created = Term.objects.update_or_create(
                academic_year=year, term_number=term_no,
                defaults={"start_date": start, "end_date": end, "is_current": is_current},
            )
            terms[(year_no, term_no)] = term
            self._bump("terms", t_created)
            if is_current:
                AcademicYear.objects.filter(pk=year.pk).update(is_current=True)
                AcademicYear.objects.exclude(pk=year.pk).update(is_current=False)

        # widen each year's start/end to cover its own terms
        for year_no in {c[0] for c in CALENDAR}:
            year_terms = [t for (y, _), t in terms.items() if y == year_no]
            AcademicYear.objects.filter(year=year_no).update(
                start_date=min(t.start_date for t in year_terms),
                end_date=max(t.end_date for t in year_terms),
            )
        return terms

    # ------------------------------------------------------------------
    # classrooms - only for (year, grade) combos that actually existed
    # ------------------------------------------------------------------
    def _seed_classrooms(self):
        classrooms = {}
        for year_no, grade_name in CLASSROOM_YEARS:
            year = AcademicYear.objects.get(year=year_no)
            grade = self.grades[grade_name]
            for stream_name in STREAMS:
                classroom, created = ClassRoom.objects.get_or_create(
                    grade_level=grade, stream=self.streams[stream_name], academic_year=year,
                )
                classrooms[(year_no, grade_name, stream_name)] = classroom
                self._bump("classrooms", created)
        return classrooms

    # ------------------------------------------------------------------
    # fee structures - validated against CLASSROOM_YEARS
    # ------------------------------------------------------------------
    def _seed_fee_structures(self):
        structures = {}
        valid = set(CLASSROOM_YEARS)
        for year_no, term_no, grade_name, items in FEE_STRUCTURES:
            if (year_no, grade_name) not in valid:
                self.stdout.write(self.style.WARNING(
                    f"  {grade_name} did not exist in {year_no} at this school - "
                    f"skipping fee structure for {year_no} Term {term_no}"
                ))
                continue
            term = self.terms.get((year_no, term_no))
            if not term:
                self.stdout.write(self.style.WARNING(
                    f"  no term {year_no} T{term_no} in CALENDAR - skipping fee structure"
                ))
                continue

            total = sum((Decimal(str(amount)) for _, amount in items), Decimal("0"))
            structure, created = FeeStructure.objects.update_or_create(
                grade_level=self.grades[grade_name], term=term, defaults={"total_amount": total},
            )
            structure.items.all().delete()
            FeeStructureItem.objects.bulk_create(
                FeeStructureItem(fee_structure=structure, name=name, amount=Decimal(str(amount)))
                for name, amount in items
            )
            structures[(year_no, term_no, grade_name)] = structure
            self._bump("fee structures", created)
        return structures

    # ------------------------------------------------------------------
    # packages / license / expense categories
    # ------------------------------------------------------------------
    def _seed_packages(self):
        for tier, (price, order, features) in PACKAGES.items():
            limits = PLAN_DEFAULTS[tier]
            _, created = SubscriptionPackage.objects.update_or_create(
                tier=tier,
                defaults={
                    "monthly_price": price,
                    "max_students": limits["max_students"],
                    "max_classrooms_per_year": limits["max_classrooms_per_year"],
                    "max_teachers": limits["max_teachers"],
                    "features": features,
                    "is_active": True,
                    "display_order": order,
                },
            )
            self._bump("subscription packages", created)

    def _seed_license(self, school, admin):
        if License.objects.filter(school=school).exists():
            return
        from datetime import timedelta
        lic = License(school=school, tier=PlanTier.GO, valid_until=timezone.now() + timedelta(days=365))
        lic.apply_tier_defaults()
        lic.save()
        LicenseAuditLog.objects.create(
            school=school, action=LicenseAuditLog.Action.ISSUED,
            detail="Seeded initial GO license (12 months).", performed_by=admin,
        )
        self._bump("licenses", True)

    def _seed_expense_categories(self):
        for name, code in EXPENSE_CATEGORIES:
            _, created = ExpenseCategory.objects.update_or_create(
                code=code, defaults={"name": name, "is_active": True},
            )
            self._bump("expense categories", created)

    # ------------------------------------------------------------------
    # students - admit + promote, then set 2026 Term 3 balance
    # ------------------------------------------------------------------
    def _next_admission_no(self, prefix, seq_by_prefix):
        seq_by_prefix[prefix] = seq_by_prefix.get(prefix, 0) + 1
        return f"{prefix}{seq_by_prefix[prefix]:03d}"

    def _process_student(self, row, seq_by_prefix):
        current_grade = row["current_grade"].strip()
        stream_name = row["stream"].strip()
        if current_grade not in COHORT_TIMELINE:
            raise CommandError(f"Unknown current_grade {current_grade!r} - must be 'Form 3' or 'Form 4'.")
        if stream_name not in STREAMS:
            raise CommandError(f"Unknown stream {stream_name!r} - must be 'Blue' or 'Red'.")

        cohort = COHORT_TIMELINE[current_grade]
        admission_no = (row.get("admission_no") or "").strip()
        if not admission_no:
            admission_no = self._next_admission_no(cohort["admission_prefix"], seq_by_prefix)

        user, u_created = User.objects.get_or_create(
            username=admission_no,
            defaults=dict(
                role=User.Role.STUDENT, first_name=row["first_name"].strip(),
                last_name=row["last_name"].strip(), password=self.pw_hash,
            ),
        )
        self._bump("users:STUDENT", u_created)

        profile, p_created = StudentProfile.objects.update_or_create(
            user=user,
            defaults={
                "admission_no": admission_no,
                "gender": row["gender"].strip(),
                "curriculum_type": CurriculumType.LEGACY_844,
                "date_admitted": row.get("date_admitted") or cohort["admit_date"],
                "is_active": True,
            },
        )
        self._bump("student profiles", p_created)

        last_index = len(cohort["years"]) - 1
        current_enrollment = None
        for i, (year_no, grade_name) in enumerate(cohort["years"]):
            classroom = self.classrooms[(year_no, grade_name, stream_name)]
            status = Enrollment.Status.ACTIVE if i == last_index else Enrollment.Status.PROMOTED
            enrollment, e_created = Enrollment.objects.update_or_create(
                student=profile, academic_year=classroom.academic_year,
                defaults={"classroom": classroom, "status": status},
            )
            self._bump("enrollments", e_created)
            if i == last_index:
                current_enrollment = enrollment

        structure = self.fee_structures.get((2026, 3, current_grade))
        if not structure:
            raise CommandError(
                f"No fee structure defined for (2026, Term 3, {current_grade}) - "
                f"add a FEE_STRUCTURES row for it before admitting students in that grade."
            )

        balance = Decimal(str(row["balance"]))
        total_due = structure.total_amount
        if balance > total_due:
            amount_due, amount_paid = balance, Decimal("0")
        else:
            amount_due, amount_paid = total_due, total_due - balance

        _, i_created = Invoice.objects.update_or_create(
            enrollment=current_enrollment, fee_structure=structure,
            defaults={"brought_forward": Decimal("0"), "amount_due": amount_due, "amount_paid": amount_paid},
        )
        self._bump("invoices", i_created)

    # ------------------------------------------------------------------
    def _print_summary(self):
        self.stdout.write(self.style.SUCCESS("\nDone. Newly created rows:"))
        if not self.counts:
            self.stdout.write("  (nothing - everything already existed)")
        for key, n in sorted(self.counts.items()):
            self.stdout.write(f"  {key:<24} {n}")
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nLogin (password for every seeded account): {DEFAULT_PASSWORD}"
        ))