"""
Seed initial data for the School Management System.

Sets up a school currently running ONLY Form 3 and Form 4 (8-4-4), each with
two streams (Blue, Red), academic year 2026 / Term 1 as current.

Usage:
    python manage.py seed_data
    python manage.py seed_data --seed 7      # different (but repeatable) random students

The command is idempotent: running it twice will not create duplicates.
Existing rows are looked up by their natural keys (username, code, name...).
Every user is created with the password "password123".
"""
import random
import string
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
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
    License,
    LicenseAuditLog,
    ParentGuardianProfile,
    ParentStudentLink,
    PLAN_DEFAULTS,
    PlanTier,
    School,
    Stream,
    StudentProfile,
    StudentSubjectSelection,
    Subject,
    SubjectPaper,
    SubjectSelectionRule,
    SubscriptionPackage,
    Term,
    User,
)

# ---------------------------------------------------------------------------
# CONFIG - edit these and re-run
# ---------------------------------------------------------------------------
DEFAULT_PASSWORD = "password123"

SCHOOL = {
    "name": "Example High School",  # TODO: replace with the real school name
    "school_type": School.SchoolType.MIXED,
    "knec_code": "00000000",         # TODO: real KNEC centre code
    "county": "Nairobi",             # TODO: real county
    "address": "P.O. Box 0000-00100, Nairobi",
}

ACADEMIC_YEAR = 2026
YEAR_START = date(2026, 1, 5)
YEAR_END = date(2026, 11, 27)
TERM1_START = date(2026, 1, 5)
TERM1_END = date(2026, 4, 3)

STREAMS = ["Blue", "Red"]

# Only the grades this school currently runs.
# admit_year = the year that cohort joined Form 1; dob_year = typical birth year.
FORMS = [
    {"name": "Form 3", "order": 103, "admit_year": 2024, "dob_year": 2009},
    {"name": "Form 4", "order": 104, "admit_year": 2023, "dob_year": 2008},
]

