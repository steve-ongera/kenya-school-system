import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler = None


# ---------------------------------------------------------------------------
# Fee invoice generation
# ---------------------------------------------------------------------------
def _run_generate_invoices_job():
    from .services import run_daily_invoice_generation  # adjust import path to your app

    try:
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

    # ---------------------------------------------------------
    # Fee invoice generation/backfill — every 24 hours
    # ---------------------------------------------------------
    _scheduler.add_job(
        _run_generate_invoices_job,
        trigger=IntervalTrigger(hours=24),
        id="generate_invoices",
        replace_existing=True,
    )

    _scheduler.start()

    # ---------------------------------------------------------
    # Run immediately on startup
    # ---------------------------------------------------------
    # Covers a student admitted (or a fee structure fixed) while the
    # server/scheduler was offline, without waiting for the next 24h tick.
    _run_generate_invoices_job()

    logger.info("Background scheduler started (invoice generation: 24h).")