"""
Management command: seed_data

Seeds 4 academic years (2023-2026) of realistic, internally-consistent data
for the Kenyan school (CBC + 8-4-4 running side by side, mirroring the real
national transition: Grade 9 in 2023 -> Grade 10 in 2024 -> Grade 11 in 2025
-> Grade 12 in 2026, while the last 8-4-4 cohorts (Form 2/3/4 in 2023) finish
KCSE and phase out by 2026).

Usage:
    python manage.py seed_data                 # seed on top of existing data
    python manage.py seed_data --flush          # wipe previously seeded data first
    python manage.py seed_data --students-per-stream 20   # tune volume

Every login (admin/teacher/finance/student/parent) uses the same password:
    password123
"""
import random
import time
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import (
    AcademicYear, ClassRoom, CurriculumType, Enrollment, Exam, ExamResult,
    ExamType, FeeStructure, FeeStructureItem, GradeLevel, GradeSubject,
    GradingScale, Invoice, MpesaSTKPushRequest, ParentGuardianProfile,
    ParentStudentLink, Payment, PromotionRule, School, StudentProfile,
    StudentSubjectSelection, Stream, Subject, SubjectPaper,
    SubjectSelectionRule, Term, TeacherSubjectAllocation,
    TermPositionRanking, User,
)

# ---------------------------------------------------------------------------
# Kenyan name pools (drawn from common Kikuyu, Luo, Luhya, Kalenjin, Kamba,
# Coastal/Swahili and Somali-Kenyan naming conventions, so the data reads as
# genuinely Kenyan rather than generic).
# ---------------------------------------------------------------------------
MALE_FIRST_NAMES = [
    "Brian", "Kevin", "John", "David", "Peter", "James", "Dennis", "Collins",
    "Victor", "Felix", "Erick", "Alex", "Kennedy", "Elvis", "Duncan", "Mark",
    "Paul", "Samuel", "Joseph", "Stephen", "Michael", "Anthony", "Vincent",
    "Kimani", "Kamau", "Njoroge", "Mwangi", "Otieno", "Odhiambo", "Omondi",
    "Ochieng", "Owino", "Wafula", "Wanyonyi", "Simiyu", "Barasa", "Kiptoo",
    "Kipchoge", "Kiprotich", "Cheruiyot", "Mutua", "Musyoka", "Kioko",
    "Mwendwa", "Hassan", "Abdi", "Omar", "Yusuf", "Ibrahim", "Ali",
    "Baraka", "Juma", "Rashid", "Fahim", "Kelvin", "Ian", "Derrick",
    "Griffins", "Bramwel", "Cyrus", "Edwin", "Bernard", "Geoffrey", "Fredrick",
]
FEMALE_FIRST_NAMES = [
    "Mary", "Grace", "Faith", "Joy", "Ann", "Jane", "Lucy", "Susan", "Esther",
    "Ruth", "Sarah", "Alice", "Beatrice", "Catherine", "Diana", "Eunice",
    "Winnie", "Brenda", "Caroline", "Christine", "Dorothy", "Elizabeth",
    "Wanjiru", "Wambui", "Njeri", "Nyambura", "Achieng", "Awuor", "Adhiambo",
    "Atieno", "Nafula", "Nekesa", "Chepkoech", "Chelangat", "Jepkosgei",
    "Muthoni", "Mumbi", "Nasimiyu", "Cherotich", "Naliaka", "Mwikali",
    "Ndunge", "Nyokabi", "Fatuma", "Amina", "Halima", "Zainab", "Khadija",
    "Asha", "Sharon", "Purity", "Mercy", "Vivian", "Rehema", "Loise",
    "Nancy", "Millicent", "Judy", "Pauline", "Immaculate",
]
SURNAMES = [
    "Kamau", "Mwangi", "Njoroge", "Kariuki", "Wanjiru", "Kimani", "Maina",
    "Njuguna", "Gitau", "Karanja", "Otieno", "Odhiambo", "Omondi", "Ochieng",
    "Owino", "Ouma", "Onyango", "Ogola", "Wafula", "Wanyonyi", "Simiyu",
    "Barasa", "Wekesa", "Nafula", "Kiptoo", "Kipchoge", "Kiprotich",
    "Cheruiyot", "Rotich", "Koech", "Mutua", "Musyoka", "Kioko", "Mwendwa",
    "Nzomo", "Musembi", "Hassan", "Abdi", "Omar", "Yusuf", "Ibrahim",
    "Mohamed", "Juma", "Mbugua", "Macharia", "Muturi", "Kiragu", "Wachira",
    "Onyancha", "Nyakundi", "Mose", "Getachew", "Langat", "Bett", "Chebet",
]
COUNTIES = [
    "Nairobi", "Kiambu", "Nakuru", "Mombasa", "Kisumu", "Uasin Gishu",
    "Machakos", "Kajiado", "Muranga", "Nyeri",
]

FEE_ITEM_NAMES = ["Tuition", "Boarding", "Activity Fee", "Lunch Programme", "Development Levy"]

MPESA_PREFIXES = "QWERTYUIOPASDFGHJKLZXCVBNM"


