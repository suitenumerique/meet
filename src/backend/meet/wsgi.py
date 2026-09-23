"""
WSGI config for the Meet project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.1/howto/deployment/wsgi/
"""

from os import environ

from configurations.wsgi import get_wsgi_application

environ.setdefault("DJANGO_SETTINGS_MODULE", "meet.settings")
environ.setdefault("DJANGO_CONFIGURATION", "Development")

application = get_wsgi_application()
