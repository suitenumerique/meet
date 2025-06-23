#!/usr/bin/env python
"""
meet's sandbox management script.
"""

import sys
from os import environ

if __name__ == "__main__":
    environ.setdefault("DJANGO_SETTINGS_MODULE", "meet.settings")
    environ.setdefault("DJANGO_CONFIGURATION", "Development")

    from configurations.management import execute_from_command_line

    execute_from_command_line(sys.argv)
