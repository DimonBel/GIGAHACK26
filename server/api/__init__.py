"""HTTP API for the web app: sign-in, meetings (upload -> transcript -> minutes) and editable minutes.

The top layer beside `mom.cli`: it calls the `mom` pipeline as code and keeps meetings in `storage/`.
Run it with `python -m api`.
"""
