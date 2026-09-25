"""
Seed Junda High School Shanzu with REAL data only: base config (school, admin,
subjects, license, packages, expense categories, grading scale, exam
types, streams) + the CURRENT 2026 academic year/terms + the CURRENT
Form 3 / Form 4 classrooms + the real Term 3 2026 fee structure
(Form 3 = 12,500, Form 4 = 15,000) + the real 192-student roster with
their real Term 3 2026 invoice AND their real payments, transcribed
from the school's 22/09/2026 fee-balance report.

MONEY MODEL (one definition, used everywhere in the system):
  - Each student has exactly ONE invoice (2026 Term 3).
  - invoice.brought_forward = the report's "Bal Term 2" (negative = credit).
  - invoice.amount_due      = brought_forward + Term 3 fee.
  - Each student's "Pay" figure becomes ONE real Payment row (M-Pesa,
    dated 22/09/2026, reference SEED-<admission_no>, its own receipt no).
  - invoice.amount_paid is ALWAYS re-derived as the SUM of that
    invoice's Payment rows, so seeded payments, receipts, revenue
    reports and balances can never disagree - and re-running this seeder
    never wipes payments Finance recorded after seeding.
  - Student balance = opening (earliest invoice's brought_forward)
                      + term charges - payments
    (see services.get_ledger_totals_bulk).

*** KNOWN DATA ISSUE - PLEASE VERIFY AGAINST THE PHYSICAL REGISTER ***
Admission No. 2742 was printed on the source sheets for TWO different
students in TWO different classes: Nancy Mukami (Form 4 Blue) and
Gerald Mganga (Form 3 Red). Nancy stays on 2742; Gerald has the
placeholder "2742-TEMP" - correct it once you've checked the register,
then re-run (idempotent).

Also flagged, not blocking:
  - 4 students had no admission number on the sheet: Kelvin Keyune,
    Cindy Harmony, Risper Kadzo, Yasir Rama - each gets an
    auto-generated number (prefix "24" Form 3, "23" Form 4).
  - Cindy Harmony's Term 3 fee is 7,000 (mid-term joiner) - kept as a
    per-student override.
  - date_admitted is a placeholder per grade (2024-01-15 / 2023-01-16).
  - Each student has ONE payment for their total "Pay" figure; real
    M-Pesa codes/dates aren't in the report. Replace them later with
    the M-Pesa statement if you need exact dates.

Usage:
    python manage.py seed_data_term3_2026

Idempotent - safe to re-run.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from api import services
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
    Payment,
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

# Date of the fee-balance report - seeded payments are stamped with it.
REPORT_DATE = date(2026, 9, 22)

# ---------------------------------------------------------------------------
# 1. School identity
# ---------------------------------------------------------------------------
SCHOOL = {
    "name": "Junda High School Shanzu",
    "school_type": School.SchoolType.MIXED,
    "knec_code": "",   # TODO: real KNEC centre code
    "county": "Mombasa",
    "address": "",     # TODO: real postal address
}

ADMINS = [
    ("admin1", "Admin", "One", True),
]

STREAMS = ["Blue", "Red"]

FORMS = [
    {"name": "Form 1", "order": 101},
    {"name": "Form 2", "order": 102},
    {"name": "Form 3", "order": 103},
    {"name": "Form 4", "order": 104},
]

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
    "min_optional_subjects": 4,
    "max_optional_subjects": 5,
}

EXAM_TYPES = [
    ("Midterm Exam", Decimal("0.30"), 1, True, True),
    ("End-term Exam", Decimal("0.70"), 2, False, True),
]

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

# ONLY the current year.
CALENDAR_2026 = [
    (2026, 1, date(2026, 1, 5), date(2026, 4, 3), False),
    (2026, 2, date(2026, 4, 27), date(2026, 7, 31), False),
    (2026, 3, date(2026, 8, 24), date(2026, 11, 27), True),
]

# ONLY the classes that exist right now: (grade, placeholder date_admitted, admission-no prefix)
CURRENT_CLASSES = [
    ("Form 3", date(2024, 1, 15), "24"),
    ("Form 4", date(2023, 1, 16), "23"),
]

# ONLY the real Term 3 2026 fee.
TERM3_2026_FEE = {
    "Form 3": [("Tuition", Decimal("12500"))],
    "Form 4": [("Tuition", Decimal("15000"))],
}

# ---------------------------------------------------------------------------
# REAL students, from the 22/09/2026 Term 3 fee-balance report.
# Row: (admission_no_or_None, name, gender, bal_term2, pay, term3_fee_override_or_None)
# ---------------------------------------------------------------------------
FORM_FOUR_RED = [
    ("2299", "Abdhalla A. Kome", "M", -8500, 0, None),
    ("2371", "Albina Chughu", "F", 9000, 1000, None),
    ("2357", "Amani Douglas", "M", 3000, 8000, None),
    ("2376", "Doroth Mumbe Ki", "F", 19100, 13000, None),
    ("2462", "Esther Mbuche Di", "F", 31500, 0, None),
    ("2458", "Francis Mwalimu", "M", 0, 5000, None),
    ("2444", "Joseph Maitha Ric", "M", 2500, 0, None),
    ("2386", "Mercy Nafungo W", "F", 21300, 3000, None),
    ("2303", "Meshack Kiprono", "M", 10900, 4000, None),
    ("2365", "Monica Dzame", "F", 9000, 3000, None),
    ("2438", "Mwanapili Garam", "F", 39500, 0, None),
    ("2331", "Nicholus Mweni N", "M", 5000, 20000, None),
    ("2301", "Omar Kwale Deng", "M", 0, 10000, None),
    ("2375", "Ramadhan Mwiny", "M", 39500, 0, None),
    ("2349", "Ramadhan Mkare", "M", 42500, 0, None),
    ("2469", "Riziki Sidi Kahindi", "F", 0, 5000, None),
    ("2358", "Saumu Omar Lewa", "F", 3000, 8000, None),
    ("2300", "Twaha Rashid Tw", "M", 10000, 0, None),
    ("2306", "Emmanuel Kisagh", "M", 45200, 0, None),
    ("2572", "Zuhura Hadija Ra", "F", 0, 0, None),
    ("2664", "Dalan Rukih Odhi", "M", 1000, 2000, None),
    ("2661", "Zaitun Bwanaind", "F", 4100, 5000, None),
    ("2656", "Jayden Guchu Mb", "M", 2000, 7000, None),
    ("2692", "Pius Mganga", "M", 1500, 7000, None),
    ("2703", "Caleb Wambua Ky", "M", 0, 15000, None),
    ("2714", "Athumani Mwame", "M", 33000, 0, None),
    ("2345", "Enock Ongoro On", "M", 2000, 3000, None),
    ("2737", "Glady's Mwikali", "F", 2500, 7500, None),
    ("2332", "Florence Julius O", "F", 29400, 0, None),
    ("2744", "Omar Fondo", "M", 22000, 0, None),
    ("2745", "Abdilatif Abdi", "M", 3000, 8000, None),
    ("2747", "Stefan Kelly", "M", 0, 5000, None),
    ("2758", "Bidii Ngumbao", "M", 26000, 0, None),
    ("2762", "Moses Maitha", "M", 28500, 0, None),
    ("2771", "Mwachiti Nyale", "M", 24000, 0, None),
    ("2774", "Sophia Kamanza", "F", 25700, 5000, None),
    ("2780", "Queen Marion", "F", 10000, 7000, None),
    ("2451", "Khadija Mdzomba", "F", 48800, 3000, None),
    (None, "Kelvin Keyune", "M", 4000, 2000, None),
    (None, "Cindy Harmony", "F", 0, 7000, 7000),
]

FORM_FOUR_BLUE = [
    ("2305", "Abell Mwakio Kome", "M", 38200, 0, None),
    ("2417", "Adam Gona Mwaro", "M", 2000, 5000, None),
    ("2404", "Anderson David", "M", 23600, 3000, None),
    ("2433", "Araphat Yaa Mohamed", "M", 21500, 0, None),
    ("2424", "Beatrice Dama Hamisi", "F", 29750, 3900, None),
    ("2415", "Charo Amos Kaingu", "M", 8500, 0, None),
    ("2687", "Dhevent Mwakiti", "M", 27000, 0, None),
    ("2706", "Duncan Kibet", "M", 14000, 2000, None),
    ("2601", "Dwayne Kiwara", "M", 0, 6000, None),
    ("2689", "Elisha Tsuma Nye", "M", 40500, 0, None),
    ("2409", "Esther Chizi Tsum", "F", 10500, 6000, None),
    ("2694", "Ismail Ndoro Ram", "M", 6000, 4000, None),
    ("2403", "Jimmyson Khamisi", "M", 20000, 4500, None),
    ("2385", "Lucy Nafula Wan", "F", 16800, 3000, None),
    ("2431", "Mohammed Bakar", "M", 0, 6800, None),
    ("2391", "Mtua Dominic Kya", "M", 26500, 10000, None),
    ("2308", "Nicholas Jonyo", "M", 14000, 4500, None),
    ("2699", "Riziki Juma", "M", -4000, 11000, None),
    ("2448", "Salome Kazungu", "F", 46000, 0, None),
    ("2592", "Saul Dala Nziga", "M", 36000, 0, None),
    ("2700", "Sharon Wandia M", "F", 14000, 4000, None),
    ("2486", "Sharrif Kaingu Ka", "M", 11500, 0, None),
    ("2696", "Tellick Washe Ga", "M", 20000, 8000, None),
    ("2702", "Victor Barasa We", "M", 0, 0, None),
    ("2439", "Yasmin Medza Gon", "F", 2600, 5000, None),
    ("2726", "Allan Shikoli Min", "M", 2200, 9000, None),
    ("2731", "Rose Chausiku", "F", 2000, 5000, None),
    ("2735", "Paul Dosho", "M", 32500, 0, None),
    ("2740", "Pilly Anthony", "F", 0, 15000, None),
    ("2742", "Nancy Mukami", "F", 0, 5000, None),
    ("2757", "Dorcas Jumwa", "F", 3000, 7000, None),
    ("2759", "Suleiman Pole", "M", 11500, 3000, None),
    ("2765", "Ruth Pendo", "F", 25600, 2000, None),
    ("2767", "Jesica Rongoma", "F", 2500, 2500, None),
    ("2773", "Faridah Mbeyu", "F", 7500, 9000, None),
    ("2779", "Benard Mwatela", "M", 26000, 0, None),
    ("2587", "Omumali Khamis", "M", 0, 10000, None),
    ("2781", "Martha Nafula", "F", 14100, 9000, None),
    ("2785", "Faith Mluo Benar", "F", 16700, 3700, None),
    ("2483", "Adam Charo Kitsa", "M", 74100, 0, None),
    ("2791", "Rashid Salim", "M", 2000, 0, None),
]

FORM_THREE_RED = [
    ("2517", "Abubakar Khamisi N", "M", 0, 1000, None),
    ("2506", "Ali Hemed Ali", "M", 16000, 0, None),
    ("2495", "Caleb Njuguna Wan", "M", 9000, 0, None),
    ("2538", "Charles Husein Kar", "M", 38555, 0, None),
    ("2693", "Chengo Garama Baf", "M", -5000, 7500, None),
    ("2679", "Elisha Mohammed N", "M", 3350, 6800, None),
    ("2401", "Emmanuel Mwambu", "M", 34400, 0, None),
    ("2540", "Fednand Maitha Mr", "M", 5500, 4000, None),
    ("2574", "Harryet Kadzo Ken", "F", 30100, 0, None),
    ("2552", "Isaac Dzuya Katana", "M", 29500, 0, None),
    ("2709", "Ismail Utanje Jamvi", "M", 17000, 0, None),
    ("2490", "Jesse Mwangi Kimot", "M", 8950, 2000, None),
    ("2685", "Johnson Kalama", "M", 50700, 0, None),
    ("2567", "Kamanza Ngalaa Le", "M", 26500, 0, None),
    ("2512", "Khadija Chizi Said", "F", 0, 12000, None),
    ("2581", "Khamisi Kalume", "M", 19500, 0, None),
    ("2570", "Kibibi Wanje Nyale", "F", 19000, 0, None),
    ("2715", "Luqman Mohammed", "M", 0, 4500, None),
    ("2516", "Mariam Athman Haj", "F", 37500, 0, None),
    ("2576", "Matano Shedrack L", "M", 23500, 0, None),
    ("2631", "Michael Runya Mwa", "M", 15000, 0, None),
    ("2556", "Mwanyika Daudi Mt", "M", 22800, 2000, None),
    ("2535", "Philip Mwangangi M", "M", 5500, 2400, None),
    ("2707", "Prosper Malakai", "M", 30500, 0, None),
    ("2612", "Samson Kithi Kenga", "M", 28500, 0, None),
    ("2672", "Sharon Tenga Mwai", "F", 500, 5000, None),
    ("2686", "Silas William", "M", 24500, 0, None),
    ("2621", "Slyvia Kavata Fred", "F", 39500, 0, None),
    ("2586", "Sophia Mnyazi Kalu", "F", 7000, 7000, None),
    ("2720", "Muramba Bakari Mu", "M", 0, 3000, None),
    ("2721", "Sheban Swalehe", "M", 3000, 0, None),
    ("2728", "Nelson Shiundu", "M", 12500, 0, None),
    ("2741", "Rashid Mwawiri", "M", 33500, 0, None),
    ("2348", "Abdulhakim Kahind", "M", 6000, 0, None),
    (None, "Risper Kadzo", "F", 8500, 0, None),
    # KNOWN CLASH with 2742 (Nancy Mukami, Form 4 Blue). Replace
    # "2742-TEMP" with Gerald's real number once checked, then re-run.
    ("2742-TEMP", "Gerald Mganga", "M", 0, 3500, None),
    ("2748", "Ahmed Dolal Nurie", "M", 0, 0, None),
    ("2752", "Delvine Beja", "F", 10000, 0, None),
    (None, "Yasir Rama", "M", 29000, 0, None),
    ("2760", "Hamisi Mleka", "M", 25500, 0, None),
    ("2763", "Meshack Kemoli", "M", 16700, 0, None),
    ("2768", "Hussein Amir", "M", 7500, 10000, None),
    ("2770", "Sandlinos Were", "M", 16200, 500, None),
    ("2674", "Emmanuel Kitsao", "M", 24500, 4000, None),
    ("2775", "Sammir Jaffar", "M", 7000, 0, None),
    ("2777", "Ashline Kirongo", "F", 17000, 15000, None),
    ("2636", "Baraka Kithi Chang", "M", 30100, 0, None),
    ("2782", "Rashid Safari Kahin", "M", 21000, 0, None),
    ("2783", "Abdallah Kea", "M", 23000, 0, None),
    ("2787", "Lucy Katana", "F", 22500, 0, None),
    ("2788", "Tony Gitau Peter", "M", 2500, 4000, None),
    ("2790", "Leah Naomi", "F", 7200, 3000, None),
    ("2792", "Catrina Ogal", "F", 500, 0, None),
    ("2794", "Adam Athman Sheik", "M", 2000, 7000, None),
    ("2796", "Chengo William", "M", 0, 3500, None),
    ("2798", "Francis Mwajasi", "M", 0, 5000, None),
]

FORM_THREE_BLUE = [
    ("2695", "Sandra Odama Rachael", "F", 0, 10000, None),
    ("2697", "Abdulkadir Musa Ali", "M", 0, 5000, None),
    ("2523", "Alex Kazungu Katana", "M", 0, 4000, None),
    ("2670", "Amos Gona Paul", "M", 8000, 5000, None),
    ("2494", "Andrew Juma Nzovu", "M", 10500, 2500, None),
    ("2622", "Athman Sifa Khamisi", "M", 500, 5500, None),
    ("2501", "Ayub Mwang'ombe Athi", "M", 10400, 0, None),
    ("2691", "Barak Obama", "M", 15000, 15000, None),
    ("2525", "Binti-Ali Zeinab Mgaza", "F", 7800, 5000, None),
    ("2599", "Brian Kazungu Katana", "M", 25500, 0, None),
    ("2711", "Christopher Ghert", "M", 7500, 0, None),
    ("2629", "Christopher Okwinami", "M", 45000, 0, None),
    ("2673", "Cornelius Kioko", "M", 19000, 5000, None),
    ("2623", "Denroy Karisa Mwero", "M", 41200, 0, None),
    ("2682", "Ellis Mwavita Mwango", "M", 41000, 0, None),
    ("2713", "Enock Ombeki", "M", 30800, 0, None),
    ("2566", "Faridh Baraka", "M", 12000, 0, None),
    ("2493", "Haji Mpemba Salimu", "M", 2000, 4000, None),
    ("2518", "Hamisi Katana Rajab", "M", 16500, 0, None),
    ("2539", "Kimanzi Mutsisya", "M", 19200, 0, None),
    ("2653", "Lina Zawadi", "F", 8500, 3000, None),
    ("2499", "Muthoki Faith Mwonge", "F", 12500, 0, None),
    ("2701", "Mwanajuma Adam", "F", 3000, 8000, None),
    ("2600", "Peter Nyawa Kachonjo", "M", 15500, 4000, None),
    ("2489", "Regina Wairimu Kimoth", "F", 11950, 2000, None),
    ("2590", "Rooney Mainga Ojuka", "M", 36700, 0, None),
    ("2652", "Sidi Safari", "M", 22000, 5000, None),
    ("2534", "Umi Hassan", "F", 0, 12500, None),
    ("2727", "Ramadhan Hassan", "M", 17500, 0, None),
    ("2729", "Wilson Nyule Samini", "M", 34000, 0, None),
    ("2734", "Sarafina Sapur", "F", 29500, 0, None),
    ("2736", "Purity Neema Kazungu", "F", 10500, 9500, None),
    ("2738", "Sheban Amani", "M", 6500, 5000, None),
    ("2739", "Peter Nicholas", "M", 500, 5500, None),
    ("2749", "Douglas Zata Mwasi", "M", 29000, 0, None),
    ("2751", "Moses Fondo", "M", 18500, 2000, None),
    ("2750", "Shantel Asachi", "F", 22700, 0, None),
    ("2753", "Mustafa Matano", "M", 22500, 0, None),
    ("2754", "Mark Ryan", "M", 12500, 15000, None),
    ("2755", "Job Rheinard", "M", 23000, 0, None),
    ("2756", "Ibramovic Mkilo", "M", 13000, 0, None),
    ("2761", "Abdalla Mwajabuni", "M", 27500, 0, None),
    ("2766", "Max Charo", "M", 8700, 3000, None),
    ("2772", "Onesmus Ngome Katana", "M", 10000, 16000, None),
    ("2651", "Brian Joshua Mandala", "M", 9500, 0, None),
    ("2776", "Julius Charo", "M", 24000, 8000, None),
    ("2778", "Gibson Mwangata", "M", 8000, 4500, None),
    ("2559", "Omar Ngala", "M", 34500, 0, None),
    ("2594", "Leah Ali", "F", 20000, 0, None),
    ("2784", "Abdi Amwayi", "M", 18000, 0, None),
    ("2786", "Linah Katana", "F", 22500, 0, None),
    ("2789", "Antony Thoya Salim", "M", 4000, 2000, None),
    ("2793", "Moses Mae Wilfonce", "M", 7500, 0, None),
    ("2795", "Abdillahi Ali Khamisi", "M", 0, 3000, None),
    ("2797", "Mohammed Kea Ali", "M", 0, 4000, None),
]


def _split_name(full_name):
    parts = full_name.strip().split(None, 1)
    return (parts[0], parts[0]) if len(parts) == 1 else (parts[0], parts[1])


def _rows_for(entries, grade, stream):
    rows = []
    for adm, full_name, gender, bal_term2, pay, fee_override in entries:
        first, last = _split_name(full_name)
        rows.append({
            "first_name": first,
            "last_name": last,
            "gender": gender,
            "grade": grade,
            "stream": stream,
            "admission_no": adm,
            "bal_term2": Decimal(bal_term2),
            "pay": Decimal(pay),
            "fee_override": Decimal(fee_override) if fee_override is not None else None,
        })
    return rows


STUDENTS = (
    _rows_for(FORM_FOUR_RED, "Form 4", "Red")
    + _rows_for(FORM_FOUR_BLUE, "Form 4", "Blue")
    + _rows_for(FORM_THREE_RED, "Form 3", "Red")
    + _rows_for(FORM_THREE_BLUE, "Form 3", "Blue")
)


class Command(BaseCommand):
    help = "Seed Junda High School Shanzu's base setup + REAL 2026 Term 3 fee data, payments and roster."

    @transaction.atomic
    def handle(self, *args, **options):
        self.pw_hash = make_password(DEFAULT_PASSWORD)
        self.counts = {}

        self.stdout.write(self.style.MIGRATE_HEADING("Base setup"))
        school = self._seed_school()
        admins = self._seed_admins()
        self.admin = admins[0]
        self.streams = self._seed_streams()
        self.grades = self._seed_grade_levels()
        self._seed_subjects()
        self._seed_exam_types()
        self._seed_grading()
        self._seed_packages()
        self._seed_license(school, admins[0])
        self._seed_expense_categories()

        self.stdout.write(self.style.MIGRATE_HEADING("2026 calendar only"))
        self.terms = self._seed_calendar()

        self.stdout.write(self.style.MIGRATE_HEADING("2026 classrooms (Form 3 / Form 4 only)"))
        self.classrooms = self._seed_classrooms()

        self.stdout.write(self.style.MIGRATE_HEADING("Term 3 2026 fee structures"))
        self.fee_structures = self._seed_fee_structures()

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Admitting {len(STUDENTS)} student(s) + Term 3 2026 invoice + M-Pesa payment"
        ))
        seq_by_prefix = {}
        self.seeded_admission_nos = []
        for row in STUDENTS:
            self._process_student(row, seq_by_prefix)

        self._verify_money()
        self._print_summary()

    # ------------------------------------------------------------------
    def _bump(self, key, created):
        if created:
            self.counts[key] = self.counts.get(key, 0) + 1

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

    def _seed_subjects(self):
        subjects = {}
        for name, code, _group, compulsory, papers in SUBJECTS:
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

    def _seed_calendar(self):
        terms = {}
        for year_no, term_no, start, end, is_current in CALENDAR_2026:
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

        for year_no in {c[0] for c in CALENDAR_2026}:
            year_terms = [t for (y, _), t in terms.items() if y == year_no]
            AcademicYear.objects.filter(year=year_no).update(
                start_date=min(t.start_date for t in year_terms),
                end_date=max(t.end_date for t in year_terms),
            )
        return terms

    def _seed_classrooms(self):
        classrooms = {}
        year = AcademicYear.objects.get(year=2026)
        for grade_name, _admit_date, _prefix in CURRENT_CLASSES:
            grade = self.grades[grade_name]
            for stream_name in STREAMS:
                classroom, created = ClassRoom.objects.get_or_create(
                    grade_level=grade, stream=self.streams[stream_name], academic_year=year,
                )
                classrooms[(grade_name, stream_name)] = classroom
                self._bump("classrooms", created)
        return classrooms

    def _seed_fee_structures(self):
        structures = {}
        term3 = self.terms[(2026, 3)]
        for grade_name, items in TERM3_2026_FEE.items():
            total = sum((Decimal(str(amount)) for _, amount in items), Decimal("0"))
            structure, created = FeeStructure.objects.update_or_create(
                grade_level=self.grades[grade_name], term=term3, defaults={"total_amount": total},
            )
            structure.items.all().delete()
            FeeStructureItem.objects.bulk_create(
                FeeStructureItem(fee_structure=structure, name=name, amount=Decimal(str(amount)))
                for name, amount in items
            )
            structures[grade_name] = structure
            self._bump("fee structures", created)
        return structures

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
    # STUDENTS, INVOICES, PAYMENTS
    # ------------------------------------------------------------------
    def _next_admission_no(self, prefix, seq_by_prefix):
        seq_by_prefix[prefix] = seq_by_prefix.get(prefix, 0) + 1
        return f"{prefix}{seq_by_prefix[prefix]:03d}"

    def _process_student(self, row, seq_by_prefix):
        grade_name = row["grade"]
        stream_name = row["stream"]
        if stream_name not in STREAMS:
            raise CommandError(f"Unknown stream {stream_name!r}")

        admit_date, prefix = next((d, p) for g, d, p in CURRENT_CLASSES if g == grade_name)
        admission_no = (row.get("admission_no") or "").strip()
        if not admission_no:
            admission_no = self._next_admission_no(prefix, seq_by_prefix)
        self.seeded_admission_nos.append(admission_no)

        user, u_created = User.objects.get_or_create(
            username=admission_no,
            defaults=dict(
                role=User.Role.STUDENT, first_name=row["first_name"],
                last_name=row["last_name"], password=self.pw_hash,
            ),
        )
        self._bump("users:STUDENT", u_created)

        profile, p_created = StudentProfile.objects.update_or_create(
            user=user,
            defaults={
                "admission_no": admission_no,
                "gender": row["gender"],
                "curriculum_type": CurriculumType.LEGACY_844,
                "date_admitted": admit_date,
                "is_active": True,
            },
        )
        self._bump("student profiles", p_created)

        classroom = self.classrooms[(grade_name, stream_name)]
        enrollment, e_created = Enrollment.objects.update_or_create(
            student=profile, academic_year=classroom.academic_year,
            defaults={"classroom": classroom, "status": Enrollment.Status.ACTIVE},
        )
        self._bump("enrollments", e_created)

        structure = self.fee_structures[grade_name]
        term_fee = row["fee_override"] if row["fee_override"] is not None else structure.total_amount
        brought_forward = row["bal_term2"]
        amount_due = brought_forward + term_fee

        # amount_paid is deliberately NOT in defaults: it is always synced
        # from the Payment rows below, never overwritten from the report.
        invoice, i_created = Invoice.objects.update_or_create(
            enrollment=enrollment, fee_structure=structure,
            defaults={"brought_forward": brought_forward, "amount_due": amount_due},
        )
        self._bump("invoices", i_created)

        self._seed_payment(invoice, admission_no, row["pay"])

    def _seed_payment(self, invoice, admission_no, pay):
        """
        ONE M-Pesa payment row = the student's 'Pay' figure from the report.
        Then invoice.amount_paid is re-derived as the sum of ALL the
        invoice's payments (seeded + anything Finance recorded later).
        """
        reference = f"SEED-{admission_no}"
        paid_at = timezone.make_aware(datetime.combine(REPORT_DATE, time(12, 0)))
        existing = Payment.objects.filter(invoice=invoice, reference=reference).first()

        if pay <= 0:
            if existing:
                existing.delete()
        elif existing:
            existing.amount = pay
            existing.method = Payment.Method.MPESA
            existing.paid_at = paid_at
            existing.save(update_fields=["amount", "method", "paid_at"])
        else:
            Payment.objects.create(
                invoice=invoice, amount=pay, method=Payment.Method.MPESA,
                reference=reference, recorded_by=self.admin,
                receipt_no=services.generate_receipt_no(), paid_at=paid_at,
            )
            self._bump("payments", True)

        total_paid = invoice.payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        if invoice.amount_paid != total_paid:
            invoice.amount_paid = total_paid
            invoice.save(update_fields=["amount_paid"])

    # ------------------------------------------------------------------
    # VERIFICATION + SUMMARY
    # ------------------------------------------------------------------
    def _verify_money(self):
        """Fail loudly if Payment rows and invoices ever disagree, and print the totals every page should show."""
        invoices = Invoice.objects.filter(enrollment__student__admission_no__in=self.seeded_admission_nos)
        mismatches = 0
        for inv in invoices.prefetch_related("payments"):
            paid = sum((p.amount for p in inv.payments.all()), Decimal("0"))
            if paid != inv.amount_paid:
                mismatches += 1
        if mismatches:
            raise CommandError(f"{mismatches} invoice(s) have amount_paid != sum of their payments.")

        ids = list(StudentProfile.objects.filter(
            admission_no__in=self.seeded_admission_nos
        ).values_list("id", flat=True))
        ledger = services.get_ledger_totals_bulk(ids)
        self.total_billed = sum((t["opening"] + t["charged"] for t in ledger.values()), Decimal("0"))
        self.total_paid = sum((t["paid"] for t in ledger.values()), Decimal("0"))
        self.total_balance = sum((t["balance"] for t in ledger.values()), Decimal("0"))

    def _print_summary(self):
        self.stdout.write(self.style.SUCCESS("\nDone. Newly created rows:"))
        if not self.counts:
            self.stdout.write("  (nothing - everything already existed)")
        for key, n in sorted(self.counts.items()):
            self.stdout.write(f"  {key:<24} {n}")

        self.stdout.write(self.style.MIGRATE_HEADING("\nMoney check (must match every finance page)"))
        self.stdout.write(f"  Students seeded      {len(self.seeded_admission_nos)}")
        self.stdout.write(f"  Total billed         KES {self.total_billed:,.2f}")
        self.stdout.write(f"  Total paid           KES {self.total_paid:,.2f}")
        self.stdout.write(f"  Total outstanding    KES {self.total_balance:,.2f}")

        self.stdout.write(self.style.WARNING(
            "\nREMINDER: 'Gerald Mganga' is on placeholder admission no. "
            "'2742-TEMP' due to a clash with Nancy Mukami's real 2742 - fix "
            "once you check the register."
        ))
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nLogin (password for every seeded account): {DEFAULT_PASSWORD}"
        ))