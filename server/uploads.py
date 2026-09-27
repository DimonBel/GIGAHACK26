"""Audio uploads: streamed straight into the private audio folder with a size limit, then checked with ffprobe.

No copy of the recording lands in the system temp folder, and an upload over the limit is cut off as it arrives."""
import json
import os
import secrets
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import HTTPException, Request
from python_multipart import MultipartParser
from python_multipart.exceptions import FormParserError
from python_multipart.multipart import parse_options_header
from starlette.requests import ClientDisconnect

from .db import PRIVATE_FILE

MB = 1024 * 1024
FORM_OVERHEAD = 64 * 1024  # multipart boundaries and the small text fields around the file
MAX_FIELD_BYTES = 4096
PROBE_TIMEOUT_S = 60
MAX_END_PACKETS = 100_000  # read after seeking to the end: bounds ffprobe's output when a file can't seek
PAST_THE_END_S = 99_999_999  # an ffprobe seek target later than any recording: it lands on the last packets
AUDIO_EXTENSIONS = {"wav", "mp3", "m4a", "mp4", "mov", "webm", "mkv", "ogg", "oga", "opus", "flac", "aac", "wma",
                    "amr", "3gp", "caf", "aiff", "avi", "mpg", "mpeg", "ts", "w64", "au"}
EXTENSION_FOR_TYPE = {"audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a",
                      "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
                      "audio/wave": "wav", "audio/flac": "flac", "audio/aac": "aac"}
# ffprobe's container names. Playlist and script formats (hls, concat, ...) are refused: they make ffmpeg open
# other files or URLs named inside the upload.
ALLOWED_FORMATS = {"wav", "mp3", "mov", "mp4", "m4a", "3gp", "matroska", "webm", "ogg", "flac", "aac", "caf", "aiff",
                   "asf", "amr", "avi", "mpeg", "mpegts", "w64", "au"}


@dataclass
class Upload:
    path: Path
    size: int
    fields: dict[str, str] = field(default_factory=dict)


class _Form:
    """python-multipart callbacks: the "file" part goes to disk as it arrives, text fields stay in memory."""

    def __init__(self, directory: Path, max_bytes: int):
        self.directory, self.max_bytes = directory, max_bytes
        self.fields: dict[str, str] = {}
        self.path: Path | None = None
        self.size = 0
        self.complete = False
        self._file = None
        self._headers: dict[bytes, bytes] = {}
        self._header_name = self._header_value = b""
        self._name = ""
        self._value = bytearray()

    def callbacks(self) -> dict:
        return {"on_part_begin": self._part_begin, "on_header_field": self._header_field,
                "on_header_value": self._header_value_data, "on_header_end": self._header_end,
                "on_headers_finished": self._headers_finished, "on_part_data": self._part_data,
                "on_part_end": self._part_end, "on_end": self._end}

    def _part_begin(self):
        self._headers, self._value = {}, bytearray()

    def _header_field(self, data: bytes, start: int, end: int):
        self._header_name += data[start:end]

    def _header_value_data(self, data: bytes, start: int, end: int):
        self._header_value += data[start:end]

    def _header_end(self):
        self._headers[self._header_name.lower()] = self._header_value
        self._header_name = self._header_value = b""

    def _headers_finished(self):
        _, options = parse_options_header(self._headers.get(b"content-disposition", b""))
        self._name = options.get(b"name", b"").decode("utf-8", "replace")
        filename = options.get(b"filename")
        if self._name != "file" or filename is None:
            return
        if self.path is not None:
            raise HTTPException(400, "Upload one file")
        extension = _extension(filename.decode("utf-8", "replace"),
                               self._headers.get(b"content-type", b"").decode("latin-1"))
        self.path = self.directory / f"{secrets.token_hex(16)}.{extension}"
        self._file = os.fdopen(os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, PRIVATE_FILE), "wb")

    def _part_data(self, data: bytes, start: int, end: int):
        if self._file is not None:
            self.size += end - start
            if self.size > self.max_bytes:
                raise HTTPException(413, f"The file is larger than {self.max_bytes // MB} MB")
            self._file.write(data[start:end])
        else:
            self._value += data[start:end]
            if len(self._value) > MAX_FIELD_BYTES:
                raise HTTPException(400, f"The form field {self._name!r} is too long")

    def _part_end(self):
        if self._file is not None:
            self._file.close()
            self._file = None
        elif self._name:
            self.fields[self._name] = self._value.decode("utf-8", "replace")

    def _end(self):
        self.complete = True

    def discard(self):
        if self._file is not None:
            self._file.close()
        if self.path is not None:
            self.path.unlink(missing_ok=True)


