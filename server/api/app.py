"""The FastAPI application: `create_app()` wires the store, the job runner and the routes."""
from fastapi import APIRouter, FastAPI

from .db import Store
from .jobs import JobRunner
from .mailer import Mailer
from .routes import auth, codes, meetings, minutes, users
from .settings import Settings


def create_app(settings: Settings = None, pipeline=None, smtp=None) -> FastAPI:
    """smtp: an smtplib.SMTP stand-in for tests (default: the real one, to the local relay)."""
    settings = settings or Settings()
    store = Store(settings.db_path)
    store.migrate()
    store.seed_users(settings.seed_password)
    if pipeline is None:
        from .pipeline import MomPipeline
        pipeline = MomPipeline()
    runner = JobRunner(store, settings, pipeline)
    runner.recover()
    # Refuses to start with a non-local SMTP_HOST (mailer.check_local): no minutes via external mail servers.
    mailer = Mailer(store, settings, **({"smtp": smtp, "retry_delay": 0} if smtp else {}))
    mailer.recover()

    app = FastAPI(title="MoM API", version="0.1.0")
    app.state.settings, app.state.store, app.state.runner, app.state.mailer = settings, store, runner, mailer
    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["health"])
    def health():
        return {"ok": True}

    for module in (auth, users, codes, meetings, minutes):
        api.include_router(module.router)
    app.include_router(api)
    return app
