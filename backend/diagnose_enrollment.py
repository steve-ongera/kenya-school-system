from api import models

print("=== Academic Years ===")
for ay in models.AcademicYear.objects.all().order_by("-year"):
    print(f"id={ay.id} year={ay.year} is_current={ay.is_current}")

print("\n=== Most recently created students ===")
for sp in models.StudentProfile.objects.order_by("-id")[:10]:
    print(f"\n{sp.admission_no} - {sp.user.get_full_name()} (id={sp.id})")
    enrollments = sp.enrollments.select_related("classroom__academic_year", "academic_year")
    if not enrollments.exists():
        print("  !! NO ENROLLMENT ROWS AT ALL")
    for e in enrollments:
        print(
            f"  Enrollment id={e.id} status={e.status} "
            f"classroom={e.classroom} "
            f"classroom.academic_year={e.classroom.academic_year} "
            f"(is_current={e.classroom.academic_year.is_current}) "
            f"enrollment.academic_year={e.academic_year} "
            f"(is_current={e.academic_year.is_current})"
        )
    print(f"  current_enrollment property -> {sp.current_enrollment}")