# (name, KCSE code, compulsory?, [(paper name, max marks), ...])
# Paper structure follows the usual KCSE layout - adjust here if your school differs.
SUBJECTS = [
    # --- compulsory ---
    ("Mathematics", "121", True, [("Paper 1", 100), ("Paper 2", 100)]),
    ("English", "101", True, [("Paper 1", 60), ("Paper 2", 80), ("Paper 3", 60)]),
    ("Kiswahili", "102", True, [("Paper 1", 40), ("Paper 2", 80), ("Paper 3", 80)]),
    ("Chemistry", "233", True, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    # --- electives ---
    ("Biology", "231", False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Physics", "232", False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Geography", "312", False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("History & Government", "311", False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("CRE", "313", False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("IRE", "314", False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("Computer Studies", "451", False, [("Paper 1 (Theory)", 100), ("Paper 2 (Practical)", 100)]),
    ("Business Studies", "565", False, [("Paper 1", 100), ("Paper 2", 100)]),
    ("French", "501", False, [("Paper 1", 100), ("Paper 2", 100), ("Paper 3", 100)]),
    ("Home Science", "441", False, [("Paper 1", 80), ("Paper 2", 80), ("Paper 3 (Practical)", 40)]),
    ("Agriculture", "443", False, [("Paper 1", 100), ("Paper 2", 100)]),
]

# Subject-selection rule applied to Form 3 and Form 4 (on top of the 4 compulsory subjects)
SELECTION_RULE = {
    "min_optional_subjects": 3,
    "max_optional_subjects": 5,
    "min_total_subjects": 7,
    "max_total_subjects": 9,
}

# Used when auto-picking electives for the seeded students
SCIENCE_ELECTIVES = ["231", "232"]                    # Biology, Physics
HUMANITY_ELECTIVES = ["312", "311", "313", "314"]     # Geo, History, CRE, IRE
CONFLICTING = {"313": "314", "314": "313"}            # nobody takes CRE *and* IRE

EXAM_TYPES = [
    # name, weight, order, counts_towards_midterm_rank, counts_towards_endterm_rank
    ("Midterm Exam", Decimal("0.30"), 1, True, True),
    ("End-term Exam", Decimal("0.70"), 2, False, True),
]

# KCSE-style grading (percentage bands -> letter, points)
GRADING = [
    # letter, min, max, points, remark
    ("A", "80", "100", "12", "Excellent"),
    ("A-", "75", "79.99", "11", "Very Good"),
    ("B+", "70", "74.99", "10", "Good"),
    ("B", "65", "69.99", "9", "Good"),
    ("B-", "60", "64.99", "8", "Above Average"),
    ("C+", "55", "59.99", "7", "Average"),
    ("C", "50", "54.99", "6", "Average"),
    ("C-", "45", "49.99", "5", "Below Average"),
    ("D+", "40", "44.99", "4", "Weak"),
    ("D", "35", "39.99", "3", "Weak"),
    ("D-", "30", "34.99", "2", "Poor"),
    ("E", "0", "29.99", "1", "Very Poor"),
]

# KES, Term 1 2026. Adjust to the school's real fee circular.
FEES = {
    "Form 3": [
        ("Tuition", 18000),
        ("Boarding & Meals", 22000),
        ("Activity Fee", 2000),
        ("Laboratory & Practicals", 3000),
        ("Medical & Insurance", 1500),
        ("Development & Maintenance", 3500),
    ],
    "Form 4": [
        ("Tuition", 18000),
        ("Boarding & Meals", 22000),
        ("Activity Fee", 2000),
        ("Laboratory & Practicals", 3000),
        ("Medical & Insurance", 1500),
        ("Development & Maintenance", 3500),
        ("Mock & KCSE Exam Fee", 4000),
    ],
}

# tier -> (monthly price KES, display order, feature bullets)
PACKAGES = {
    PlanTier.TRIAL: (Decimal("0"), 1, [
        "Full feature access during the trial",
        "Email support",
    ]),
    PlanTier.GO: (Decimal("2000"), 2, [
        "Student, teacher & class management",
        "Exams, results & report forms",
        "Fees & invoicing",
        "Email support",
    ]),
    PlanTier.STANDARD: (Decimal("6000"), 3, [
        "Everything in Go",
        "SMS & email notifications",
        "Timetable generator",
        "M-Pesa STK push fee collection",
    ]),
    PlanTier.PREMIUM: (Decimal("15000"), 4, [
        "Everything in Standard",
        "Expense tracking & finance reports",
        "Student clearance workflow",
        "Priority support",
    ]),
    PlanTier.PRO: (Decimal("50000"), 5, [
        "Everything in Premium",
        "Unlimited students, classes & teachers",
        "Dedicated account manager",
        "24/7 priority support",
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

ADMINS = [
    # username, first, last, is_super_admin
    ("admin1", "Joseph", "Kariuki", True),
    ("admin2", "Agnes", "Wambui", False),
]

TEACHERS = [
    ("James", "Mwangi"), ("Grace", "Achieng"), ("Peter", "Otieno"),
    ("Lucy", "Kamau"), ("Hassan", "Juma"), ("Esther", "Chebet"),
    ("Daniel", "Wafula"), ("Faith", "Mutua"), ("Samuel", "Kiptoo"),
    ("Rose", "Njeri"),
]

MALE_NAMES = [
    "Brian", "Kevin", "Dennis", "Victor", "Ian", "Collins", "Felix", "Eric", "Allan",
    "Samuel", "Peter", "Joseph", "Moses", "Kelvin", "Nelson", "Hassan", "Baraka",
    "Emmanuel", "Justus", "Vincent", "Wycliffe", "Elvis", "Duncan", "Newton", "Ibrahim",
]
FEMALE_NAMES = [
    "Faith", "Mercy", "Grace", "Purity", "Winnie", "Joy", "Esther", "Lucy", "Naomi",
    "Sharon", "Cynthia", "Ann", "Mary", "Halima", "Fatuma", "Zainab", "Rehema", "Amina",
    "Brenda", "Lilian", "Diana", "Beatrice", "Caroline", "Doreen", "Gladys", "Irene",
]
SURNAMES = [
    "Mwangi", "Otieno", "Kamau", "Wanjiku", "Omondi", "Njoroge", "Mutua", "Kiptoo",
    "Chebet", "Juma", "Hassan", "Wafula", "Nyongesa", "Achieng", "Kariuki", "Muriuki",
    "Odhiambo", "Kimani", "Wekesa", "Mwende", "Kilonzo", "Mbugua", "Ndungu", "Cheruiyot",
    "Barasa", "Onyango", "Salim", "Karisa", "Mwadzombo", "Ochieng", "Kibet", "Njeri",
    "Waweru", "Simiyu", "Mumo", "Langat",
]


class Command(BaseCommand):
    help = "Seed initial data: school, Form 3/4 (8-4-4), subjects, users, students, fees, licences."

    def add_arguments(self, parser):
        parser.add_argument(
            "--seed", type=int, default=2026,
            help="Random seed for generated names/subject choices (same seed = same data).",
        )

    # ------------------------------------------------------------------
    @transaction.atomic
    def handle(self, *args, **options):
        self.rng = random.Random(options["seed"])
        # Hash once and reuse - hashing 150 passwords individually would take ages.
        self.pw_hash = make_password(DEFAULT_PASSWORD)
        self._used_national_ids = set()
        self._used_phones = set()
        self.counts = {}

        self.stdout.write(self.style.MIGRATE_HEADING("Seeding school data..."))

        school = self._seed_school()
        admins = self._seed_admins()
        teachers = self._seed_teachers()
        year, term = self._seed_calendar()
        streams = self._seed_streams()
        grades = self._seed_grade_levels()
        classrooms = self._seed_classrooms(grades, streams, year, teachers)
        subjects = self._seed_subjects(grades)
        self._seed_exam_types()
        self._seed_grading()
        self._seed_fees(grades, term)
        self._seed_students(year, grades, streams, classrooms, subjects)
        self._seed_packages()
        self._seed_license(school, admins[0])
        self._seed_expense_categories()

        self._print_summary()

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    def _bump(self, key, created):
        if created:
            self.counts[key] = self.counts.get(key, 0) + 1

    def _national_id(self):
        while True:
            nid = str(self.rng.randint(20000000, 39999999))
            if nid not in self._used_national_ids:
                self._used_national_ids.add(nid)
                return nid

    def _phone(self):
        while True:
            phone = "+2547" + "".join(self.rng.choices(string.digits, k=8))
            if phone not in self._used_phones:
                self._used_phones.add(phone)
                return phone

    def _make_user(self, username, role, first, last, **extra):
        user, created = User.objects.get_or_create(
            username=username,
            defaults=dict(
                role=role, first_name=first, last_name=last,
                password=self.pw_hash, **extra,
            ),
        )
        self._bump(f"users:{role}", created)
        return user, created

    # ------------------------------------------------------------------
    # 1. school
    # ------------------------------------------------------------------
    def _seed_school(self):
        school, created = School.objects.get_or_create(
            name=SCHOOL["name"],
            defaults={k: v for k, v in SCHOOL.items() if k != "name"},
        )
        self._bump("school", created)
        return school

    # ------------------------------------------------------------------
    # 2. staff users
    # ------------------------------------------------------------------
    def _seed_admins(self):
        admins = []
        for username, first, last, is_super in ADMINS:
            user, _ = self._make_user(
                username, User.Role.ADMIN, first, last,
                email=f"{username}@example.com",
                phone_number=self._phone(),
                national_id=self._national_id(),
                is_super_admin=is_super,
            )
            admins.append(user)
        return admins

    def _seed_teachers(self):
        teachers = []
        for i, (first, last) in enumerate(TEACHERS, start=1):
            username = f"teacher{i}"
            user, _ = self._make_user(
                username, User.Role.TEACHER, first, last,
                email=f"{username}@example.com",
                phone_number=self._phone(),
                national_id=self._national_id(),
            )
            teachers.append(user)
        return teachers

    # ------------------------------------------------------------------
    # 3. calendar
    # ------------------------------------------------------------------
    def _seed_calendar(self):
        year, y_created = AcademicYear.objects.update_or_create(
            year=ACADEMIC_YEAR,
            defaults={"start_date": YEAR_START, "end_date": YEAR_END, "is_current": True},
        )
        term, t_created = Term.objects.update_or_create(
            academic_year=year, term_number=1,
            defaults={"start_date": TERM1_START, "end_date": TERM1_END, "is_current": True},
        )
        self._bump("academic year", y_created)
        self._bump("term", t_created)
        return year, term

    # ------------------------------------------------------------------
    # 4. streams, grades, classrooms
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
        # create the higher form first so Form 3 can point at it
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
                    "next_grade": next_grade,   # Form 4 -> None (graduating class)
                },
            )
            grades[form["name"]] = grade
            self._bump("grade levels", created)
        return grades

    def _seed_classrooms(self, grades, streams, year, teachers):
        classrooms = {}
        idx = 0
        for form in FORMS:
            for stream_name in STREAMS:
                classroom, created = ClassRoom.objects.get_or_create(
                    grade_level=grades[form["name"]],
                    stream=streams[stream_name],
                    academic_year=year,
                    defaults={"class_teacher": teachers[idx % len(teachers)]},
                )
                classrooms[(form["name"], stream_name)] = classroom
                self._bump("classrooms", created)
                idx += 1
        return classrooms

    # ------------------------------------------------------------------
    # 5. subjects, papers, grade subjects, selection rule
    # ------------------------------------------------------------------
    def _seed_subjects(self, grades):
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

            for grade in grades.values():
                _, g_created = GradeSubject.objects.update_or_create(
                    grade_level=grade, subject=subject,
                    defaults={"is_compulsory": compulsory},
                )
                self._bump("grade subjects", g_created)

        for grade in grades.values():
            _, created = SubjectSelectionRule.objects.update_or_create(
                grade_level=grade,
                defaults={"requires_pathway": False, **SELECTION_RULE},
            )
            self._bump("selection rules", created)
        return subjects

    # ------------------------------------------------------------------
    # 6. exam types, grading, fees
    # ------------------------------------------------------------------
    def _seed_exam_types(self):
        for name, weight, order, mid, end in EXAM_TYPES:
            _, created = ExamType.objects.update_or_create(
                name=name,
                defaults={
                    "weight": weight, "order": order,
                    "counts_towards_midterm_rank": mid,
                    "counts_towards_endterm_rank": end,
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

    def _seed_fees(self, grades, term):
        for form_name, items in FEES.items():
            total = sum(Decimal(str(amount)) for _, amount in items)
            structure, created = FeeStructure.objects.update_or_create(
                grade_level=grades[form_name], term=term,
                defaults={"total_amount": total},
            )
            structure.items.all().delete()
            FeeStructureItem.objects.bulk_create(
                FeeStructureItem(fee_structure=structure, name=n, amount=Decimal(str(a)))
                for n, a in items
            )
            self._bump("fee structures", created)

    # ------------------------------------------------------------------
    # 7. students + parents + enrollments + subject selections
    # ------------------------------------------------------------------
    def _pick_electives(self):
        """3-4 electives: >=1 of Biology/Physics, >=1 humanity, rest random. Never CRE+IRE."""
        rng = self.rng
        science = rng.choices(SCIENCE_ELECTIVES, weights=[65, 35])[0]
        humanity = rng.choice(HUMANITY_ELECTIVES)
        chosen = [science, humanity]

        all_electives = [c for _, c, compulsory, _ in SUBJECTS if not compulsory]
        pool = [c for c in all_electives if c not in chosen]
        target = rng.randint(3, 4)
        while len(chosen) < target and pool:
            code = rng.choice(pool)
            pool.remove(code)
            if CONFLICTING.get(code) in chosen or CONFLICTING.get(humanity) == code:
                continue
            chosen.append(code)
        return chosen

    def _random_person(self, gender, surname):
        first = self.rng.choice(MALE_NAMES if gender == "M" else FEMALE_NAMES)
        return first, surname

    def _seed_students(self, year, grades, streams, classrooms, subjects):
        rng = self.rng
        compulsory_codes = [c for _, c, compulsory, _ in SUBJECTS if compulsory]

        for form in FORMS:
            yy = form["admit_year"] % 100
            seq = 0
            for stream_name in STREAMS:
                classroom = classrooms[(form["name"], stream_name)]
                for _ in range(rng.randint(19, 24)):
                    seq += 1
                    admission_no = f"{yy}{seq:03d}"
                    gender = rng.choice(["M", "F"])
                    surname = rng.choice(SURNAMES)
                    first, last = self._random_person(gender, surname)
                    dob = date(form["dob_year"], 1, 1) + timedelta(days=rng.randint(0, 729))
                    upi = "".join(rng.choices(string.ascii_uppercase + string.digits, k=8))
                    electives = self._pick_electives()

                    # ---- student ----
                    user, _ = self._make_user(
                        admission_no, User.Role.STUDENT, first, last,
                    )
                    profile, p_created = StudentProfile.objects.get_or_create(
                        user=user,
                        defaults={
                            "admission_no": admission_no,
                            "gender": gender,
                            "date_of_birth": dob,
                            "curriculum_type": CurriculumType.LEGACY_844,
                            "date_admitted": date(form["admit_year"], 1, 15),
                            "upi_number": upi,
                        },
                    )
                    self._bump("student profiles", p_created)

                    # ---- enrollment (+ subject selection when first created) ----
                    enrollment, e_created = Enrollment.objects.get_or_create(
                        student=profile, academic_year=year,
                        defaults={"classroom": classroom, "status": Enrollment.Status.ACTIVE},
                    )
                    self._bump("enrollments", e_created)
                    if e_created:
                        StudentSubjectSelection.objects.bulk_create(
                            [
                                StudentSubjectSelection(enrollment=enrollment, subject=subjects[c])
                                for c in compulsory_codes + electives
                            ],
                            ignore_conflicts=True,
                        )

                    # ---- parents (always a primary guardian, ~40% also a second one) ----
                    primary_rel = rng.choice(["MOTHER", "FATHER"])
                    self._seed_parent(admission_no, "", primary_rel, surname, profile)
                    if rng.random() < 0.4:
                        second_rel = "FATHER" if primary_rel == "MOTHER" else "MOTHER"
                        self._seed_parent(admission_no, "b", second_rel, surname, profile)

    def _seed_parent(self, admission_no, suffix, relationship, surname, student_profile):
        gender = "F" if relationship == "MOTHER" else "M"
        first, last = self._random_person(gender, surname)
        username = f"parent{admission_no}{suffix}"
        user, _ = self._make_user(
            username, User.Role.PARENT, first, last,
            email=f"{username}@example.com",
            phone_number=self._phone(),
            national_id=self._national_id(),
        )
        parent, p_created = ParentGuardianProfile.objects.get_or_create(user=user)
        self._bump("parent profiles", p_created)
        _, l_created = ParentStudentLink.objects.get_or_create(
            parent=parent, student=student_profile,
            defaults={"relationship": relationship},
        )
        self._bump("parent-student links", l_created)

    # ------------------------------------------------------------------
    # 8. licensing
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
        """
        Seeds the school on the GO tier (300 students / 15 classes / 20 teachers) because the
        seeded data (~90 students, 4 classes, 10 teachers) would already exceed the TRIAL limits.
        """
        if License.objects.filter(school=school).exists():
            return
        lic = License(
            school=school, tier=PlanTier.GO,
            valid_until=timezone.now() + timedelta(days=365),
        )
        lic.apply_tier_defaults()
        lic.save()
        LicenseAuditLog.objects.create(
            school=school, action=LicenseAuditLog.Action.ISSUED,
            detail="Seeded initial GO license (12 months).", performed_by=admin,
        )
        self._bump("licenses", True)

    # ------------------------------------------------------------------
    # 9. expense categories
    # ------------------------------------------------------------------
    def _seed_expense_categories(self):
        for name, code in EXPENSE_CATEGORIES:
            _, created = ExpenseCategory.objects.update_or_create(
                code=code, defaults={"name": name, "is_active": True},
            )
            self._bump("expense categories", created)

    # ------------------------------------------------------------------
    def _print_summary(self):
        self.stdout.write(self.style.SUCCESS("\nDone. Newly created rows:"))
        if not self.counts:
            self.stdout.write("  (nothing - everything already existed)")
        for key, n in sorted(self.counts.items()):
            self.stdout.write(f"  {key:<24} {n}")

        first_form3 = StudentProfile.objects.filter(admission_no__startswith="24").order_by("admission_no").first()
        first_form4 = StudentProfile.objects.filter(admission_no__startswith="23").order_by("admission_no").first()
        self.stdout.write(self.style.MIGRATE_HEADING(f"\nLogins (password for ALL users: {DEFAULT_PASSWORD})"))
        self.stdout.write("  Admins   : admin1 (super admin), admin2")
        self.stdout.write("  Teachers : teacher1 ... teacher10")
        if first_form3:
            self.stdout.write(f"  Student  : {first_form3.admission_no} (Form 3 example)")
        if first_form4:
            self.stdout.write(f"  Student  : {first_form4.admission_no} (Form 4 example)")
        if first_form3:
            self.stdout.write(f"  Parent   : parent{first_form3.admission_no}")