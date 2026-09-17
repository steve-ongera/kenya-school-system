"""
management/commands/reset_and_setup_school.py

FULL RESET + INITIAL SETUP for this deployment, scoped to exactly what
this school is running right now: 8-4-4 only, Form 1-4 only, Red & Blue
streams only. This command REPLACES seed_data.py for the moment - do not
run seed_data.py after this, since it would re-add CBC subjects/pathways
and extra (CAT1/CAT2) exam types you don't want yet. When this school
later enrolls a CBC Grade 10 cohort, extend this command (or write a
follow-up one) to add the CBC grade levels/subjects/pathways at that time.

WARNING - DESTRUCTIVE: step 1 deletes existing data across effectively
every model in the app (students, enrollments, exams, fees, messages,
users, subjects, streams, classrooms, etc.) before rebuilding from
scratch. Requires an explicit --yes flag so it can never run by accident.

Run with:
    python manage.py reset_and_setup_school --yes

Edit the CONFIG block below (admin credentials, academic year dates, term
dates) before running for real.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from ... import models

# ---------------------------------------------------------------------
# CONFIG - edit before running
# ---------------------------------------------------------------------
ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@gmail.com"
ADMIN_PASSWORD = "password123"

ACADEMIC_YEAR = 2026
YEAR_START_DATE = "2026-01-06"
YEAR_END_DATE = "2026-11-13"

# (term_number, start_date, end_date, is_current)
TERMS = [
    (1, "2026-01-06", "2026-04-03", False),
    (2, "2026-04-27", "2026-08-07", False),
    (3, "2026-08-31", "2026-11-13", True),
]

EXAM_TYPES = [
    # (name, weight, order, counts_towards_midterm_rank, counts_towards_endterm_rank)
    ("Midterm Exam", "1.0", 1, True, False),
    ("End Term Exam", "1.0", 2, False, True),
]

STREAM_NAMES = ["Red", "Blue"]

GRADE_DEFS = [
    # (name, level_order)
    ("Form 1", 101),
    ("Form 2", 102),
    ("Form 3", 103),
    ("Form 4", 104),
]

# code -> (name, has_papers, [(paper_number, label, max_marks), ...])
LEGACY_SUBJECTS = {
    "ENG": ("English", True, [(1, "Paper 1", 100), (2, "Paper 2", 100), (3, "Paper 3", 100)]),
    "KIS": ("Kiswahili", True, [(1, "Karatasi 1", 100), (2, "Karatasi 2", 100), (3, "Karatasi 3", 100)]),
    "MAT": ("Mathematics", True, [(1, "Paper 1", 100), (2, "Paper 2", 100)]),
    "BIO": ("Biology", True, [(1, "Paper 1", 80), (2, "Paper 2", 80), (3, "Paper 3 (Practical)", 40)]),
    "CHE": ("Chemistry", True, [(1, "Paper 1", 80), (2, "Paper 2", 80), (3, "Paper 3 (Practical)", 40)]),
    "PHY": ("Physics", True, [(1, "Paper 1", 80), (2, "Paper 2", 80), (3, "Paper 3 (Practical)", 40)]),
    "HIS": ("History and Government", False, []),
    "GEO": ("Geography", False, []),
    "CRE": ("Christian Religious Education", False, []),
    "IRE": ("Islamic Religious Education", False, []),
    "HRE": ("Hindu Religious Education", False, []),
    "BST": ("Business Studies", False, []),
    "AGR": ("Agriculture", True, [(1, "Paper 1", 100), (2, "Paper 2 (Practical)", 100)]),
    "COS": ("Computer Studies", True, [(1, "Paper 1", 100), (2, "Paper 2 (Practical)", 100)]),
    "HSC": ("Home Science", True, [(1, "Paper 1", 100), (2, "Paper 2 (Practical)", 100)]),
    "ART": ("Art and Design", True, [(1, "Paper 1", 100), (2, "Paper 2 (Practical)", 100)]),
    "MUS": ("Music", False, []),
    "FRE": ("French", False, []),
    "GER": ("German", False, []),
    "ARA": ("Arabic", False, []),
}

SUBJECT_GROUPS = [
    {"code": "TECHNICAL", "name": "Technical"},
    {"code": "HUMANITIES", "name": "Humanities"},
    {"code": "SCIENCES", "name": "Sciences"},
]

# Chemistry is deliberately not grouped - it's compulsory in Form 3/4
# (see legacy_compulsory_f3f4 below), and combines with the Sciences
# group (Biology + Physics) to make "3 sciences" under Triple Science.
LEGACY_GROUP_SUBJECTS = {
    "BST": "TECHNICAL", "COS": "TECHNICAL", "AGR": "TECHNICAL",
    "CRE": "HUMANITIES", "IRE": "HUMANITIES", "HRE": "HUMANITIES",
    "HIS": "HUMANITIES", "GEO": "HUMANITIES",
    "BIO": "SCIENCES", "PHY": "SCIENCES",
}

SELECTION_RULES = {
    "Form 1": {"requires_pathway": False, "min_optional_subjects": 4, "max_optional_subjects": 6,
               "min_total_subjects": 7, "max_total_subjects": 9},
    "Form 2": {"requires_pathway": False, "min_optional_subjects": 4, "max_optional_subjects": 6,
               "min_total_subjects": 7, "max_total_subjects": 9},
    "Form 3": {"requires_pathway": False, "min_optional_subjects": 3, "max_optional_subjects": 4,
               "min_total_subjects": 7, "max_total_subjects": 8},
    "Form 4": {"requires_pathway": False, "min_optional_subjects": 3, "max_optional_subjects": 4,
               "min_total_subjects": 7, "max_total_subjects": 8},
}

# Models to wipe, ordered leaf-most first. Django's delete() already
# cascades correctly on its own, but listing every model explicitly
# guarantees nothing survives - including rows only connected via
# on_delete=SET_NULL, which don't get removed by cascading alone.
CLEAR_ORDER = [
    "DirectMessage", "Conversation",
    "CommunicationRecipient", "Communication",
    "MpesaSTKPushRequest", "Payment", "Invoice",
    "FeeStructureItem", "FeeStructureMissingAlert", "FeeStructure",
    "TermPositionRanking", "ExamResult", "Exam",
    "TimetableEntry", "TeacherSubjectAllocation", "PeriodSlot",
    "StudentSubjectSelection", "ClassroomPromotion", "Enrollment",
    "ParentStudentLink", "ParentGuardianProfile", "StudentProfile",
    "ClassRoom",
    "TrackGroupRule", "SelectionTrack", "SubjectSelectionRule",
    "GradeSubject", "SubjectPaper", "GradingScale", "Subject",
    "SubjectGroup", "Pathway", "PromotionRule", "GradeLevel", "Stream",
    "Term", "AcademicYear", "ExamType",
    "LicenseAuditLog", "LicenseToken", "License", "SubscriptionPackage",
    "LoginAttemptLog", "User", "School",
]


class Command(BaseCommand):
    help = "Wipes existing data, then sets up 8-4-4 subjects, admin user, 2026 year/terms, exam types, streams, and Form 1-4 classrooms."

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes", action="store_true",
            help="Required. Confirms you understand this deletes existing data.",
        )

    def handle(self, *args, **options):
        if not options["yes"]:
            raise CommandError(
                "This command deletes existing data. Re-run with --yes to confirm, "
                "e.g. `python manage.py reset_and_setup_school --yes`."
            )

        with transaction.atomic():
            self.clear_existing_data()
            self.create_admin_user()
            academic_year = self.create_academic_year_and_terms()
            self.create_exam_types()
            streams = self.create_streams()
            grades = self.create_grade_levels()
            self.create_classrooms(academic_year, grades, streams)
            subjects = self.create_subjects()
            self.tag_subject_groups(subjects)
            self.create_grade_subjects(grades, subjects)
            self.create_selection_rules(grades)
            self.create_selection_tracks(grades)

        self.stdout.write(self.style.SUCCESS(
            "Reset + setup complete: 8-4-4 subjects, admin user, "
            f"{ACADEMIC_YEAR} year/terms, exam types, streams, and Form 1-4 classrooms are ready."
        ))

    # -------------------------------------------------------------
    # 1. CLEAR EXISTING DATA
    # -------------------------------------------------------------
    def clear_existing_data(self):
        self.stdout.write(self.style.WARNING("Clearing existing data..."))
        for model_name in CLEAR_ORDER:
            model = getattr(models, model_name)
            deleted_count, _ = model.objects.all().delete()
            self.stdout.write(f"  [cleared] {model_name}: {deleted_count} row(s)")

    # -------------------------------------------------------------
    # 2. ADMIN USER
    # -------------------------------------------------------------
    def create_admin_user(self):
        user = models.User.objects.create_superuser(
            username=ADMIN_USERNAME,
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
        )
        user.role = models.User.Role.ADMIN
        user.is_active_staff = True
        user.save(update_fields=["role", "is_active_staff"])
        self._log(user, True)
        return user

    # -------------------------------------------------------------
    # 3. ACADEMIC YEAR + TERMS
    # -------------------------------------------------------------
    def create_academic_year_and_terms(self):
        academic_year, created = models.AcademicYear.objects.update_or_create(
            year=ACADEMIC_YEAR,
            defaults={
                "start_date": YEAR_START_DATE,
                "end_date": YEAR_END_DATE,
                "is_current": True,
            },
        )
        self._log(academic_year, created)

        for term_number, start_date, end_date, is_current in TERMS:
            term, created = models.Term.objects.update_or_create(
                academic_year=academic_year,
                term_number=term_number,
                defaults={
                    "start_date": start_date,
                    "end_date": end_date,
                    "is_current": is_current,
                },
            )
            self._log(term, created)

        return academic_year

    # -------------------------------------------------------------
    # 4. EXAM TYPES
    # -------------------------------------------------------------
    def create_exam_types(self):
        for name, weight, order, mid_rank, end_rank in EXAM_TYPES:
            obj, created = models.ExamType.objects.update_or_create(
                name=name,
                defaults={
                    "weight": weight,
                    "order": order,
                    "counts_towards_midterm_rank": mid_rank,
                    "counts_towards_endterm_rank": end_rank,
                },
            )
            self._log(obj, created)

    # -------------------------------------------------------------
    # 5. STREAMS
    # -------------------------------------------------------------
    def create_streams(self):
        streams = {}
        for name in STREAM_NAMES:
            stream, created = models.Stream.objects.get_or_create(name=name)
            streams[name] = stream
            self._log(stream, created)
        return streams

    # -------------------------------------------------------------
    # 6. GRADE LEVELS (Form 1-4, chained for promotion)
    # -------------------------------------------------------------
    def create_grade_levels(self):
        grades = {}
        for name, level_order in GRADE_DEFS:
            obj, created = models.GradeLevel.objects.get_or_create(
                name=name,
                curriculum_type=models.CurriculumType.LEGACY_844,
                defaults={
                    "education_level": models.GradeLevel.EducationLevel.LEGACY_SECONDARY,
                    "level_order": level_order,
                },
            )
            grades[name] = obj
            self._log(obj, created)

        names = [name for name, _ in GRADE_DEFS]
        for current_name, next_name in zip(names, names[1:]):
            current = grades[current_name]
            nxt = grades[next_name]
            if current.next_grade_id != nxt.id:
                current.next_grade = nxt
                current.save(update_fields=["next_grade"])
        # Form 4 keeps next_grade=None - promotion logic treats that as
        # "graduate this class" once you're ready to use it.

        return grades

    # -------------------------------------------------------------
    # 7. CLASSROOMS (Form 1-4 x Red/Blue for the current academic year)
    # -------------------------------------------------------------
    def create_classrooms(self, academic_year, grades, streams):
        for grade in grades.values():
            for stream in streams.values():
                classroom, created = models.ClassRoom.objects.get_or_create(
                    grade_level=grade, stream=stream, academic_year=academic_year,
                )
                self._log(classroom, created)

    # -------------------------------------------------------------
    # 8. SUBJECTS (+ papers) - 8-4-4 only
    # -------------------------------------------------------------
    def create_subjects(self):
        subjects = {}
        for code, (name, has_papers, papers) in LEGACY_SUBJECTS.items():
            obj, created = models.Subject.objects.get_or_create(
                code=code, curriculum_type=models.CurriculumType.LEGACY_844,
                defaults={"name": name, "has_papers": has_papers},
            )
            subjects[code] = obj
            self._log(obj, created)

            for paper_number, label, max_marks in papers:
                paper_obj, paper_created = models.SubjectPaper.objects.get_or_create(
                    subject=obj, paper_number=paper_number,
                    defaults={"name": label, "max_marks": max_marks},
                )
                self._log(paper_obj, paper_created)
        return subjects

    # -------------------------------------------------------------
    # 9. SUBJECT GROUPS (Technical/Humanities/Sciences) - tag electives
    # -------------------------------------------------------------
    def tag_subject_groups(self, subjects):
        groups = {}
        for g in SUBJECT_GROUPS:
            obj, created = models.SubjectGroup.objects.update_or_create(
                code=g["code"], defaults={"name": g["name"]}
            )
            groups[g["code"]] = obj
            self._log(obj, created)

        for code, group_code in LEGACY_GROUP_SUBJECTS.items():
            subject = subjects.get(code)
            group = groups.get(group_code)
            if not subject or not group:
                continue
            if subject.elective_group_id != group.id:
                subject.elective_group = group
                subject.save(update_fields=["elective_group"])

        self._groups = groups

    # -------------------------------------------------------------
    # 10. GRADE <-> SUBJECT OFFERINGS
    # -------------------------------------------------------------
    def create_grade_subjects(self, grades, subjects):
        legacy_compulsory = ["ENG", "KIS", "MAT"]
        for grade_name in ("Form 1", "Form 2"):
            optional = [c for c in subjects if c not in legacy_compulsory]
            self._assign_grade_subjects(grades[grade_name], subjects, legacy_compulsory, optional)

        legacy_compulsory_f3f4 = legacy_compulsory + ["CHE"]
        for grade_name in ("Form 3", "Form 4"):
            optional = [c for c in subjects if c not in legacy_compulsory_f3f4]
            self._assign_grade_subjects(grades[grade_name], subjects, legacy_compulsory_f3f4, optional)

    def _assign_grade_subjects(self, grade_level, subject_map, compulsory_codes, optional_codes):
        for code in compulsory_codes:
            obj, created = models.GradeSubject.objects.update_or_create(
                grade_level=grade_level, subject=subject_map[code], defaults={"is_compulsory": True},
            )
            self._log(obj, created)
        for code in optional_codes:
            obj, created = models.GradeSubject.objects.update_or_create(
                grade_level=grade_level, subject=subject_map[code], defaults={"is_compulsory": False},
            )
            self._log(obj, created)

    # -------------------------------------------------------------
    # 11. SELECTION RULES (min/max optional & total subjects per grade)
    # -------------------------------------------------------------
    def create_selection_rules(self, grades):
        for grade_name, defaults in SELECTION_RULES.items():
            obj, created = models.SubjectSelectionRule.objects.update_or_create(
                grade_level=grades[grade_name], defaults=defaults,
            )
            self._log(obj, created)

    # -------------------------------------------------------------
    # 12. SELECTION TRACKS (Form 3-4 elective combinations)
    # -------------------------------------------------------------
    def create_selection_tracks(self, grades):
        technical = self._groups["TECHNICAL"]
        humanities = self._groups["HUMANITIES"]
        sciences = self._groups["SCIENCES"]

        for grade_name in ("Form 3", "Form 4"):
            grade = grades[grade_name]

            tech_humanities, created = models.SelectionTrack.objects.update_or_create(
                grade_level=grade, name="Technical + Humanities", defaults={"is_active": True},
            )
            self._log(tech_humanities, created)
            self._set_track_rule(tech_humanities, technical, 1, 1)
            self._set_track_rule(tech_humanities, humanities, 1, 2)

            triple_science, created = models.SelectionTrack.objects.update_or_create(
                grade_level=grade, name="Triple Science", defaults={"is_active": True},
            )
            self._log(triple_science, created)
            self._set_track_rule(triple_science, sciences, 2, 2)

    def _set_track_rule(self, track, group, min_choose, max_choose):
        obj, created = models.TrackGroupRule.objects.update_or_create(
            track=track, group=group, defaults={"min_choose": min_choose, "max_choose": max_choose},
        )
        self._log(obj, created)

    # -------------------------------------------------------------
    def _log(self, obj, created):
        prefix = "created" if created else "exists "
        self.stdout.write(f"  [{prefix}] {obj}")