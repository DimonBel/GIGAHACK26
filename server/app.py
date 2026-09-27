"""The FastAPI app: the API under /api, security middleware, and the React build (web/dist) with SPA fallback."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Config, load_config, prepare_dirs
from .db import connect
from .jobs import JobRunner, Pipeline, SttPipeline
from .mail import Mailer
from .routes import audit, auth, directory, lists, meetings, settings, templates, users
from .security import MAX_JSON_BYTES, BodyLimit, LoginLimiter, SecurityHeaders

API_PREFIX = "/api"


def create_app(config: Config | None = None, pipeline: Pipeline | None = None, mailer: Mailer | None = None) -> FastAPI:
    """The app; the real speech pipeline and mail delivery unless others are passed (tests pass fakes)."""
    config = config or load_config()
    prepare_dirs(config)
    db = connect(config.db_path)
    jobs = JobRunner(db, config, pipeline or SttPipeline(config.temp_dir))

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        jobs.start()
        yield
        jobs.stop()

    # No /docs: Swagger UI loads its files from a CDN. The API is documented in docs/api.md.
    app = FastAPI(title="Secure MOM", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.config, app.state.db, app.state.jobs = config, db, jobs
    app.state.mailer = mailer or Mailer(config)
    app.state.limiter = LoginLimiter()
    app.add_exception_handler(RequestValidationError, _invalid_input)
    for module in (auth, users, directory, lists, settings, templates, meetings, audit):
        app.include_router(module.router, prefix=API_PREFIX)
    if (config.web_dist / "index.html").is_file():
        _serve_web(app, config.web_dist)
    app.add_middleware(BodyLimit, max_bytes=MAX_JSON_BYTES, exempt=("POST", meetings.UPLOAD_PATH))
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(config.allowed_hosts))
    app.add_middleware(SecurityHeaders, behind_tls=config.cookie_secure)
    return app


async def _invalid_input(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """400 {"detail": "field: problem"} for invalid input, where FastAPI would answer 422 with a list."""
    error = exc.errors()[0]
    if error["type"] == "json_invalid":
        return JSONResponse({"detail": "The request body is not valid JSON"}, status_code=400)
    field = ".".join(str(part) for part in error["loc"] if part not in ("body", "query", "path"))
    message = error["msg"].removeprefix("Value error, ")
    return JSONResponse({"detail": f"{field}: {message}" if field else message}, status_code=400)


def _serve_web(app: FastAPI, dist: Path):
    """The React build: its files, and index.html for every other path outside /api (client-side routes)."""
    dist = dist.resolve()
    index = dist / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def web(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not Found")
        file = (dist / path).resolve()
        if path and file.is_relative_to(dist) and file.is_file():
            return FileResponse(file)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
