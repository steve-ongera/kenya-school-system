"""
Management command: python manage.py seed_students

Seeds BOTH Form 3 and Form 4, Red and Blue streams (4 classrooms total)
for the current academic year, with 21-26 students per classroom (picked
randomly per classroom, per run). Each student gets:
  - a User (STUDENT role, username = admission number, password
    "password123", first/last name, phone number, email)
  - a StudentProfile (admission_no in ADM##### format, gender, date of
    birth, curriculum_type=8-4-4, date_admitted = a day in January 2026)
  - an ACTIVE Enrollment tying them to that classroom for the current
    academic year

Safe to re-run: it only tops a classroom up to its target count for that
run, it never removes students, so re-running just fills any gap.

Options:
  --per-class-min N   lowest random target per classroom (default 21)
  --per-class-max N   highest random target per classroom (default 26)
  --grade "Name"      limit to one grade level, e.g. --grade "Form 3"
                      (repeatable)
  --stream "Name"     limit to one stream, e.g. --stream "Blue"
                      (repeatable)

Place this file at:
  api/management/commands/seed_students.py
(create the two empty __init__.py files alongside it if they don't
already exist: api/management/__init__.py and
api/management/commands/__init__.py)
"""
import random
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import (
    User, StudentProfile, Enrollment, ClassRoom, AcademicYear, CurriculumType,
)

DEFAULT_TARGET_CLASSES = [
    ("Form 3", "Blue"),
    ("Form 3", "Red"),
    ("Form 4", "Blue"),
    ("Form 4", "Red"),
]

ADMISSION_PREFIX = "ADM"
ADMISSION_DIGITS = 5  # ADM00001, ADM11871, ...

ADMITTED_MONTH = 2026, 1  # (year, month) - all seeded students admitted January 2026
ADMITTED_DAY_RANGE = (5, 30)  # random day within that January

# Roughly Form 3 = ~17 yrs old, Form 4 = ~18 yrs old as of 2026 admission.
BIRTH_YEAR_BY_GRADE = {
    "Form 3": 2009,
    "Form 4": 2008,
}

FIRST_NAMES_M = [
    "Brian", "Kevin", "Peter", "Dennis", "Collins", "Victor",
    "Samuel", "John", "Josphat", "Felix", "Erick", "Alex",
]
FIRST_NAMES_F = [
    "Faith", "Grace", "Mercy", "Joyce", "Ann", "Lucy",
    "Esther", "Mary", "Winnie", "Sharon", "Purity", "Diana",
]
LAST_NAMES = [
    "Otieno", "Wanjiru", "Mwangi", "Achieng", "Kiprop", "Njeri",
    "Omondi", "Wambui", "Kamau", "Adhiambo", "Cheruiyot", "Nyambura",
    "Mutiso", "Chebet", "Wafula", "Auma", "Korir", "Nekesa",
]


def next_admission_no() -> str:
    """
    ADM##### e.g. ADM00001, ADM11871 - bumps the sequence past the
    highest existing admission number in this format, so it never
    collides with admissions made through the normal admit-student flow.
    """
    existing = (
        StudentProfile.objects.filter(admission_no__startswith=ADMISSION_PREFIX)
        .values_list("admission_no", flat=True)
    )
    max_seq = 0
    for adm in existing:
        tail = adm[len(ADMISSION_PREFIX):]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{ADMISSION_PREFIX}{max_seq + 1:0{ADMISSION_DIGITS}d}"


def random_admitted_date() -> date:
    year, month = ADMITTED_MONTH
    day = random.randint(*ADMITTED_DAY_RANGE)
    return date(year, month, day)


def random_dob(grade_name: str) -> date:
    birth_year = BIRTH_YEAR_BY_GRADE.get(grade_name, 2009)
    month = random.randint(1, 12)
    day = random.randint(1, 28)  # avoid month-length edge cases
    return date(birth_year, month, day)


def random_phone_number() -> str:
    return "07" + "".join(random.choices("0123456789", k=8))


