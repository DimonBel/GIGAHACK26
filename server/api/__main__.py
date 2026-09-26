"""python -m api [--host 127.0.0.1] [--port 8000]: the HTTP API for the web app."""
import argparse

import uvicorn

from .app import create_app


def main():
    p = argparse.ArgumentParser(prog="python -m api", description="HTTP API for the Minutes of Meeting web app")
    p.add_argument("--host", default="127.0.0.1", help="127.0.0.1 = this computer only (default)")
    p.add_argument("--port", type=int, default=8000)
    args = p.parse_args()
    uvicorn.run(create_app(), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