class Command(BaseCommand):
    help = "Seeds 4 years (2023-2026) of realistic Kenyan school data (CBC + 8-4-4)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush", action="store_true",
            help="Delete previously seeded data (keeps superusers) before seeding.",
        )
        parser.add_argument(
            "--students-per-stream", type=int, default=20,
            help="New admissions per stream each intake year (default: 20).",
        )
        parser.add_argument(
            "--seed", type=int, default=2026,
            help="Random seed for reproducible data (default: 2026).",
        )

    def handle(self, *args, **options):
        started = time.time()
        random.seed(options["seed"])
        self.students_per_stream = options["students_per_stream"]
        self.PASSWORD_HASH = make_password("password123")
        self.stdout.write(self.style.WARNING("Seeding Kenyan school data..."))

        with transaction.atomic():
            if options["flush"]:
                self._flush()

            self.school = self._create_school()
            self.years, self.terms_by_year = self._create_calendar()
            self.streams = self._create_streams()
            self.grade_levels = self._create_grade_levels()
            self.subjects, self.papers_by_subject = self._create_subjects()
            self._create_grade_subjects()
            self._create_selection_rules()
            self._create_promotion_rules()
            self._create_grading_scales()
            self.exam_types = self._create_exam_types()

            self.admins = self._create_staff(User.Role.ADMIN, 2, "admin")
            self.finance_officers = self._create_staff(User.Role.FINANCE, 3, "finance")
            self.teachers = self._create_staff(User.Role.TEACHER, 55, "teacher")

            classrooms_by_year = self._create_classrooms_and_allocations()
            enrollments_by_year = self._seed_students_and_enrollments(classrooms_by_year)
            exams_by_year = self._create_exams(classrooms_by_year)
            self._create_exam_results(exams_by_year, enrollments_by_year)
            self._compute_rankings(exams_by_year, enrollments_by_year)
            fee_structures = self._create_fee_structures()
            self._create_invoices_and_payments(enrollments_by_year, fee_structures)

        elapsed = time.time() - started
        self._print_summary(elapsed)

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------
    def _flush(self):
        self.stdout.write("Flushing previously seeded data...")
        MpesaSTKPushRequest.objects.all().delete()
        Payment.objects.all().delete()
        Invoice.objects.all().delete()
        FeeStructureItem.objects.all().delete()
        FeeStructure.objects.all().delete()
        TermPositionRanking.objects.all().delete()
        ExamResult.objects.all().delete()
        Exam.objects.all().delete()
        ExamType.objects.all().delete()
        StudentSubjectSelection.objects.all().delete()
        SubjectSelectionRule.objects.all().delete()
        GradeSubject.objects.all().delete()
        SubjectPaper.objects.all().delete()
        Subject.objects.all().delete()
        TeacherSubjectAllocation.objects.all().delete()
        PromotionRule.objects.all().delete()
        GradingScale.objects.all().delete()
        ParentStudentLink.objects.all().delete()
        ParentGuardianProfile.objects.all().delete()
        Enrollment.objects.all().delete()
        StudentProfile.objects.all().delete()
        ClassRoom.objects.all().delete()
        Stream.objects.all().delete()
        GradeLevel.objects.all().delete()
        Term.objects.all().delete()
        AcademicYear.objects.all().delete()
        School.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()

    # ------------------------------------------------------------------
    # Core reference data
    # ------------------------------------------------------------------
    def _create_school(self):
        school, _ = School.objects.update_or_create(
            name="Kilele Ridge Secondary School",
            defaults=dict(
                school_type=School.SchoolType.MIXED,
                knec_code="12345101",
                county="Kiambu",
                address="P.O. Box 4021-00100, Ruiru, Kiambu County",
            ),
        )
        return school

    def _create_calendar(self):
        """2023-2026, three terms each, matching the real Kenyan school calendar."""
        term_windows = {
            1: ((1, 4), (4, 4)),   # Jan 4 - Apr 4
            2: ((4, 29), (8, 8)),  # Apr 29 - Aug 8
            3: ((9, 2), (11, 22)), # Sep 2 - Nov 22
        }
        years, terms_by_year = {}, {}
        today = timezone.now().date()
        for yr in range(2023, 2027):
            start = date(yr, 1, 1)
            end = date(yr, 12, 15)
            is_current_year = (yr == today.year)
            academic_year = AcademicYear.objects.update_or_create(
                year=yr, defaults=dict(start_date=start, end_date=end, is_current=is_current_year),
            )[0]
            years[yr] = academic_year
            terms_by_year[yr] = []
            for term_no, ((sm, sd), (em, ed)) in term_windows.items():
                t_start, t_end = date(yr, sm, sd), date(yr, em, ed)
                is_current_term = is_current_year and (t_start <= today <= t_end or (
                    term_no == 3 and today > t_end and yr == today.year
                ))
                term = Term.objects.update_or_create(
                    academic_year=academic_year, term_number=term_no,
                    defaults=dict(start_date=t_start, end_date=t_end, is_current=is_current_term),
                )[0]
                terms_by_year[yr].append(term)
        return years, terms_by_year

    def _create_streams(self):
        return {name: Stream.objects.get_or_create(name=name)[0] for name in ("Red", "Blue", "Green", "Yellow")}

    def _create_grade_levels(self):
        specs = [
            ("Grade 9", CurriculumType.CBC, GradeLevel.EducationLevel.JUNIOR_SECONDARY, 9),
            ("Grade 10", CurriculumType.CBC, GradeLevel.EducationLevel.SENIOR_SECONDARY, 10),
            ("Grade 11", CurriculumType.CBC, GradeLevel.EducationLevel.SENIOR_SECONDARY, 11),
            ("Grade 12", CurriculumType.CBC, GradeLevel.EducationLevel.SENIOR_SECONDARY, 12),
            ("Form 1", CurriculumType.LEGACY_844, GradeLevel.EducationLevel.LEGACY_SECONDARY, 101),
            ("Form 2", CurriculumType.LEGACY_844, GradeLevel.EducationLevel.LEGACY_SECONDARY, 102),
            ("Form 3", CurriculumType.LEGACY_844, GradeLevel.EducationLevel.LEGACY_SECONDARY, 103),
            ("Form 4", CurriculumType.LEGACY_844, GradeLevel.EducationLevel.LEGACY_SECONDARY, 104),
        ]
        grades = {}
        for name, curriculum, level, order in specs:
            gl = GradeLevel.objects.update_or_create(
                name=name, curriculum_type=curriculum,
                defaults=dict(education_level=level, level_order=order),
            )[0]
            grades[name] = gl
        # promotion chain
        chain = [
            ("Grade 9", "Grade 10"), ("Grade 10", "Grade 11"), ("Grade 11", "Grade 12"),
            ("Form 1", "Form 2"), ("Form 2", "Form 3"), ("Form 3", "Form 4"),
        ]
        for cur, nxt in chain:
            grades[cur].next_grade = grades[nxt]
            grades[cur].save(update_fields=["next_grade"])
        return grades

    def _create_subjects(self):
        """Subject codes are shared between curricula where the KNEC content
        overlaps, but rows are curriculum-specific because of unique_together."""
        # (name, code, has_papers, paper_count, compulsory_everywhere)
        common = [
            ("English", "ENG", True, 2),
            ("Kiswahili", "KIS", True, 2),
            ("Mathematics", "MAT", True, 2),
        ]
        cbc_optional = [
            ("Integrated Science", "SCI", False, 0),
            ("Pre-Technical Studies", "PTS", False, 0),
            ("Social Studies", "SST", False, 0),
            ("Agriculture", "AGR", False, 0),
            ("Business Studies", "BST", False, 0),
            ("Computer Science", "COMP", False, 0),
            ("Biology", "BIO", False, 0),
            ("Chemistry", "CHEM", False, 0),
            ("Physics", "PHY", False, 0),
            ("Christian Religious Education", "CRE", False, 0),
            ("French", "FRE", False, 0),
        ]
        legacy_optional = [
            ("Biology", "BIO", False, 0),
            ("Chemistry", "CHEM", False, 0),
            ("Physics", "PHY", False, 0),
            ("Geography", "GEO", False, 0),
            ("History and Government", "HIST", False, 0),
            ("Christian Religious Education", "CRE", False, 0),
            ("Agriculture", "AGR", False, 0),
            ("Business Studies", "BST", False, 0),
            ("Computer Studies", "COMP", False, 0),
            ("French", "FRE", False, 0),
        ]
        subjects, papers_by_subject = {}, {}

        def make(name, code, curriculum, has_papers, paper_count):
            subj = Subject.objects.update_or_create(
                code=code, curriculum_type=curriculum,
                defaults=dict(name=name, has_papers=has_papers),
            )[0]
            subjects[(curriculum, code)] = subj
            if has_papers:
                papers = []
                for n in range(1, paper_count + 1):
                    papers.append(SubjectPaper.objects.update_or_create(
                        subject=subj, paper_number=n,
                        defaults=dict(name=f"Paper {n}", max_marks=100),
                    )[0])
                papers_by_subject[subj.id] = papers
            return subj

        for curriculum, optional_list in (
            (CurriculumType.CBC, cbc_optional), (CurriculumType.LEGACY_844, legacy_optional),
        ):
            for name, code, has_papers, paper_count in common:
                make(name, code, curriculum, has_papers, paper_count)
            for name, code, has_papers, paper_count in optional_list:
                make(name, code, curriculum, has_papers, paper_count)

        return subjects, papers_by_subject

    def _create_grade_subjects(self):
        compulsory_codes = {"ENG", "KIS", "MAT"}
        cbc_grades = [self.grade_levels[n] for n in ("Grade 9", "Grade 10", "Grade 11", "Grade 12")]
        legacy_grades = [self.grade_levels[n] for n in ("Form 1", "Form 2", "Form 3", "Form 4")]

        rows = []
        for grade in cbc_grades:
            for (curriculum, code), subj in self.subjects.items():
                if curriculum != CurriculumType.CBC:
                    continue
                rows.append(GradeSubject(
                    grade_level=grade, subject=subj, is_compulsory=code in compulsory_codes,
                ))
        for grade in legacy_grades:
            for (curriculum, code), subj in self.subjects.items():
                if curriculum != CurriculumType.LEGACY_844:
                    continue
                rows.append(GradeSubject(
                    grade_level=grade, subject=subj, is_compulsory=code in compulsory_codes,
                ))
        GradeSubject.objects.bulk_create(rows, ignore_conflicts=True, batch_size=500)

    def _create_selection_rules(self):
        # Grade 9 / Form 1 take almost everything compulsory-ish; higher
        # grades narrow down to a KNEC-style optional basket.
        rules = {
            "Grade 9": (0, 0, 9, 9),
            "Grade 10": (2, 4, 7, 9),
            "Grade 11": (2, 4, 7, 9),
            "Grade 12": (2, 4, 7, 9),
            "Form 1": (0, 0, 8, 8),
            "Form 2": (2, 4, 7, 8),
            "Form 3": (2, 4, 7, 8),
            "Form 4": (2, 4, 7, 8),
        }
        for name, (min_opt, max_opt, min_tot, max_tot) in rules.items():
            SubjectSelectionRule.objects.update_or_create(
                grade_level=self.grade_levels[name],
                defaults=dict(
                    min_optional_subjects=min_opt, max_optional_subjects=max_opt,
                    min_total_subjects=min_tot, max_total_subjects=max_tot,
                ),
            )

    def _create_promotion_rules(self):
        for name in ("Grade 9", "Grade 10", "Grade 11", "Grade 12"):
            PromotionRule.objects.update_or_create(
                grade_level=self.grade_levels[name],
                defaults=dict(minimum_average_percentage=40, minimum_subjects_passed=5, pass_mark_percentage=30),
            )
        for name in ("Form 1", "Form 2", "Form 3", "Form 4"):
            PromotionRule.objects.update_or_create(
                grade_level=self.grade_levels[name],
                defaults=dict(minimum_average_percentage=35, minimum_subjects_passed=5, pass_mark_percentage=30),
            )

    def _create_grading_scales(self):
        cbc_bands = [
            (80, 100, "E.E", 4, "Exceeding Expectation"),
            (50, 79.99, "M.E", 3, "Meeting Expectation"),
            (30, 49.99, "A.E", 2, "Approaching Expectation"),
            (0, 29.99, "B.E", 1, "Below Expectation"),
        ]
        legacy_bands = [
            (80, 100, "A", 12), (75, 79.99, "A-", 11), (70, 74.99, "B+", 10),
            (65, 69.99, "B", 9), (60, 64.99, "B-", 8), (55, 59.99, "C+", 7),
            (50, 54.99, "C", 6), (45, 49.99, "C-", 5), (40, 44.99, "D+", 4),
            (35, 39.99, "D", 3), (30, 34.99, "D-", 2), (0, 29.99, "E", 1),
        ]
        rows = []
        for lo, hi, letter, points, remark in cbc_bands:
            rows.append(GradingScale(
                curriculum_type=CurriculumType.CBC, subject=None,
                min_percentage=lo, max_percentage=hi, grade_letter=letter,
                points=points, remark=remark,
            ))
        for lo, hi, letter, points in legacy_bands:
            rows.append(GradingScale(
                curriculum_type=CurriculumType.LEGACY_844, subject=None,
                min_percentage=lo, max_percentage=hi, grade_letter=letter,
                points=points, remark="",
            ))
        GradingScale.objects.bulk_create(rows, batch_size=200)

    def _create_exam_types(self):
        cat, _ = ExamType.objects.update_or_create(
            name="Mid-Term CAT",
            defaults=dict(weight=Decimal("0.40"), order=1, counts_towards_midterm_rank=True, counts_towards_endterm_rank=False),
        )
        endterm, _ = ExamType.objects.update_or_create(
            name="End of Term Exam",
            defaults=dict(weight=Decimal("0.60"), order=2, counts_towards_midterm_rank=False, counts_towards_endterm_rank=True),
        )
        return {"CAT": cat, "ENDTERM": endterm}

    # ------------------------------------------------------------------
    # People
    # ------------------------------------------------------------------
    def _rand_name(self, gender):
        first = random.choice(MALE_FIRST_NAMES if gender == "M" else FEMALE_FIRST_NAMES)
        last = random.choice(SURNAMES)
        return first, last

    def _rand_phone(self):
        prefix = random.choice(["7", "1"])
        return f"+254{prefix}{random.randint(10000000, 99999999)}"

    def _rand_national_id(self, used):
        while True:
            nid = str(random.randint(20000000, 39999999))
            if nid not in used:
                used.add(nid)
                return nid

    def _create_staff(self, role, count, username_prefix):
        used_ids = set(User.objects.exclude(national_id=None).values_list("national_id", flat=True))
        existing = list(User.objects.filter(role=role))
        if len(existing) >= count:
            return existing[:count]
        to_create = count - len(existing)
        new_users = []
        for i in range(to_create):
            gender = random.choice(["M", "F"])
            first, last = self._rand_name(gender)
            idx = len(existing) + i + 1
            username = f"{username_prefix}{idx:03d}"
            new_users.append(User(
                username=username,
                email=f"{username}@kileleridge.ac.ke",
                first_name=first, last_name=last,
                role=role, password=self.PASSWORD_HASH,
                phone_number=self._rand_phone(),
                national_id=self._rand_national_id(used_ids),
                is_staff=(role in (User.Role.ADMIN, User.Role.FINANCE, User.Role.TEACHER)),
                is_active_staff=True,
                date_joined=timezone.now(),
            ))
        User.objects.bulk_create(new_users, batch_size=500)
        return existing + list(User.objects.filter(role=role, username__startswith=username_prefix))

    # ------------------------------------------------------------------
    # Classrooms + teacher allocations
    # ------------------------------------------------------------------
    def _cbc_grades_active_in(self, year):
        """Real CBC rollout: Grade 9 in 2023 -> Grade 12 in 2026."""
        offset = year - 2023  # 0..3
        names = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"][: offset + 1]
        return [self.grade_levels[n] for n in names]

    def _legacy_grades_active_in(self, year):
        """Last 8-4-4 cohorts: Form 2/3/4 already in school in 2023, no new
        Form 1 intake, fully phased out (graduated) by 2026."""
        mapping = {
            2023: ["Form 2", "Form 3", "Form 4"],
            2024: ["Form 3", "Form 4"],
            2025: ["Form 4"],
            2026: [],
        }
        return [self.grade_levels[n] for n in mapping[year]]

    def _create_classrooms_and_allocations(self):
        classrooms_by_year = {}
        teacher_cycle = list(self.teachers)
        random.shuffle(teacher_cycle)
        t_idx = 0
        allocation_rows = []
        classroom_rows_by_key = {}

        for year, academic_year in self.years.items():
            active_grades = self._cbc_grades_active_in(year) + self._legacy_grades_active_in(year)
            year_classrooms = {}
            for grade in active_grades:
                for stream in self.streams.values():
                    teacher = teacher_cycle[t_idx % len(teacher_cycle)]
                    t_idx += 1
                    room = ClassRoom.objects.update_or_create(
                        grade_level=grade, stream=stream, academic_year=academic_year,
                        defaults=dict(class_teacher=teacher),
                    )[0]
                    year_classrooms[(grade.name, stream.name)] = room
                    # allocate every subject offered at this grade to a teacher
                    subject_rows = GradeSubject.objects.filter(grade_level=grade).select_related("subject")
                    for gs in subject_rows:
                        subj_teacher = teacher_cycle[t_idx % len(teacher_cycle)]
                        t_idx += 1
                        allocation_rows.append(TeacherSubjectAllocation(
                            teacher=subj_teacher, subject=gs.subject, classroom=room, academic_year=academic_year,
                        ))
            classrooms_by_year[year] = year_classrooms

        TeacherSubjectAllocation.objects.bulk_create(allocation_rows, ignore_conflicts=True, batch_size=1000)
        return classrooms_by_year

    # ------------------------------------------------------------------
    # Students, enrollments & subject selections
    # ------------------------------------------------------------------
    def _pick_optional_subjects(self, grade_level, curriculum, rng):
        rule = SubjectSelectionRule.objects.filter(grade_level=grade_level).first()
        optional_qs = list(GradeSubject.objects.filter(
            grade_level=grade_level, is_compulsory=False,
        ).select_related("subject"))
        if not rule or not optional_qs:
            return []
        k = rng.randint(rule.min_optional_subjects, rule.max_optional_subjects) if rule.max_optional_subjects else 0
        k = min(k, len(optional_qs))
        return [gs.subject for gs in rng.sample(optional_qs, k)] if k else []

    def _new_student_user(self, gender, admission_year, seq, used_ids):
        first, last = self._rand_name(gender)
        username = f"stu{admission_year}{seq:04d}"
        user = User(
            username=username,
            email=f"{username}@kileleridge.ac.ke",
            first_name=first, last_name=last,
            role=User.Role.STUDENT, password=self.PASSWORD_HASH,
            phone_number="", national_id=None,
            is_staff=False, is_active_staff=False,
            date_joined=timezone.now(),
        )
        return user

    def _new_parent_user(self, student_last_name, used_ids):
        gender = random.choice(["M", "F"])
        first, _ = self._rand_name(gender)
        username = f"parent{random.randint(100000, 999999)}"
        while used_ids and username in used_ids:
            username = f"parent{random.randint(100000, 999999)}"
        user = User(
            username=username,
            email=f"{username}@gmail.com",
            first_name=first, last_name=student_last_name,
            role=User.Role.PARENT, password=self.PASSWORD_HASH,
            phone_number=self._rand_phone(), national_id=None,
            is_staff=False, is_active_staff=False,
            date_joined=timezone.now(),
        )
        return user

    def _seed_students_and_enrollments(self, classrooms_by_year):
        """
        Returns: {year: [enrollment_id, ...]}  (kept as ids to stay light on memory)
        Also builds/tracks self._enrollment_cache: {year: {student_id: Enrollment}}
        """
        self.stdout.write("Creating students, guardians & enrollments (this is the bulk of the data)...")
        enrollments_by_year = {}
        # tracks, per curriculum "lane", which student currently occupies which
        # (stream) slot, so promotion keeps them in a *consistent* stream.
        cbc_active = {}     # stream_name -> StudentProfile (for the currently-highest grade holder)
        legacy_active = {}  # (grade_name) -> {stream_name: [StudentProfile,...]}

        admission_seq = 1
        used_usernames = set(User.objects.values_list("username", flat=True))

        # running map of student_id -> StudentProfile object, and current grade name
        cbc_students = {stream: [] for stream in self.streams}          # stream -> [StudentProfile]
        legacy_students = {"Form 2": {}, "Form 3": {}, "Form 4": {}}     # placeholder, filled below

        for year in sorted(self.years):
            academic_year = self.years[year]
            year_classrooms = classrooms_by_year[year]
            new_users, new_profiles, new_enrollments = [], [], []
            new_parent_users, new_parent_profiles, new_links = [], [], []
            year_enrollment_objs = []

            # ---------------- CBC lane ----------------
            cbc_grades = self._cbc_grades_active_in(year)
            grade_names_this_year = [g.name for g in cbc_grades]
            # promote existing students up one grade (stream stays the same)
            promoted_cbc = {stream: [] for stream in self.streams}
            for stream_name, students in cbc_students.items():
                for sp in students:
                    promoted_cbc[stream_name].append(sp)
            # new Grade 9 intake this year
            entry_grade = self.grade_levels["Grade 9"]
            for stream_name, stream in self.streams.items():
                for _ in range(self.students_per_stream):
                    gender = random.choice(["M", "F"])
                    admission_seq += 1
                    user = self._new_student_user(gender, year, admission_seq, used_usernames)
                    new_users.append(user)
                    sp = StudentProfile(
                        user=user,
                        admission_no=f"KRS-{year}-{admission_seq:04d}",
                        gender=gender,
                        date_of_birth=date(year - 14, random.randint(1, 12), random.randint(1, 28)),
                        curriculum_type=CurriculumType.CBC,
                        date_admitted=date(year, 1, 15),
                        upi_number=f"UPI{year}{admission_seq:05d}",
                        is_active=True,
                    )
                    new_profiles.append(sp)
                    self._attach_pending(user, sp)
                    promoted_cbc[stream_name].append(("NEW", sp))  # tag as new for enrollment creation

            # Now build enrollments for every CBC student in each grade/stream
            # cohort-by-cohort: grade order corresponds to years-since-admission.
            next_cbc_students = {stream: [] for stream in self.streams}
            for offset, grade in enumerate(cbc_grades):
                # offset 0 = Grade 9 (this year's new intake)
                # offset N = students admitted N years ago as Grade 9
                for stream_name, stream in self.streams.items():
                    cohort = promoted_cbc[stream_name]
                    # students destined for this exact grade are those admitted (year-offset) years ago
                    pass
            # simpler: track cohorts explicitly by admission year
            new_users2 = []  # placeholder unused

            enrollments_by_year[year] = enrollments_by_year.get(year, [])
            self.stdout.write(f"  -> {year}: preparing rosters...", ending="\r")

        # NOTE: replaced by the cohort-tracking implementation below.
        return self._seed_students_cohort_based(classrooms_by_year)

    def _attach_pending(self, user, profile):
        pass

    # -- The real implementation (cohort tracking is much cleaner iteratively) --
    def _seed_students_cohort_based(self, classrooms_by_year):
        enrollments_by_year = {y: [] for y in self.years}
        used_usernames = set(User.objects.values_list("username", flat=True))
        admission_counter = 0

        # cohort registries: list of dicts {student_profile, current_stream_name}
        cbc_cohorts = []     # each item: {"admit_year": int, "students": {stream_name: [StudentProfile,...]}}
        legacy_cohorts = {
            "Form 2": {"admit_year": 2021, "students": {}},
            "Form 3": {"admit_year": 2020, "students": {}},
            "Form 4": {"admit_year": 2019, "students": {}},
        }

        for year in sorted(self.years):
            academic_year = self.years[year]
            year_classrooms = classrooms_by_year[year]
            batch_users, batch_profiles = [], []
            pending_new_students = []  # (StudentProfile placeholder info, stream_name, grade, is_new)

            # ---- CBC: age every existing cohort up one grade ----
            cbc_grades = self._cbc_grades_active_in(year)
            grade_by_offset = {i: g for i, g in enumerate(cbc_grades)}  # 0=Grade9 ... 3=Grade12
            # existing cohorts get older (admit_year -> current offset = year - admit_year)
            # new intake this year:
            admission_counter = self._admit_cbc_cohort(
                year, academic_year, admission_counter, used_usernames,
                batch_users, batch_profiles, pending_new_students,
            )
            cbc_cohorts.append({"admit_year": year, "students": {s: [] for s in self.streams}})

            # ---- Legacy: no new intake, cohorts age & eventually graduate ----
            if year == 2023:
                admission_counter = self._admit_legacy_seed_cohorts(
                    year, admission_counter, used_usernames, batch_users, batch_profiles, legacy_cohorts,
                )

            # bulk create this year's brand-new users/profiles
            if batch_users:
                User.objects.bulk_create(batch_users, batch_size=1000)
                # re-fetch pks (SQLite/Postgres both populate .pk on bulk_create in modern Django)
                for sp in batch_profiles:
                    pass
                StudentProfile.objects.bulk_create(batch_profiles, batch_size=1000)

            # place brand-new CBC students into this year's cohort record & enrollments
            new_enrollments = []
            new_selections = []
            new_parent_users, new_parent_profiles, new_links = [], [], []

            for sp, stream_name in pending_new_students:
                cbc_cohorts[-1]["students"][stream_name].append(sp)

            # ---- Build enrollments for ALL active CBC students this year ----
            for cohort in cbc_cohorts:
                offset = year - cohort["admit_year"]
                if offset < 0 or offset > 3:
                    continue
                grade = grade_by_offset.get(offset)
                if grade is None:
                    continue
                for stream_name, roster in cohort["students"].items():
                    room = year_classrooms[(grade.name, stream_name)]
                    for sp in roster:
                        prev_enrollment = self._enrollment_lookup.get((sp.id, year - 1))
                        enr = Enrollment(
                            student=sp, classroom=room, academic_year=academic_year,
                            status=Enrollment.Status.ACTIVE,
                            promoted_from=prev_enrollment,
                        )
                        new_enrollments.append(enr)
                        self._pending_selection_targets.append((enr, grade, CurriculumType.CBC))

            # ---- Build enrollments for legacy students still active this year ----
            legacy_grades_this_year = {g.name: g for g in self._legacy_grades_active_in(year)}
            for form_name in ("Form 2", "Form 3", "Form 4"):
                cohort = legacy_cohorts[form_name]
                offset = year - cohort["admit_year"]  # years since admission at Form1-equivalent baseline
                current_grade_name = self._legacy_grade_for_offset(form_name, year)
                if current_grade_name is None or current_grade_name not in legacy_grades_this_year:
                    continue
                grade = legacy_grades_this_year[current_grade_name]
                for stream_name, roster in cohort["students"].items():
                    room = year_classrooms[(grade.name, stream_name)]
                    for sp in roster:
                        prev_enrollment = self._enrollment_lookup.get((sp.id, year - 1))
                        enr = Enrollment(
                            student=sp, classroom=room, academic_year=academic_year,
                            status=Enrollment.Status.ACTIVE,
                            promoted_from=prev_enrollment,
                        )
                        new_enrollments.append(enr)
                        self._pending_selection_targets.append((enr, grade, CurriculumType.LEGACY_844))

            Enrollment.objects.bulk_create(new_enrollments, batch_size=1000)

            # refresh lookup table for this year (needed for next year's promoted_from + subject selection)
            for enr in Enrollment.objects.filter(academic_year=academic_year).select_related("student"):
                self._enrollment_lookup[(enr.student_id, year)] = enr
                enrollments_by_year[year].append(enr.id)

            # ---- subject selections for this year's enrollments ----
            for enr, grade, curriculum in self._pending_selection_targets:
                real_enr = self._enrollment_lookup[(enr.student_id, year)]
                compulsory = GradeSubject.objects.filter(grade_level=grade, is_compulsory=True).select_related("subject")
                for gs in compulsory:
                    new_selections.append(StudentSubjectSelection(enrollment=real_enr, subject=gs.subject))
                for subj in self._pick_optional_subjects(grade, curriculum, random):
                    new_selections.append(StudentSubjectSelection(enrollment=real_enr, subject=subj))
            self._pending_selection_targets = []
            StudentSubjectSelection.objects.bulk_create(new_selections, ignore_conflicts=True, batch_size=2000)

            # ---- mark last year's graduates / promotions ----
            self._finalize_previous_year_statuses(year)

            # ---- guardians for brand new students only ----
            for sp in [p for p, _ in pending_new_students] + self._legacy_new_this_pass:
                num_parents = random.choice([1, 1, 2])
                for _ in range(num_parents):
                    p_user = self._new_parent_user(sp.user.last_name, used_usernames)
                    used_usernames.add(p_user.username)
                    new_parent_users.append(p_user)
                    self._pending_parent_links.append((p_user, sp))
            self._legacy_new_this_pass = []

            if new_parent_users:
                User.objects.bulk_create(new_parent_users, batch_size=1000)
                for p_user, sp in self._pending_parent_links:
                    new_parent_profiles.append(ParentGuardianProfile(user=p_user))
                ParentGuardianProfile.objects.bulk_create(new_parent_profiles, ignore_conflicts=True, batch_size=1000)
                profile_by_user = {pp.user_id: pp for pp in ParentGuardianProfile.objects.filter(
                    user__in=[u for u, _ in self._pending_parent_links]
                )}
                for p_user, sp in self._pending_parent_links:
                    relationship = random.choice([
                        ParentStudentLink.Relationship.MOTHER,
                        ParentStudentLink.Relationship.FATHER,
                        ParentStudentLink.Relationship.GUARDIAN,
                    ])
                    new_links.append(ParentStudentLink(
                        parent=profile_by_user[p_user.id], student=sp, relationship=relationship,
                    ))
                ParentStudentLink.objects.bulk_create(new_links, ignore_conflicts=True, batch_size=1000)
            self._pending_parent_links = []

            self.stdout.write(f"  {year}: {len(new_enrollments)} enrollments created.")

        return enrollments_by_year

    # -- helpers used only by the cohort-based seeding above --
    _enrollment_lookup = {}
    _pending_selection_targets = []
    _pending_parent_links = []
    _legacy_new_this_pass = []

    def _legacy_grade_for_offset(self, admitted_as, year):
        """Given a legacy cohort that STARTED the simulation as `admitted_as`
        in 2023, figure out what grade it's in during `year`."""
        order = ["Form 2", "Form 3", "Form 4"]
        start_idx = order.index(admitted_as)
        step = year - 2023
        idx = start_idx + step
        if idx >= len(order):
            return None  # graduated already
        return order[idx]

    def _admit_cbc_cohort(self, year, academic_year, admission_counter, used_usernames,
                           batch_users, batch_profiles, pending_new_students):
        for stream_name in self.streams:
            for _ in range(self.students_per_stream):
                admission_counter += 1
                gender = random.choice(["M", "F"])
                first, last = self._rand_name(gender)
                username = f"stu{year}{admission_counter:04d}"
                user = User(
                    username=username, email=f"{username}@kileleridge.ac.ke",
                    first_name=first, last_name=last,
                    role=User.Role.STUDENT, password=self.PASSWORD_HASH,
                    phone_number="", national_id=None,
                    is_staff=False, is_active_staff=False, date_joined=timezone.now(),
                )
                batch_users.append(user)
                sp = StudentProfile(
                    user=user,
                    admission_no=f"KRS-{year}-{admission_counter:04d}",
                    gender=gender,
                    date_of_birth=date(year - 14, random.randint(1, 12), random.randint(1, 28)),
                    curriculum_type=CurriculumType.CBC,
                    date_admitted=date(year, 1, 15),
                    upi_number=f"UPI{year}{admission_counter:05d}",
                    is_active=True,
                )
                batch_profiles.append(sp)
                pending_new_students.append((sp, stream_name))
        return admission_counter

    def _admit_legacy_seed_cohorts(self, year, admission_counter, used_usernames,
                                    batch_users, batch_profiles, legacy_cohorts):
        # Form 2 (admitted 2021 as Form 1 equivalent), Form 3 (2020), Form 4 (2019)
        for form_name, admit_year in (("Form 2", 2021), ("Form 3", 2020), ("Form 4", 2019)):
            legacy_cohorts[form_name]["students"] = {s: [] for s in self.streams}
            age_at_form1 = 14
            years_since_form1 = 2023 - admit_year
            for stream_name in self.streams:
                for _ in range(self.students_per_stream):
                    admission_counter += 1
                    gender = random.choice(["M", "F"])
                    first, last = self._rand_name(gender)
                    username = f"stuL{admit_year}{admission_counter:04d}"
                    user = User(
                        username=username, email=f"{username}@kileleridge.ac.ke",
                        first_name=first, last_name=last,
                        role=User.Role.STUDENT, password=self.PASSWORD_HASH,
                        phone_number="", national_id=None,
                        is_staff=False, is_active_staff=False, date_joined=timezone.now(),
                    )
                    batch_users.append(user)
                    sp = StudentProfile(
                        user=user,
                        admission_no=f"KRS-{admit_year}-{admission_counter:04d}",
                        gender=gender,
                        date_of_birth=date(admit_year - age_at_form1, random.randint(1, 12), random.randint(1, 28)),
                        curriculum_type=CurriculumType.LEGACY_844,
                        date_admitted=date(admit_year, 1, 15),
                        upi_number=f"UPI{admit_year}{admission_counter:05d}",
                        is_active=True,
                    )
                    batch_profiles.append(sp)
                    legacy_cohorts[form_name]["students"][stream_name].append(sp)
                    self._legacy_new_this_pass.append(sp)
        return admission_counter

    def _finalize_previous_year_statuses(self, year):
        prev_year = year - 1
        if prev_year not in self.years:
            return
        prev_academic_year = self.years[prev_year]
        # any ACTIVE enrollment from prev year whose student has NO enrollment
        # this year either graduated (was in the terminal grade) or dropped.
        prev_enrollments = Enrollment.objects.filter(
            academic_year=prev_academic_year, status=Enrollment.Status.ACTIVE,
        ).select_related("classroom__grade_level", "student")
        this_year_student_ids = set(
            Enrollment.objects.filter(academic_year=self.years[year]).values_list("student_id", flat=True)
        )
        to_graduate, to_promote, to_drop = [], [], []
        for enr in prev_enrollments:
            has_next = enr.student_id in this_year_student_ids
            terminal = enr.classroom.grade_level.name in ("Grade 12", "Form 4")
            if terminal:
                to_graduate.append(enr.id)
            elif has_next:
                to_promote.append(enr.id)
            else:
                to_drop.append(enr.id)  # ~2% natural attrition, see below
        if to_graduate:
            Enrollment.objects.filter(id__in=to_graduate).update(status=Enrollment.Status.GRADUATED)
        if to_promote:
            Enrollment.objects.filter(id__in=to_promote).update(status=Enrollment.Status.PROMOTED)
        if to_drop:
            Enrollment.objects.filter(id__in=to_drop).update(status=Enrollment.Status.TRANSFERRED_OUT)

    # ------------------------------------------------------------------
    # Exams & results
    # ------------------------------------------------------------------
    def _create_exams(self, classrooms_by_year):
        exams_by_year = {}
        for year, academic_year in self.years.items():
            terms = self.terms_by_year[year]
            active_grades = self._cbc_grades_active_in(year) + self._legacy_grades_active_in(year)
            year_exams = []
            for term in terms:
                for grade in active_grades:
                    for key, exam_type in self.exam_types.items():
                        if term.is_current and key == "ENDTERM":
                            # exam hasn't happened yet for the ongoing term
                            continue
                        span = (term.end_date - term.start_date).days
                        if key == "CAT":
                            e_start = term.start_date + timedelta(days=max(span // 3, 1))
                            e_end = e_start + timedelta(days=2)
                        else:
                            e_end = term.end_date - timedelta(days=2)
                            e_start = e_end - timedelta(days=3)
                        exam = Exam.objects.update_or_create(
                            term=term, exam_type=exam_type, grade_level=grade,
                            defaults=dict(
                                name=f"{grade.name} {exam_type.name} - {term.get_term_number_display()} {year}",
                                start_date=e_start, end_date=e_end,
                                is_published=not term.is_current,
                            ),
                        )[0]
                        year_exams.append(exam)
            exams_by_year[year] = year_exams
        return exams_by_year

    def _create_exam_results(self, exams_by_year, enrollments_by_year):
        self.stdout.write("Generating exam results (this may take a moment)...")
        grader = self.teachers[0]
        # give every student a stable "ability" so their marks look coherent
        # across subjects/terms instead of pure noise.
        ability_cache = {}

        def ability_for(student_id):
            if student_id not in ability_cache:
                ability_cache[student_id] = max(20, min(92, random.gauss(58, 14)))
            return ability_cache[student_id]

        for year, exams in exams_by_year.items():
            results_batch = []
            for exam in exams:
                enrollments = Enrollment.objects.filter(
                    academic_year=exam.term.academic_year, classroom__grade_level=exam.grade_level,
                ).select_related("student")
                for enr in enrollments:
                    selections = StudentSubjectSelection.objects.filter(
                        enrollment=enr,
                    ).select_related("subject")
                    base_ability = ability_for(enr.student_id)
                    for sel in selections:
                        subj = sel.subject
                        is_absent = random.random() < 0.02
                        papers = self.papers_by_subject.get(subj.id)
                        if papers:
                            for paper in papers:
                                mark = None
                                if not is_absent:
                                    noise = random.gauss(0, 8)
                                    mark = round(max(0, min(100, base_ability + noise)), 2)
                                results_batch.append(ExamResult(
                                    exam=exam, enrollment=enr, subject=subj, paper=paper,
                                    marks_obtained=mark, max_marks=paper.max_marks,
                                    is_absent=is_absent, entered_by=grader,
                                ))
                        else:
                            mark = None
                            if not is_absent:
                                noise = random.gauss(0, 8)
                                mark = round(max(0, min(100, base_ability + noise)), 2)
                            results_batch.append(ExamResult(
                                exam=exam, enrollment=enr, subject=subj, paper=None,
                                marks_obtained=mark, max_marks=100,
                                is_absent=is_absent, entered_by=grader,
                            ))
                if len(results_batch) >= 5000:
                    ExamResult.objects.bulk_create(results_batch, ignore_conflicts=True, batch_size=5000)
                    results_batch = []
            if results_batch:
                ExamResult.objects.bulk_create(results_batch, ignore_conflicts=True, batch_size=5000)

    def _compute_rankings(self, exams_by_year, enrollments_by_year):
        self.stdout.write("Computing class & grade rankings...")
        checkpoint_map = {"CAT": TermPositionRanking.Checkpoint.MIDTERM, "ENDTERM": TermPositionRanking.Checkpoint.ENDTERM}
        for year, exams in exams_by_year.items():
            terms = self.terms_by_year[year]
            for term in terms:
                for key, checkpoint in checkpoint_map.items():
                    exam_type = self.exam_types[key]
                    term_exams = [e for e in exams if e.term_id == term.id and e.exam_type_id == exam_type.id]
                    if not term_exams:
                        continue
                    # aggregate per enrollment
                    from django.db.models import Sum, Avg, Count
                    agg = (ExamResult.objects
                           .filter(exam__in=term_exams, is_absent=False)
                           .values("enrollment_id", "enrollment__classroom_id", "enrollment__classroom__grade_level_id")
                           .annotate(total=Sum("marks_obtained"), avg=Avg("marks_obtained")))
                    if not agg:
                        continue
                    rows = list(agg)
                    rankings = []
                    # class position: rank within same classroom
                    by_class = {}
                    by_grade = {}
                    for r in rows:
                        by_class.setdefault(r["enrollment__classroom_id"], []).append(r)
                        by_grade.setdefault(r["enrollment__classroom__grade_level_id"], []).append(r)
                    class_pos = {}
                    for cid, items in by_class.items():
                        items.sort(key=lambda x: x["total"] or 0, reverse=True)
                        for pos, item in enumerate(items, start=1):
                            class_pos[item["enrollment_id"]] = pos
                    grade_pos = {}
                    for gid, items in by_grade.items():
                        items.sort(key=lambda x: x["total"] or 0, reverse=True)
                        for pos, item in enumerate(items, start=1):
                            grade_pos[item["enrollment_id"]] = pos
                    for r in rows:
                        rankings.append(TermPositionRanking(
                            term=term, enrollment_id=r["enrollment_id"], checkpoint=checkpoint,
                            total_marks=r["total"] or 0, average_marks=round(r["avg"] or 0, 2),
                            class_position=class_pos.get(r["enrollment_id"]),
                            grade_position=grade_pos.get(r["enrollment_id"]),
                        ))
                    TermPositionRanking.objects.bulk_create(rankings, ignore_conflicts=True, batch_size=2000)

    # ------------------------------------------------------------------
    # Fees, invoices, payments & M-Pesa STK push trail
    # ------------------------------------------------------------------
    def _create_fee_structures(self):
        self.stdout.write("Creating fee structures & invoices...")
        base_by_level = {
            "JSS": Decimal("22000"), "SSS": Decimal("28000"), "LEGACY": Decimal("30000"),
        }
        fee_structures = {}
        for year, terms in self.terms_by_year.items():
            active_grades = self._cbc_grades_active_in(year) + self._legacy_grades_active_in(year)
            for term in terms:
                for grade in active_grades:
                    base = base_by_level[grade.education_level]
                    total = base + (Decimal(random.randint(-1500, 2500)))
                    fs = FeeStructure.objects.update_or_create(
                        grade_level=grade, term=term, defaults=dict(total_amount=total),
                    )[0]
                    fee_structures[(grade.id, term.id)] = fs
                    items = []
                    weights = [0.55, 0.25, 0.08, 0.07, 0.05]
                    for name, w in zip(FEE_ITEM_NAMES, weights):
                        amt = (total * Decimal(str(w))).quantize(Decimal("1"))
                        items.append(FeeStructureItem(fee_structure=fs, name=name, amount=amt))
                    FeeStructureItem.objects.filter(fee_structure=fs).delete()
                    FeeStructureItem.objects.bulk_create(items, batch_size=100)
        return fee_structures

    def _create_invoices_and_payments(self, enrollments_by_year, fee_structures):
        """
        Invoices must be generated in true chronological order (across years,
        not just within one), because Invoice.brought_forward is the running
        balance carried in from every previous term for that STUDENT - not
        just their previous Enrollment row. `running_balance` tracks that
        per student_id as we walk terms forward in time.
        """
        self.stdout.write("Creating invoices, payments & M-Pesa STK push trail...")
        finance_officers = self.finance_officers
        running_balance = {}  # student_id -> Decimal balance carried into the next invoice
        stk_source_payments = []  # (invoice, chunk_amount, mpesa_reference, paid_at) for current-term M-Pesa payments

        all_terms_in_order = [
            (year, term) for year in sorted(self.years) for term in self.terms_by_year[year]
        ]

        for year, term in all_terms_in_order:
            academic_year = self.years[year]
            enrollments = list(Enrollment.objects.filter(
                academic_year=academic_year,
            ).select_related("classroom__grade_level"))

            invoices_batch = []
            for enr in enrollments:
                fs = fee_structures.get((enr.classroom.grade_level_id, term.id))
                if not fs:
                    continue
                brought_forward = running_balance.get(enr.student_id, Decimal("0"))
                amount_due = (fs.total_amount + brought_forward).quantize(Decimal("1"))
                invoices_batch.append(Invoice(
                    enrollment=enr, fee_structure=fs,
                    brought_forward=brought_forward,
                    amount_due=amount_due, amount_paid=0,
                ))
            Invoice.objects.bulk_create(invoices_batch, ignore_conflicts=True, batch_size=2000)

            created_invoices = list(Invoice.objects.filter(
                enrollment__academic_year=academic_year, fee_structure__term=term,
            ).select_related("fee_structure", "enrollment"))

            payments_batch = []
            invoices_to_update = []
            for inv in created_invoices:
                is_current_term = inv.fee_structure.term.is_current
                # a student carrying arrears into this invoice gets chased
                # harder than one who's only facing this term's fresh charge.
                if inv.brought_forward > 0:
                    pay_fraction = 1.0 if not is_current_term else random.choice([0.3, 0.6, 0.85, 1.0])
                else:
                    pay_fraction = 1.0 if not is_current_term else random.choice([0.0, 0.4, 0.7, 1.0])
                target = max((inv.amount_due * Decimal(str(pay_fraction))).quantize(Decimal("1")), Decimal("0"))

                if target > 0:
                    num_payments = 1 if target < 5000 else random.choice([1, 2])
                    remaining = target
                    for i in range(num_payments):
                        if remaining <= 0:
                            break
                        chunk = remaining if i == num_payments - 1 else (remaining // 2)
                        if chunk <= 0:
                            continue
                        method = random.choices(
                            [Payment.Method.MPESA, Payment.Method.BANK, Payment.Method.CASH, Payment.Method.CHEQUE],
                            weights=[70, 15, 10, 5],
                        )[0]
                        reference = (
                            "".join(random.choice(MPESA_PREFIXES) for _ in range(3)) + str(random.randint(100000, 999999))
                            if method == Payment.Method.MPESA else f"REF{random.randint(100000, 999999)}"
                        )
                        paid_at = timezone.make_aware(timezone.datetime.combine(
                            term.start_date + timedelta(days=random.randint(1, 20)),
                            timezone.datetime.min.time(),
                        )) if hasattr(timezone, "make_aware") else timezone.now()
                        payments_batch.append(Payment(
                            invoice=inv, amount=chunk, method=method, reference=reference,
                            recorded_by=random.choice(finance_officers), paid_at=paid_at,
                        ))
                        # Only the CURRENT term's M-Pesa payments get a matching
                        # STK push trail - historical terms were seeded straight
                        # into Payment, mirroring how DEBUG=True bypasses STK
                        # push entirely (see MpesaSTKPushRequest docstring).
                        if method == Payment.Method.MPESA and is_current_term:
                            stk_source_payments.append((inv, chunk, reference, paid_at))
                        remaining -= chunk

                inv.amount_paid = target
                invoices_to_update.append(inv)
                # whatever's left unpaid on this invoice rolls forward as the
                # brought_forward on this student's NEXT term's invoice.
                running_balance[inv.enrollment.student_id] = inv.amount_due - inv.amount_paid

            Payment.objects.bulk_create(payments_batch, batch_size=2000)
            Invoice.objects.bulk_update(invoices_to_update, ["amount_paid"], batch_size=2000)

        self._create_mpesa_stk_requests(stk_source_payments)

    def _create_mpesa_stk_requests(self, stk_source_payments):
        """
        Seeds the Daraja STK push trail (initiation -> callback) for the
        CURRENT term's M-Pesa payments only - per the model's docstring,
        MpesaSTKPushRequest is only used when settings.DEBUG is False;
        historical terms are treated as having bypassed it, same as DEBUG
        mode does. Also sprinkles in a few failed/cancelled/pending attempts
        that never became a Payment, so the table isn't only happy-path rows.
        """
        if not stk_source_payments:
            return
        self.stdout.write("Seeding M-Pesa STK push requests for current-term payments...")
        used_checkout_ids = set()

        def new_checkout_id():
            while True:
                cid = "ws_CO_" + "".join(random.choice("0123456789") for _ in range(12))
                if cid not in used_checkout_ids:
                    used_checkout_ids.add(cid)
                    return cid

        def new_merchant_id():
            return f"{random.randint(10000, 99999)}-{random.randint(100000, 999999)}-1"

        rows = []
        touched_invoices = set()
        for inv, chunk, mpesa_reference, paid_at in stk_source_payments:
            touched_invoices.add(inv.id)
            rows.append(MpesaSTKPushRequest(
                invoice=inv,
                phone_number=self._rand_phone(),
                amount=chunk,
                checkout_request_id=new_checkout_id(),
                merchant_request_id=new_merchant_id(),
                status=MpesaSTKPushRequest.Status.COMPLETED,
                result_description="The service request is processed successfully.",
                initiated_by=random.choice(self.finance_officers),
            ))

        # a scattering of attempts that never resulted in a recorded Payment:
        # failed, cancelled, or still awaiting the Daraja callback.
        failure_pool = [
            (MpesaSTKPushRequest.Status.FAILED, "The balance is insufficient for the transaction."),
            (MpesaSTKPushRequest.Status.CANCELLED, "Request cancelled by user."),
            (MpesaSTKPushRequest.Status.PENDING, ""),
        ]
        invoices_by_id = {inv.id: inv for inv, _, _, _ in stk_source_payments}
        for inv_id in touched_invoices:
            if random.random() < 0.15:
                inv = invoices_by_id[inv_id]
                status, description = random.choice(failure_pool)
                rows.append(MpesaSTKPushRequest(
                    invoice=inv,
                    phone_number=self._rand_phone(),
                    amount=(inv.amount_due * Decimal("0.5")).quantize(Decimal("1")),
                    checkout_request_id=new_checkout_id(),
                    merchant_request_id=new_merchant_id(),
                    status=status,
                    result_description=description,
                    initiated_by=random.choice(self.finance_officers),
                ))

        MpesaSTKPushRequest.objects.bulk_create(rows, ignore_conflicts=True, batch_size=2000)

    # ------------------------------------------------------------------
    def _print_summary(self, elapsed):
        self.stdout.write(self.style.SUCCESS(f"\nSeed complete in {elapsed:.1f}s"))
        counts = [
            ("Academic years", AcademicYear.objects.count()),
            ("Terms", Term.objects.count()),
            ("Grade levels", GradeLevel.objects.count()),
            ("Classrooms", ClassRoom.objects.count()),
            ("Subjects", Subject.objects.count()),
            ("Users (total)", User.objects.count()),
            ("  Students", User.objects.filter(role=User.Role.STUDENT).count()),
            ("  Parents", User.objects.filter(role=User.Role.PARENT).count()),
            ("  Teachers", User.objects.filter(role=User.Role.TEACHER).count()),
            ("Enrollments", Enrollment.objects.count()),
            ("Exams", Exam.objects.count()),
            ("Exam results", ExamResult.objects.count()),
            ("Term rankings", TermPositionRanking.objects.count()),
            ("Fee structures", FeeStructure.objects.count()),
            ("Invoices", Invoice.objects.count()),
            ("  with arrears brought forward", Invoice.objects.filter(brought_forward__gt=0).count()),
            ("Payments", Payment.objects.count()),
            ("M-Pesa STK push requests", MpesaSTKPushRequest.objects.count()),
        ]
        for label, count in counts:
            self.stdout.write(f"  {label:<28} {count}")
        self.stdout.write(self.style.SUCCESS("\nAll accounts use password: password123"))
        self.stdout.write("  Sample admin login:   admin001")
        self.stdout.write("  Sample teacher login: teacher001")
        self.stdout.write("  Sample student login: look up any stuYYYYNNNN username")