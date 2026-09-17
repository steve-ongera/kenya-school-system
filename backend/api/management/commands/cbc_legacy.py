"""
management/commands/seed_data.py

Seeds the REFERENCE / CONSTANT data every deployment of this school system
needs before a school can start using it - the stuff that doesn't change
per-school (subjects, grade structure, exam types, grading scales, CBC
pathways, 8-4-4 elective groups/tracks) or is provider-controlled
(subscription packages), as opposed to school-specific data (School,
AcademicYear, ClassRoom, students...) which is created through the app
itself.

Run with:
    python manage.py seed_data

Safe to re-run: everything uses get_or_create()/update_or_create(), so
running this twice never duplicates rows - it just fills in anything
that's missing (e.g. after adding a new subject to this file).

IMPORTANT - READ BEFORE USING IN PRODUCTION:
The CBC subject lists, JSS/SSS groupings, SubjectSelectionRule min/max
numbers, pathway assignments, 8-4-4 elective groups, and elective tracks
below are a reasonable APPROXIMATION of the KICD/KNEC curriculum designs,
not a verbatim transcription of the current circular. CBC senior-school
pathway subject combinations (STEM / Social Sciences / Arts & Sports
Science), JSS optional subject counts, and the 8-4-4 subject-grouping
rules (which subjects count as "Technical", "Humanities", "Sciences", and
how many of each a student must take) are periodically revised - confirm
current groupings against KICD/KNEC guidance and adjust the maps and
SelectionTrack/TrackGroupRule seeding below before relying on this for
real KCSE/CBC compliance. Everything seeded here can also be edited
afterwards from the admin Subjects page (Pathways / Groups & Tracks /
Selection Rules tabs) without touching this file again. The 8-4-4 grading
scale and paper structure below match the long-standing KNEC A-E/12-point
scale and are stable.

Adjust the import below ("from ... import models") if your app label is
not "api" (i.e. if this file lives at <yourapp>/management/commands/seed_data.py).
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from ... import models


class Command(BaseCommand):
    help = (
        "Seeds constant/reference data: packages, grade levels, streams, CBC pathways, "
        "8-4-4 subject groups, subjects, grade-subjects, selection rules, elective tracks, "
        "exam types, grading scales."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip",
            nargs="*",
            default=[],
            help="Space-separated list of steps to skip, e.g. --skip packages grading_scales",
        )

    def handle(self, *args, **options):
        skip = set(options.get("skip") or [])

        steps = [
            ("packages", self.seed_subscription_packages),
            ("grade_levels", self.seed_grade_levels),
            ("streams", self.seed_streams),
            ("pathways", self.seed_pathways),
            ("subject_groups", self.seed_subject_groups),
            ("subjects", self.seed_subjects),
            ("subject_pathways", self.seed_subject_pathways),
            ("subject_elective_groups", self.seed_subject_elective_groups),
            ("grade_subjects", self.seed_grade_subjects),
            ("selection_rules", self.seed_subject_selection_rules),
            ("selection_tracks", self.seed_selection_tracks),
            ("exam_types", self.seed_exam_types),
            ("grading_scales", self.seed_grading_scales),
        ]

        with transaction.atomic():
            for name, fn in steps:
                if name in skip:
                    self.stdout.write(self.style.WARNING(f"Skipping {name}"))
                    continue
                fn()

        self.stdout.write(self.style.SUCCESS("Seed data complete."))

    # -----------------------------------------------------------------
    # 1. SUBSCRIPTION PACKAGES (one per PlanTier)
    # -----------------------------------------------------------------
    def seed_subscription_packages(self):
        """
        Pricing is a placeholder - update monthly_price/features to match
        your actual pricing sheet. Limits mirror models.PLAN_DEFAULTS so
        the pricing card and the enforced License limits agree by default.
        """
        packages = [
            {
                "tier": models.PlanTier.TRIAL,
                "monthly_price": Decimal("0"),
                "max_students": 50,
                "max_classrooms_per_year": 4,
                "max_teachers": 5,
                "features": ["30-day trial", "Core student & fee management", "Email support"],
                "display_order": 0,
            },
            {
                "tier": models.PlanTier.GO,
                "monthly_price": Decimal("2500"),
                "max_students": 300,
                "max_classrooms_per_year": 15,
                "max_teachers": 20,
                "features": ["Up to 300 students", "M-Pesa fee collection", "Exam ranking", "Email support"],
                "display_order": 1,
            },
            {
                "tier": models.PlanTier.STANDARD,
                "monthly_price": Decimal("6000"),
                "max_students": 800,
                "max_classrooms_per_year": 40,
                "max_teachers": 60,
                "features": [
                    "Up to 800 students", "SMS notifications", "Timetable auto-generation",
                    "Finance reports", "Priority email support",
                ],
                "display_order": 2,
            },
            {
                "tier": models.PlanTier.PREMIUM,
                "monthly_price": Decimal("15000"),
                "max_students": 2000,
                "max_classrooms_per_year": 100,
                "max_teachers": 150,
                "features": [
                    "Up to 2000 students", "SMS + Email notifications", "Advanced finance reports",
                    "Parent portal", "Priority phone support",
                ],
                "display_order": 3,
            },
            {
                "tier": models.PlanTier.PRO,
                "monthly_price": Decimal("30000"),
                "max_students": None,
                "max_classrooms_per_year": None,
                "max_teachers": None,
                "features": [
                    "Unlimited students, classrooms & teachers", "Dedicated account manager",
                    "Custom integrations", "24/7 support",
                ],
                "display_order": 4,
            },
        ]

        for pkg in packages:
            obj, created = models.SubscriptionPackage.objects.update_or_create(
                tier=pkg["tier"], defaults=pkg
            )
            self._log(obj, created)

    # -----------------------------------------------------------------
    # 2. GRADE LEVELS - CBC (Grade 9 JSS, Grade 10-12 SSS) + 8-4-4 (Form 1-4)
    # -----------------------------------------------------------------
    def seed_grade_levels(self):
        grade_defs = [
            # (name, curriculum_type, education_level, level_order)
            ("Grade 9", models.CurriculumType.CBC, models.GradeLevel.EducationLevel.JUNIOR_SECONDARY, 9),
            ("Grade 10", models.CurriculumType.CBC, models.GradeLevel.EducationLevel.SENIOR_SECONDARY, 10),
            ("Grade 11", models.CurriculumType.CBC, models.GradeLevel.EducationLevel.SENIOR_SECONDARY, 11),
            ("Grade 12", models.CurriculumType.CBC, models.GradeLevel.EducationLevel.SENIOR_SECONDARY, 12),
            ("Form 1", models.CurriculumType.LEGACY_844, models.GradeLevel.EducationLevel.LEGACY_SECONDARY, 101),
            ("Form 2", models.CurriculumType.LEGACY_844, models.GradeLevel.EducationLevel.LEGACY_SECONDARY, 102),
            ("Form 3", models.CurriculumType.LEGACY_844, models.GradeLevel.EducationLevel.LEGACY_SECONDARY, 103),
            ("Form 4", models.CurriculumType.LEGACY_844, models.GradeLevel.EducationLevel.LEGACY_SECONDARY, 104),
        ]

        grades = {}
        for name, curriculum_type, education_level, level_order in grade_defs:
            obj, created = models.GradeLevel.objects.get_or_create(
                name=name, curriculum_type=curriculum_type,
                defaults={"education_level": education_level, "level_order": level_order},
            )
            grades[name] = obj
            self._log(obj, created)

        # chain next_grade within each curriculum (promotion path)
        chains = [
            ["Grade 9", "Grade 10", "Grade 11", "Grade 12"],
            ["Form 1", "Form 2", "Form 3", "Form 4"],
        ]
        for chain in chains:
            for current_name, next_name in zip(chain, chain[1:]):
                current = grades[current_name]
                next_grade = grades[next_name]
                if current.next_grade_id != next_grade.id:
                    current.next_grade = next_grade
                    current.save(update_fields=["next_grade"])
            # top of the ladder (Grade 12 / Form 4) keeps next_grade=None -
            # bulk_promote_classroom_auto() treats that as "graduate this class"

    # -----------------------------------------------------------------
    # 3. STREAMS
    # -----------------------------------------------------------------
    def seed_streams(self):
        for name in ["Red", "Blue", "Green", "Yellow", "White"]:
            obj, created = models.Stream.objects.get_or_create(name=name)
            self._log(obj, created)

    # -----------------------------------------------------------------
    # 4. CBC PATHWAYS (Grade 9-12 - STEM / Social Sciences / Arts & Sports Science)
    # -----------------------------------------------------------------
    PATHWAYS = [
        {
            "code": "STEM",
            "name": "STEM (Science, Technology, Engineering & Mathematics)",
            "description": "Pure sciences, applied sciences, and technical/engineering studies.",
        },
        {
            "code": "SOCIAL",
            "name": "Social Sciences",
            "description": "Humanities, business studies, and languages/literature.",
        },
        {
            "code": "ARTS_SPORTS",
            "name": "Arts & Sports Science",
            "description": "Performing/visual arts, and sports science.",
        },
    ]

    def seed_pathways(self):
        self._pathways = {}
        for p in self.PATHWAYS:
            obj, created = models.Pathway.objects.update_or_create(
                code=p["code"],
                defaults={"name": p["name"], "description": p["description"], "is_active": True},
            )
            self._pathways[p["code"]] = obj
            self._log(obj, created)

    # Which CBC elective (sss_optional, below) belongs to which pathway.
    # Compulsory CBC subjects (ENG/KIS/CSL/PE) are never tagged - a
    # compulsory subject is always included regardless of pathway.
    CBC_PATHWAY_SUBJECTS = {
        "MAT": "STEM", "BIO": "STEM", "CHE": "STEM", "PHY": "STEM",
        "COS": "STEM", "AGR": "STEM", "AVT": "STEM",
        "BST": "SOCIAL", "HIS": "SOCIAL", "GEO": "SOCIAL", "CRE": "SOCIAL", "IRE": "SOCIAL",
        "FRE": "SOCIAL", "GER": "SOCIAL", "ARA": "SOCIAL",
        "MUS": "ARTS_SPORTS", "FIN": "ARTS_SPORTS", "HSC": "ARTS_SPORTS",
    }

    def seed_subject_pathways(self):
        """Tags each CBC elective Subject with its pathway. Run after seed_pathways/seed_subjects."""
        if not hasattr(self, "_pathways"):
            self.seed_pathways()
        if not hasattr(self, "_subjects"):
            self.seed_subjects()

        cbc = self._subjects["CBC"]
        updated = 0
        for code, pathway_code in self.CBC_PATHWAY_SUBJECTS.items():
            subject = cbc.get(code)
            pathway = self._pathways.get(pathway_code)
            if not subject or not pathway:
                continue
            if subject.pathway_id != pathway.id:
                subject.pathway = pathway
                subject.save(update_fields=["pathway"])
                updated += 1
        self.stdout.write(f"  [pathway-tagged] {updated} CBC subject(s) updated")

    # -----------------------------------------------------------------
    # 5. 8-4-4 SUBJECT GROUPS (Form 3-4 - Technical / Humanities / Sciences)
    # -----------------------------------------------------------------
    SUBJECT_GROUPS = [
        {"code": "TECHNICAL", "name": "Technical"},
        {"code": "HUMANITIES", "name": "Humanities"},
        {"code": "SCIENCES", "name": "Sciences"},
    ]

    def seed_subject_groups(self):
        self._subject_groups = {}
        for g in self.SUBJECT_GROUPS:
            obj, created = models.SubjectGroup.objects.update_or_create(
                code=g["code"], defaults={"name": g["name"]}
            )
            self._subject_groups[g["code"]] = obj
            self._log(obj, created)

    # Which 8-4-4 elective belongs to which group. Chemistry is deliberately
    # NOT in the Sciences group - see the Form 3/4 compulsory list below,
    # where it becomes compulsory alongside ENG/KIS/MAT, so "3 sciences"
    # is Chemistry (compulsory) + Biology + Physics (the Sciences group).
    LEGACY_GROUP_SUBJECTS = {
        "BST": "TECHNICAL", "COS": "TECHNICAL", "AGR": "TECHNICAL",
        "CRE": "HUMANITIES", "IRE": "HUMANITIES", "HRE": "HUMANITIES",
        "HIS": "HUMANITIES", "GEO": "HUMANITIES",
        "BIO": "SCIENCES", "PHY": "SCIENCES",
    }

    def seed_subject_elective_groups(self):
        """Tags each 8-4-4 elective Subject with its group. Run after seed_subject_groups/seed_subjects."""
        if not hasattr(self, "_subject_groups"):
            self.seed_subject_groups()
        if not hasattr(self, "_subjects"):
            self.seed_subjects()

        legacy = self._subjects["8-4-4"]
        updated = 0
        for code, group_code in self.LEGACY_GROUP_SUBJECTS.items():
            subject = legacy.get(code)
            group = self._subject_groups.get(group_code)
            if not subject or not group:
                continue
            if subject.elective_group_id != group.id:
                subject.elective_group = group
                subject.save(update_fields=["elective_group"])
                updated += 1
        self.stdout.write(f"  [group-tagged] {updated} 8-4-4 subject(s) updated")

    # -----------------------------------------------------------------
    # 6. SUBJECTS (+ SubjectPaper where the subject is split into papers)
    # -----------------------------------------------------------------
    # code -> (name, has_papers)
    CBC_SUBJECTS = {
        "ENG": ("English", False),
        "KIS": ("Kiswahili", False),
        "MAT": ("Mathematics", False),
        "ISC": ("Integrated Science", False),
        "SST": ("Social Studies", False),
        "CRE": ("Christian Religious Education", False),
        "IRE": ("Islamic Religious Education", False),
        "HRE": ("Hindu Religious Education", False),
        "AGR": ("Agriculture and Nutrition", False),
        "PTS": ("Pre-Technical Studies", False),
        "LSK": ("Life Skills Education", False),
        "PE": ("Physical Education", False),
        "CAR": ("Creative Arts", False),
        "CSL": ("Community Service Learning", False),
        "BIO": ("Biology", False),
        "CHE": ("Chemistry", False),
        "PHY": ("Physics", False),
        "COS": ("Computer Science", False),
        "BST": ("Business Studies", False),
        "HIS": ("History and Citizenship", False),
        "GEO": ("Geography", False),
        "FRE": ("French", False),
        "GER": ("German", False),
        "ARA": ("Arabic", False),
        "MUS": ("Music", False),
        "FIN": ("Fine Art", False),
        "HSC": ("Home Science", False),
        "AVT": ("Aviation Technology", False),
    }

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

    def seed_subjects(self):
        self._subjects = {"CBC": {}, "8-4-4": {}}

        for code, (name, has_papers) in self.CBC_SUBJECTS.items():
            obj, created = models.Subject.objects.get_or_create(
                code=code, curriculum_type=models.CurriculumType.CBC,
                defaults={"name": name, "has_papers": has_papers},
            )
            self._subjects["CBC"][code] = obj
            self._log(obj, created)

        for code, (name, has_papers, papers) in self.LEGACY_SUBJECTS.items():
            obj, created = models.Subject.objects.get_or_create(
                code=code, curriculum_type=models.CurriculumType.LEGACY_844,
                defaults={"name": name, "has_papers": has_papers},
            )
            self._subjects["8-4-4"][code] = obj
            self._log(obj, created)

            for paper_number, label, max_marks in papers:
                paper_obj, paper_created = models.SubjectPaper.objects.get_or_create(
                    subject=obj, paper_number=paper_number,
                    defaults={"name": label, "max_marks": max_marks},
                )
                self._log(paper_obj, paper_created)

    # -----------------------------------------------------------------
    # 7. GRADE <-> SUBJECT OFFERINGS (which subjects at which grade, compulsory or not)
    # -----------------------------------------------------------------
    def seed_grade_subjects(self):
        if not hasattr(self, "_subjects"):
            self.seed_subjects()

        cbc = self._subjects["CBC"]
        legacy = self._subjects["8-4-4"]

        grades = {g.name: g for g in models.GradeLevel.objects.all()}

        # ---- Grade 9 (Junior Secondary) - broad compulsory core, RE + a
        # foreign/technical elective chosen via SubjectSelectionRule below ----
        jss_compulsory = ["ENG", "KIS", "MAT", "ISC", "SST", "AGR", "PTS", "PE", "CAR", "LSK"]
        jss_optional = ["CRE", "IRE", "HRE", "FRE", "GER", "ARA", "HSC"]
        self._assign_grade_subjects(grades["Grade 9"], cbc, jss_compulsory, jss_optional)

        # ---- Grade 10-12 (Senior Secondary) - compulsory core across all
        # pathways, everything else is a pathway/elective choice (see
        # CBC_PATHWAY_SUBJECTS above for which pathway each belongs to) ----
        sss_compulsory = ["ENG", "KIS", "CSL", "PE"]
        sss_optional = [
            "MAT", "BIO", "CHE", "PHY", "COS", "BST", "HIS", "GEO",
            "CRE", "IRE", "FRE", "GER", "ARA", "MUS", "FIN", "HSC", "AGR", "AVT",
        ]
        for grade_name in ("Grade 10", "Grade 11", "Grade 12"):
            self._assign_grade_subjects(grades[grade_name], cbc, sss_compulsory, sss_optional)

        # ---- Form 1-2 (8-4-4) - ENG/KIS/MAT compulsory, everything else optional ----
        legacy_compulsory = ["ENG", "KIS", "MAT"]
        for grade_name in ("Form 1", "Form 2"):
            legacy_optional = [c for c in legacy.keys() if c not in legacy_compulsory]
            self._assign_grade_subjects(grades[grade_name], legacy, legacy_compulsory, legacy_optional)

        # ---- Form 3-4 (8-4-4) - ENG/KIS/MAT/CHEMISTRY compulsory. Electives
        # are picked group-by-group via a SelectionTrack (see
        # seed_selection_tracks below): either "Technical + Humanities"
        # (one Technical subject + 1-2 Humanities subjects) or "Triple
        # Science" (Biology + Physics, which combined with compulsory
        # Chemistry gives the 3 sciences). Ungrouped subjects (French,
        # German, Arabic, Music, Home Science, Art...) stay free electives
        # to round the total up to 7 or 8. ----
        legacy_compulsory_f3f4 = legacy_compulsory + ["CHE"]
        for grade_name in ("Form 3", "Form 4"):
            legacy_optional_f3f4 = [c for c in legacy.keys() if c not in legacy_compulsory_f3f4]
            self._assign_grade_subjects(grades[grade_name], legacy, legacy_compulsory_f3f4, legacy_optional_f3f4)

    def _assign_grade_subjects(self, grade_level, subject_map, compulsory_codes, optional_codes):
        for code in compulsory_codes:
            obj, created = models.GradeSubject.objects.update_or_create(
                grade_level=grade_level, subject=subject_map[code],
                defaults={"is_compulsory": True},
            )
            self._log(obj, created)
        for code in optional_codes:
            obj, created = models.GradeSubject.objects.update_or_create(
                grade_level=grade_level, subject=subject_map[code],
                defaults={"is_compulsory": False},
            )
            self._log(obj, created)

    # -----------------------------------------------------------------
    # 8. SUBJECT SELECTION RULES (min/max optional & total subjects per grade)
    # -----------------------------------------------------------------
    def seed_subject_selection_rules(self):
        grades = {g.name: g for g in models.GradeLevel.objects.all()}

        rules = {
            # JSS + SSS: requires_pathway=True means the student must pick a
            # Pathway (STEM/Social Sciences/Arts & Sports Science) before
            # their optional-subject choices are validated - see
            # services.validate_subject_selection. Toggle this off per-grade
            # from the admin Selection Rules tab if you'd rather JSS not
            # require a pathway.
            "Grade 9": {
                "requires_pathway": True,
                "min_optional_subjects": 1, "max_optional_subjects": 2,
                "min_total_subjects": 11, "max_total_subjects": 12,
            },
            "Grade 10": {
                "requires_pathway": True,
                "min_optional_subjects": 3, "max_optional_subjects": 5,
                "min_total_subjects": 7, "max_total_subjects": 9,
            },
            "Grade 11": {
                "requires_pathway": True,
                "min_optional_subjects": 3, "max_optional_subjects": 5,
                "min_total_subjects": 7, "max_total_subjects": 9,
            },
            "Grade 12": {
                "requires_pathway": True,
                "min_optional_subjects": 3, "max_optional_subjects": 5,
                "min_total_subjects": 7, "max_total_subjects": 9,
            },
            # Form 1-2: no pathway/track requirement yet.
            "Form 1": {
                "requires_pathway": False,
                "min_optional_subjects": 4, "max_optional_subjects": 6,
                "min_total_subjects": 7, "max_total_subjects": 9,
            },
            "Form 2": {
                "requires_pathway": False,
                "min_optional_subjects": 4, "max_optional_subjects": 6,
                "min_total_subjects": 7, "max_total_subjects": 9,
            },
            # Form 3-4: elective track required (see seed_selection_tracks).
            # 4 compulsory (ENG/KIS/MAT/CHE) + 3-4 optional = 7-8 total.
            "Form 3": {
                "requires_pathway": False,
                "min_optional_subjects": 3, "max_optional_subjects": 4,
                "min_total_subjects": 7, "max_total_subjects": 8,
            },
            "Form 4": {
                "requires_pathway": False,
                "min_optional_subjects": 3, "max_optional_subjects": 4,
                "min_total_subjects": 7, "max_total_subjects": 8,
            },
        }

        for grade_name, defaults in rules.items():
            obj, created = models.SubjectSelectionRule.objects.update_or_create(
                grade_level=grades[grade_name], defaults=defaults,
            )
            self._log(obj, created)

    # -----------------------------------------------------------------
    # 9. SELECTION TRACKS (Form 3-4 elective combinations)
    # -----------------------------------------------------------------
    def seed_selection_tracks(self):
        """
        Two alternative Form 3/4 tracks, each constraining how many
        subjects to pick from which SubjectGroup:

          - "Technical + Humanities": exactly 1 Technical subject
            (Business/Computer/Agriculture) + 1-2 Humanities subjects
            (CRE/IRE/HRE/History/Geography).
          - "Triple Science": exactly 2 Sciences-group subjects (Biology +
            Physics), which combined with the now-compulsory Chemistry
            gives the student 3 sciences.

        A student picks ONE track; validate_subject_selection then checks
        their chosen optional subjects against that track's group rules,
        on top of the grade's overall min/max total from
        SubjectSelectionRule. Run after seed_grade_levels/seed_subject_groups.
        """
        if not hasattr(self, "_subject_groups"):
            self.seed_subject_groups()

        grades = {g.name: g for g in models.GradeLevel.objects.all()}
        technical = self._subject_groups["TECHNICAL"]
        humanities = self._subject_groups["HUMANITIES"]
        sciences = self._subject_groups["SCIENCES"]

        for grade_name in ("Form 3", "Form 4"):
            grade = grades[grade_name]

            tech_humanities, created = models.SelectionTrack.objects.update_or_create(
                grade_level=grade, name="Technical + Humanities", defaults={"is_active": True},
            )
            self._log(tech_humanities, created)
            self._set_track_rule(tech_humanities, technical, min_choose=1, max_choose=1)
            self._set_track_rule(tech_humanities, humanities, min_choose=1, max_choose=2)

            triple_science, created = models.SelectionTrack.objects.update_or_create(
                grade_level=grade, name="Triple Science", defaults={"is_active": True},
            )
            self._log(triple_science, created)
            self._set_track_rule(triple_science, sciences, min_choose=2, max_choose=2)

    def _set_track_rule(self, track, group, min_choose, max_choose):
        obj, created = models.TrackGroupRule.objects.update_or_create(
            track=track, group=group,
            defaults={"min_choose": min_choose, "max_choose": max_choose},
        )
        self._log(obj, created)

    # -----------------------------------------------------------------
    # 10. EXAM TYPES
    # -----------------------------------------------------------------
    def seed_exam_types(self):
        exam_types = [
            {"name": "CAT 1", "weight": Decimal("0.5"), "order": 1, "counts_towards_midterm_rank": True, "counts_towards_endterm_rank": True},
            {"name": "CAT 2", "weight": Decimal("0.5"), "order": 2, "counts_towards_midterm_rank": True, "counts_towards_endterm_rank": True},
            {"name": "Midterm Exam", "weight": Decimal("1.0"), "order": 3, "counts_towards_midterm_rank": True, "counts_towards_endterm_rank": True},
            {"name": "End Term Exam", "weight": Decimal("2.0"), "order": 4, "counts_towards_midterm_rank": False, "counts_towards_endterm_rank": True},
        ]
        for et in exam_types:
            obj, created = models.ExamType.objects.update_or_create(name=et["name"], defaults=et)
            self._log(obj, created)

    # -----------------------------------------------------------------
    # 11. GRADING SCALES - 8-4-4 (KNEC A-E/12-point) + CBC (4-level rubric)
    # -----------------------------------------------------------------
    def seed_grading_scales(self):
        # ---- 8-4-4: standard KNEC scale, curriculum-wide default (subject=None) ----
        legacy_scale = [
            (80, 100, "A", 12, "Excellent"),
            (75, 79.99, "A-", 11, "Very Good"),
            (70, 74.99, "B+", 10, "Good"),
            (65, 69.99, "B", 9, "Good"),
            (60, 64.99, "B-", 8, "Above Average"),
            (55, 59.99, "C+", 7, "Average"),
            (50, 54.99, "C", 6, "Average"),
            (45, 49.99, "C-", 5, "Below Average"),
            (40, 44.99, "D+", 4, "Below Average"),
            (35, 39.99, "D", 3, "Weak"),
            (30, 34.99, "D-", 2, "Weak"),
            (0, 29.99, "E", 1, "Very Weak"),
        ]
        for min_pct, max_pct, letter, points, remark in legacy_scale:
            obj, created = models.GradingScale.objects.update_or_create(
                curriculum_type=models.CurriculumType.LEGACY_844, subject=None,
                min_percentage=Decimal(str(min_pct)), max_percentage=Decimal(str(max_pct)),
                defaults={"grade_letter": letter, "points": Decimal(str(points)), "remark": remark},
            )
            self._log(obj, created)

        # ---- CBC: simplified 4-level competency rubric, curriculum-wide
        # default. KICD's official rubric splits each band further (e.g.
        # EE1/EE2) - simplified here to 4 bands; refine if your school
        # reports the finer sub-bands. ----
        cbc_scale = [
            (80, 100, "EE", 4, "Exceeding Expectation"),
            (60, 79.99, "ME", 3, "Meeting Expectation"),
            (40, 59.99, "AE", 2, "Approaching Expectation"),
            (0, 39.99, "BE", 1, "Below Expectation"),
        ]
        for min_pct, max_pct, letter, points, remark in cbc_scale:
            obj, created = models.GradingScale.objects.update_or_create(
                curriculum_type=models.CurriculumType.CBC, subject=None,
                min_percentage=Decimal(str(min_pct)), max_percentage=Decimal(str(max_pct)),
                defaults={"grade_letter": letter, "points": Decimal(str(points)), "remark": remark},
            )
            self._log(obj, created)

    # -----------------------------------------------------------------
    def _log(self, obj, created):
        prefix = "created" if created else "exists "
        self.stdout.write(f"  [{prefix}] {obj}")