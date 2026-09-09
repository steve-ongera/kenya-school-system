import os
from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'
    
    def ready(self):
        # runserver's autoreloader spawns a child process to watch for
        # file changes, and Django calls ready() in BOTH the parent and
        # the child - without this guard you'd get two BackgroundSchedulers
        # running the same jobs. RUN_MAIN is only set in the child process
        # (the one that actually serves requests), so this keeps it to a
        # single scheduler.
        if os.environ.get("RUN_MAIN"):
            from . import scheduler
            scheduler.start()
