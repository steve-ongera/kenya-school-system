from django.core.management.base import BaseCommand

# adjust this import to match your actual app name, e.g.:
from api import services
from . import services  # <-- CHANGE THIS to "from <your_app> import services"


class Command(BaseCommand):
    help = (
        "Generates/backfills school fee invoices for every active student, "
        "in the current academic year, for every term that has already "
        "started. Idempotent - safe to run every day; never creates a "
        "duplicate invoice for the same student+term."
    )

    def handle(self, *args, **options):
        summary = services.run_daily_invoice_generation()

        if not summary.get("results"):
            self.stdout.write(self.style.WARNING(summary.get("detail", "Nothing to do.")))
            return

        self.stdout.write(self.style.SUCCESS(
            f"Academic year {summary['academic_year']}: "
            f"processed {summary['terms_processed']} term(s)."
        ))

        for term_result in summary["results"]:
            self.stdout.write(
                f"  {term_result['term']}: "
                f"{term_result['invoices_created']} created, "
                f"{term_result['invoices_already_existed']} already existed."
            )
            for grade, count in term_result["missing_fee_structures"].items():
                self.stdout.write(self.style.ERROR(
                    f"    \u26a0 No fee structure for {grade} "
                    f"({count} student(s) affected) - flagged for ICT/Finance."
                ))