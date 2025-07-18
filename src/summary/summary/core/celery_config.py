"""Celery Config."""

# https://github.com/danihodovic/celery-exporter
# Enable task events for Prometheus monitoring via celery-exporter.

# worker_send_task_events: Sends task lifecycle events (e.g., started, succeeded),
# allowing the exporter to track task execution metrics and durations.
worker_send_task_events = True

# task_send_sent_event: Sends an event when a task is dispatched to the broker,
# enabling full lifecycle tracking from submission to completion (including queue time).
task_send_sent_event = True
