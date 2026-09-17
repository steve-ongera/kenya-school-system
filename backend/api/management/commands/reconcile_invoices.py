from django.core.management.base import BaseCommand
from api import models, services


class Command(BaseCommand):
    help = "Recomputes brought_forward/amount_due for every student's invoice chain, fixing stale arrears left by out-of-order payments."

    def handle(self, *args, **options):
        total_fixed = 0
        students_affected = 0
        for student in models.StudentProfile.objects.all():
            changed = services.recalculate_student_invoice_chain(student)
            if changed:
                students_affected += 1
                total_fixed += len(changed)
                self.stdout.write(f"  Fixed {student.admission_no}: {len(changed)} invoice(s)")
        self.stdout.write(self.style.SUCCESS(
            f"Done. {total_fixed} invoice(s) corrected across {students_affected} student(s)."
        ))