"""python -m server: the Secure MOM backend with uvicorn on 127.0.0.1:8000 (see server/config.py); on another
address only over HTTPS."""
import logging
import os

import uvicorn

from .app import create_app
from .config import is_local_host, listen_problem, load_config

PRIVATE_UMASK = 0o077
log = logging.getLogger("server")


def main():
    os.umask(PRIVATE_UMASK)  # everything the server writes (database, audio, temp files) is private to this user
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config()
    problem = listen_problem(config)
    if problem:
        raise SystemExit(problem)
    if not is_local_host(config.host):
        log.warning("Listening on %s: the app is reachable from other machines", config.host)
    tls = {"ssl_certfile": config.tls_cert, "ssl_keyfile": config.tls_key} if config.tls_cert else {}
    # uvicorn trusts X-Forwarded-For/-Proto from 127.0.0.1, where every local client connects from: any of them
    # could claim another address (login lockout, audit log) or https.
    uvicorn.run(create_app(config), host=config.host, port=config.port, server_header=False, proxy_headers=False,
                **tls)


if __name__ == "__main__":
    main()