async def receive_audio(request: Request, directory: Path, max_bytes: int) -> Upload:
    """The multipart form's "file" saved as directory/<random>.<ext> (0600) plus its text fields.
    400 for a malformed form or no file, 413 over max_bytes or with more than FORM_OVERHEAD around the file."""
    content_type, options = parse_options_header(request.headers.get("content-type", ""))
    if content_type != b"multipart/form-data" or not options.get(b"boundary"):
        raise HTTPException(400, "Send the recording as multipart/form-data")
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > max_bytes + FORM_OVERHEAD:
        raise HTTPException(413, f"The file is larger than {max_bytes // MB} MB")
    form = _Form(directory, max_bytes)
    received = 0
    try:
        parser = MultipartParser(options[b"boundary"], form.callbacks())
        async for chunk in request.stream():
            received += len(chunk)
            parser.write(chunk)
            if received - form.size > FORM_OVERHEAD:  # the text fields are kept in memory
                raise HTTPException(413, "The form fields are too large")
        parser.finalize()
        if not form.complete:
            raise HTTPException(400, "The upload was incomplete")
        if form.path is None:
            raise HTTPException(400, "No file in the upload (form field \"file\")")
        if form.size == 0:
            raise HTTPException(400, "The file is empty")
    except ClientDisconnect:
        form.discard()
        raise HTTPException(400, "The upload was interrupted") from None
    except FormParserError:
        form.discard()
        raise HTTPException(400, "Malformed multipart form") from None
    except BaseException:
        form.discard()
        raise
    return Upload(form.path, form.size, form.fields)


def _extension(filename: str, content_type: str) -> str:
    """A known audio/video extension from the file name or its type ("bin" if neither says): the stored name
    never uses anything else the client sent."""
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension in AUDIO_EXTENSIONS:
        return extension
    return EXTENSION_FOR_TYPE.get(content_type.split(";")[0].strip().lower(), "bin")


def probe(path: Path) -> float | None:
    """The recording's duration in seconds (None if ffprobe can't tell).
    415 if ffprobe finds no audio stream or the format is not an audio/video container."""
    result = _ffprobe(path, "-show_entries", "format=format_name,duration:stream=codec_type", "-of", "json")
    try:
        info = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        info = {}
    container = info.get("format", {})
    formats = set(container.get("format_name", "").split(","))
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    if result.returncode != 0 or not formats & ALLOWED_FORMATS or not has_audio:
        raise HTTPException(415, "The file has no audio stream that can be read")
    try:
        return round(float(container["duration"]), 1)
    except (KeyError, ValueError):
        return _audio_end(path)


def _audio_end(path: Path) -> float | None:
    """When the last audio packet ends, for a container that doesn't state its duration (a browser recording):
    ffprobe reads the packets from the end of the file."""
    result = _ffprobe(path, "-select_streams", "a:0", "-read_intervals", f"{PAST_THE_END_S}%+#{MAX_END_PACKETS}",
                      "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0")
    ends = []
    for line in result.stdout.splitlines():  # "pts_time,duration_time" and maybe more fields
        start, length = [*line.split(","), ""][:2]
        try:
            ends.append(float(start) + float(length or 0))
        except ValueError:
            continue
    return round(max(ends), 1) if ends else None


def _ffprobe(path: Path, *args: str) -> subprocess.CompletedProcess:
    """ffprobe on the file only (no other protocol, so a playlist can't make it open anything else)."""
    try:
        return subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file", *args, str(path)],
                              capture_output=True, text=True, timeout=PROBE_TIMEOUT_S, check=False)
    except FileNotFoundError:
        raise HTTPException(500, "ffprobe is not installed on the server (install ffmpeg)") from None
    except subprocess.TimeoutExpired:
        raise HTTPException(415, "The file could not be read as audio") from None
