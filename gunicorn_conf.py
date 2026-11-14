import os

bind = f"0.0.0.0:{os.getenv('PORT', '8080')}"
workers = 1
threads = 8
timeout = 60
accesslog = "-"
errorlog = "-"
loglevel = "info"


def post_worker_init(worker):
    # Start the background checker after Gunicorn forks its single worker.
    import app
    app.start_scheduler()
