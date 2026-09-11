"""
Django settings for the Kenya High School Management System.
Split cleanly enough to move to django-environ / separate prod settings later.
"""
import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load variables from .env into os.environ. Without this, every
# os.environ.get(...) below silently falls back to its default value
# (often "") even when .env has the real value set - this was almost
# certainly why EMAIL_HOST_USER/EMAIL_HOST_PASSWORD were empty and the
# OTP email was failing.
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-secret-key-change-me-in-production")

# Hardcoded per your request - .env's DJANGO_DEBUG is now ignored.
# Remember: with DEBUG=False, Django will refuse to serve requests at all
# unless ALLOWED_HOSTS is set correctly, and error tracebacks no longer
# appear in the HTTP response - check the server console/log for them.
DEBUG = False

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",
    # local
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

# ---------------------------------------------------------------------------
# DATABASE - Postgres in production, sqlite for quick local dev
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_USER_MODEL = "api.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 6}},
    # {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    # {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# SECURITY (login lockout / OTP / password reset tunables)
# ---------------------------------------------------------------------------
ACCOUNT_LOCKOUT_MAX_ATTEMPTS = 3
ACCOUNT_LOCKOUT_DURATION_MINUTES = 30
OTP_EXPIRY_MINUTES = 5
PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 30

# ---------------------------------------------------------------------------
# DRF / JWT / RBAC
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",          # per-IP attempts against /auth/login/
        "otp_verify": "8/min",      # per-IP attempts against /auth/verify-otp/
        "forgot_password": "3/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ---------------------------------------------------------------------------
# CORS - React (Vite) dev server
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5174,http://127.0.0.1:5174"
).split(",")
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# FRONTEND
# ---------------------------------------------------------------------------
# Used to build the reset-password link (student forgot-password flow) and
# the QR-code verification link printed on fee receipts.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5174")

# ---------------------------------------------------------------------------
# FEES / M-PESA (Safaricom Daraja STK Push)
# ---------------------------------------------------------------------------
# NOTE: services.initiate_payment()'s DEBUG-bypass (instant payment
# completion, no Safaricom call) no longer applies now that DEBUG is
# hardcoded to False - every payment will now attempt a real STK push.
# Make sure these are filled in with real (sandbox or production)
# credentials before testing payments.
#   - sandbox testing: https://sandbox.safaricom.co.ke
#   - production:      https://api.safaricom.co.ke
MPESA_BASE_URL = os.environ.get("MPESA_BASE_URL", "https://sandbox.safaricom.co.ke")
MPESA_CONSUMER_KEY = os.environ.get("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.environ.get("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE = os.environ.get("MPESA_SHORTCODE", "174379")
MPESA_PASSKEY = os.environ.get("MPESA_PASSKEY", "")
MPESA_CALLBACK_URL = os.environ.get(
    "MPESA_CALLBACK_URL", "https://yourschool.example.com/api/v1/payments/mpesa-callback/"
)

# ---------------------------------------------------------------------------
# EMAIL (OTP codes for Admin/Teacher/Finance 2FA, student password reset
# links, and admin security notifications)
# ---------------------------------------------------------------------------
# NOTE: since DEBUG is hardcoded to False above, this ALWAYS uses the real
# SMTP backend now - the console fallback below is effectively dead code
# unless you change DEBUG back to a variable. Kept for clarity/future use.
if DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True") == "True"
EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "False") == "True"
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@school.example.com")

# Keep this the school's real support address - students/staff may reply
# to a reset or OTP email asking for help.
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Fail loudly and early, in the console, if email creds are missing while
# running in production mode - better to see this at startup than to
# discover it via a 500 on someone's login attempt.
if not DEBUG and not (EMAIL_HOST_USER and EMAIL_HOST_PASSWORD):
    import warnings
    warnings.warn(
        "EMAIL_HOST_USER / EMAIL_HOST_PASSWORD are not set. OTP emails, "
        "password reset emails, and admin security notifications will fail. "
        "Check that your .env file exists and is being loaded correctly."
    )