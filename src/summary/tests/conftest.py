"""Shared test fixtures and environment setup for the summary service tests."""

import os

# Activate TestSettings (safe defaults for all required env vars)
# before any summary module is imported.
os.environ["SUMMARY_ENV"] = "test"