class Command(BaseCommand):
    help = "Seed Form 3/4 Red & Blue classrooms with 21-26 full student accounts + profiles each."

    def add_arguments(self, parser):
        parser.add_argument(
            "--per-class-min", type=int, default=21,
            help="Lowest random target per classroom (default 21).",
        )
        parser.add_argument(
            "--per-class-max", type=int, default=26,
            help="Highest random target per classroom (default 26).",
        )
        parser.add_argument(
            "--grade", action="append", default=None,
            help='Limit to this grade level, e.g. --grade "Form 3". Repeatable.',
        )
        parser.add_argument(
            "--stream", action="append", default=None,
            help='Limit to this stream, e.g. --stream "Blue". Repeatable.',
        )

    def handle(self, *args, **options):
        per_min = options["per_class_min"]
        per_max = options["per_class_max"]
        grade_filter = options["grade"]
        stream_filter = options["stream"]

        if per_min < 1 or per_max < per_min:
            raise CommandError("--per-class-min must be >= 1 and <= --per-class-max.")

        current_year = AcademicYear.objects.filter(is_current=True).first()
        if not current_year:
            raise CommandError("No current academic year is configured - set one before seeding.")

        target_classes = DEFAULT_TARGET_CLASSES
        if grade_filter or stream_filter:
            target_classes = [
                (g, s) for (g, s) in DEFAULT_TARGET_CLASSES
                if (not grade_filter or g in grade_filter)
                and (not stream_filter or s in stream_filter)
            ]
            if not target_classes:
                raise CommandError("No classrooms matched the --grade/--stream filters given.")

        name_cycle = 0
        total_created = 0

        for grade_name, stream_name in target_classes:
            classroom = ClassRoom.objects.filter(
                grade_level__name=grade_name,
                stream__name=stream_name,
                academic_year=current_year,
            ).first()

            if not classroom:
                self.stdout.write(self.style.WARNING(
                    f"SKIP: no classroom found for {grade_name} {stream_name} ({current_year.year})."
                ))
                continue

            target_count = random.randint(per_min, per_max)
            existing_active = classroom.enrollments.filter(status=Enrollment.Status.ACTIVE).count()
            to_create = max(target_count - existing_active, 0)

            if to_create == 0:
                self.stdout.write(
                    f"SKIP: {classroom} already has {existing_active} active student(s) "
                    f"(target was {target_count})."
                )
                continue

            created_here = 0
            with transaction.atomic():
                for i in range(to_create):
                    is_male = (name_cycle % 2 == 0)
                    first_name = (
                        FIRST_NAMES_M[name_cycle % len(FIRST_NAMES_M)] if is_male
                        else FIRST_NAMES_F[name_cycle % len(FIRST_NAMES_F)]
                    )
                    last_name = LAST_NAMES[name_cycle % len(LAST_NAMES)]
                    name_cycle += 1

                    admission_no = next_admission_no()
                    username = admission_no

                    user = User.objects.create(
                        username=username,
                        first_name=first_name,
                        last_name=last_name,
                        email=f"{username.lower()}@student.school",
                        phone_number=random_phone_number(),
                        role=User.Role.STUDENT,
                    )
                    user.set_password("password123")
                    user.save()

                    profile = StudentProfile.objects.create(
                        user=user,
                        admission_no=admission_no,
                        gender=StudentProfile.Gender.MALE if is_male else StudentProfile.Gender.FEMALE,
                        date_of_birth=random_dob(grade_name),
                        curriculum_type=CurriculumType.LEGACY_844,
                        date_admitted=random_admitted_date(),
                        is_active=True,
                    )

                    Enrollment.objects.create(
                        student=profile,
                        classroom=classroom,
                        academic_year=current_year,
                        status=Enrollment.Status.ACTIVE,
                    )

                    created_here += 1
                    total_created += 1
                    self.stdout.write(f"  + {admission_no}  {first_name} {last_name}  -> {classroom}")

            self.stdout.write(self.style.SUCCESS(
                f"{classroom}: added {created_here} student(s) "
                f"(had {existing_active}, target {target_count}, now {existing_active + created_here})."
            ))

        self.stdout.write(self.style.SUCCESS(
            f"\nDone. {total_created} student(s) created across {len(target_classes)} classroom(s)."
        ))
        self.stdout.write("Default password for all new logins: password123")