import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from django.utils import timezone

logger = logging.getLogger(__name__)

_scheduler = None


# ---------------------------------------------------------------------------
# TESTING HELPER — pulls Term 1's start_date to today if it's still in the
# future, so invoice generation doesn't wait for the real calendar date.
# Remove this call once you're done testing against 2027.
# ---------------------------------------------------------------------------
def _align_current_term_for_testing():
    from api import models

    current_year = models.AcademicYear.objects.filter(is_current=True).first()
    if not current_year:
        return

    today = timezone.now().date()
    term = (
        models.Term.objects.filter(academic_year=current_year)
        .order_by("term_number")
        .first()
    )
    if term and term.start_date > today:
        logger.warning(
            "TESTING: pulling %s start_date from %s to %s so invoicing can run.",
            term, term.start_date, today,
        )
        term.start_date = today
        term.save(update_fields=["start_date"])


# ---------------------------------------------------------------------------
# Fee invoice generation
# ---------------------------------------------------------------------------
def _run_generate_invoices_job():
    from .services import run_daily_invoice_generation  # adjust import path to your app

    try:
        _align_current_term_for_testing()  # <-- added

        summary = run_daily_invoice_generation()

        if not summary.get("results"):
            logger.info(
                "Invoice generation: %s",
                summary.get("detail", "nothing to do."),
            )
            return

        for term_result in summary["results"]:
            logger.info(
                "Invoice generation - %s: %d created, %d already existed.",
                term_result["term"],
                term_result["invoices_created"],
                term_result["invoices_already_existed"],
            )
            for grade, count in term_result["missing_fee_structures"].items():
                logger.warning(
                    "No fee structure for %s (%d student(s) affected) - "
                    "flagged for ICT/Finance.",
                    grade,
                    count,
                )
    except Exception:
        logger.exception("Scheduled invoice generation failed.")


def start():
    global _scheduler

    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler(daemon=True)

    _scheduler.add_job(
        _run_generate_invoices_job,
        trigger=IntervalTrigger(minutes=1),
        id="generate_invoices",
        replace_existing=True,
    )

    _scheduler.start()

    _run_generate_invoices_job()

    logger.info("Background scheduler started (invoice generation: every 1 min).")