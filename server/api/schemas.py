"""Request / response shapes. JSON keys are camelCase (the frontend's convention); Python stays snake_case."""
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

MeetingType = Literal["medical", "executive", "administrative"]
Language = Literal["auto", "ro", "ru", "en"]
Cabinet = Literal["admin", "moderator", "participant"]
MeetingStatus = Literal["queued", "processing", "draft", "approved", "failed"]
StageName = Literal["upload", "convert", "speakers", "transcribe", "minutes"]
StageState = Literal["waiting", "running", "done", "skipped", "failed"]


class Api(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --- accounts ---

class User(Api):
    id: int
    email: str
    name: str
    initials: str
    dept: str
    cabinets: list[Cabinet]


class Attendee(Api):
    id: int
    name: str
    dept: str


class LoginIn(Api):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


# --- meetings and processing ---

class Stage(Api):
    name: StageName
    state: StageState = "waiting"
    seconds: Optional[float] = None
    percent: Optional[float] = None
    detail: Optional[str] = None


class Meeting(Api):
    id: int
    title: str
    type: MeetingType
    language: Language
    speakers: Optional[int] = None
    status: MeetingStatus
    error: Optional[str] = None
    duration: Optional[float] = None
    topic_count: Optional[int] = None
    created: float
    created_by: Optional[str] = None
    approved: Optional[float] = None
    approved_by: Optional[str] = None
    has_transcript: bool = False
    # while queued / processing
    queue_position: Optional[int] = None
    progress: Optional[float] = None


class Line(Api):
    start: float
    end: float
    speaker: str
    text: str


class Progress(Api):
    status: MeetingStatus
    error: Optional[str] = None
    queue_position: Optional[int] = None
    stages: list[Stage]
    lines: list[Line]
    next_line: int
    topics: int = 0


# --- the minutes document the moderator edits ---

Text = Annotated[str, Field(max_length=4000)]
Short = Annotated[str, Field(max_length=200)]


class ListItem(Api):
    id: Short
    text: Text = ""
    time: Optional[Short] = None
    who: Optional[Short] = None
    unverified: Optional[Short] = None  # values the transcript does not contain


class TaskItem(Api):
    id: Short
    text: Text = ""
    owner: Short = ""
    deadline: Short = ""
    priority: Literal["high", "medium", "low"] = "medium"
    time: Optional[Short] = None
    unverified: Optional[Short] = None
    done: bool = False


class CodeItem(Api):
    id: Short
    system: Short
    code: Short
    label: Short = ""


class TextBlock(Api):
    id: Short
    kind: Literal["text"]
    label: Short
    text: Annotated[str, Field(max_length=20000)] = ""


class ListBlock(Api):
    id: Short
    kind: Literal["list"]
    label: Short
    items: list[ListItem] = []


class TasksBlock(Api):
    id: Short
    kind: Literal["tasks"]
    label: Short
    items: list[TaskItem] = []


class CodesBlock(Api):
    id: Short
    kind: Literal["codes"]
    label: Short
    items: list[CodeItem] = []


Block = Annotated[Union[TextBlock, ListBlock, TasksBlock, CodesBlock], Field(discriminator="kind")]


class Topic(Api):
    id: Short
    title: Short = ""
    time: Optional[Short] = None
    blocks: list[Block] = []


class KeyMoment(Api):
    time: Short
    text: Text


class Participant(Api):
    speaker: Short
    name: Short = ""
    role: Short = ""
    seconds: float = 0


class NextMeeting(Api):
    date: Short = ""
    time: Short = ""
    place: Short = ""
    agenda: Text = ""


class MinutesDoc(Api):
    version: int = 1
    title: Short = ""
    summary: Text = ""
    key_moments: list[KeyMoment] = []
    ai_suggestions: list[Text] = []
    warnings: list[Text] = []
    participants: list[Participant] = []
    topics: list[Topic] = []
    next: NextMeeting = NextMeeting()
    # Directory users who attended; they receive the minutes by email when they are approved.
    attendees: list[int] = []


class Saved(Api):
    version: int


class Delivery(Api):
    """The email of the approved minutes to one attendee."""
    id: int
    user_id: Optional[int] = None
    name: Optional[str] = None
    email: str
    status: Literal["queued", "sent", "failed"]
    error: Optional[str] = None
    created: float
    sent: Optional[float] = None


class Approved(Saved):
    deliveries: list[Delivery]


# --- participants' suggestions ---

class SuggestionIn(Api):
    topic_id: Short
    kind: Annotated[str, Field(min_length=1, max_length=40)]
    text: Annotated[str, Field(min_length=1, max_length=2000)]


class Suggestion(Api):
    id: int
    topic_id: str
    author: Optional[str] = None
    kind: str
    text: str
    state: Literal["open", "accepted", "declined"]
    created: float


class ResolveIn(Api):
    accepted: bool
