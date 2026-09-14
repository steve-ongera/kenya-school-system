from django.core.management.base import BaseCommand
from django.utils import timezone
from api import models


class Command(BaseCommand):
    help = "Suspend licenses past their valid_until date."

    def handle(self, *args, **options):
        expired = models.License.objects.filter(
            valid_until__lt=timezone.now(), is_suspended=False
        )
        for lic in expired:
            lic.is_suspended = True
            lic.save()
            models.LicenseAuditLog.objects.create(
                school=lic.school, action=models.LicenseAuditLog.Action.EXPIRED,
                detail="Auto-suspended by daily license check.",
            )
        self.stdout.write(f"Suspended {expired.count()} expired license(s).")