"""
PhishGuard — All Pydantic schemas in one place.
Split into separate files if this grows too large.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from enum import Enum
import uuid


# ─────────────────────────────────────────────
# Auth / Users
# ─────────────────────────────────────────────

class UserRole(str, Enum):
    user = "user"
    moderator = "moderator"
    admin = "admin"


class UserProfile(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole = UserRole.user
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ─────────────────────────────────────────────
# Analysis / Streaming
# ─────────────────────────────────────────────

class InputType(str, Enum):
    url = "url"
    email = "email"
    web = "web"
    voice = "voice"
    sms = "sms"
    auto = "auto"


class AnalyzeRequest(BaseModel):
    input: str = Field(..., min_length=1, max_length=50000, description="Raw input to analyze")
    type: InputType = Field(..., description="Channel type")
    session_id: Optional[str] = None


class Verdict(str, Enum):
    phishing = "phishing"
    legitimate = "legitimate"
    suspicious = "suspicious"
    unknown = "unknown"


class ChannelResult(BaseModel):
    channel: str
    score: float                          # 0.0 - 1.0 phishing probability
    verdict: Verdict
    confidence: float
    features: Dict[str, Any] = {}         # ⚠️ MODEL CHANGE POINT: structure changes per model
    processing_time_ms: int
    cascade_skipped: bool = False


class ThreatIndicatorHit(BaseModel):
    indicator_type: str
    value: str
    threat_score: float
    verified: bool
    report_count: int


class CorrelationUpdate(BaseModel):
    level: int                            # 1=intra-input, 2=intra-session, 3=cross-user
    signal_type: str
    evidence: Dict[str, Any]
    affected_domains: List[str] = []
    campaign_id: Optional[str] = None


class FinalVerdict(BaseModel):
    verdict: Verdict
    confidence: float
    analysis_id: str
    channels_run: List[str]
    cascade_skipped: bool
    total_time_ms: int
    threat_indicator_hits: List[ThreatIndicatorHit] = []
    correlation: Optional[CorrelationUpdate] = None


# SSE event wrapper
class SSEEvent(BaseModel):
    event: str
    data: Any


# ─────────────────────────────────────────────
# Feedback
# ─────────────────────────────────────────────

class FeedbackStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class FeedbackCreate(BaseModel):
    analysis_id: str
    user_verdict: Verdict
    notes: Optional[str] = Field(None, max_length=1000)


class FeedbackReview(BaseModel):
    override_label: Optional[Verdict] = None   # admin can override user's verdict
    reason: Optional[str] = None


class FeedbackOut(BaseModel):
    id: str
    analysis_id: str
    submitted_by: str
    user_verdict: Verdict
    notes: Optional[str]
    status: FeedbackStatus
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    created_at: datetime


# ─────────────────────────────────────────────
# Simulations & Activities
# ─────────────────────────────────────────────

class Difficulty(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class SimulationType(str, Enum):
    email = "email"
    url = "url"
    sms = "sms"
    voice = "voice"
    unified = "unified"


class SimulationCreate(BaseModel):
    title: str = Field(..., max_length=200)
    sim_type: SimulationType
    content: Dict[str, Any]               # The simulated phishing content (flexible)
    difficulty: Difficulty
    explanation: str                      # Shown after user answers
    hints: List[str] = []
    active: bool = True


class SimulationOut(BaseModel):
    id: str
    title: str
    sim_type: SimulationType
    content: Dict[str, Any]
    difficulty: Difficulty
    hints: List[str]
    active: bool
    created_at: datetime
    # explanation hidden until user completes


class SimulationCompleteRequest(BaseModel):
    answer: str = Field(..., description="'phishing' or 'legitimate'")
    time_taken_seconds: Optional[int] = None


class SimulationCompleteResponse(BaseModel):
    correct: bool
    score: int
    explanation: str
    red_flags: List[str] = []


class ActivityType(str, Enum):
    quiz = "quiz"
    drag_drop = "drag_drop"
    spot_the_phish = "spot_the_phish"
    fill_blank = "fill_blank"


class ActivityCreate(BaseModel):
    title: str = Field(..., max_length=200)
    activity_type: ActivityType
    questions: List[Dict[str, Any]]       # Flexible question schema per type
    difficulty: Difficulty
    active: bool = True


class ActivityOut(BaseModel):
    id: str
    title: str
    activity_type: ActivityType
    questions: List[Dict[str, Any]]
    difficulty: Difficulty
    active: bool
    created_at: datetime


class ActivitySubmit(BaseModel):
    answers: List[Any]


class ActivityResult(BaseModel):
    score: int
    total: int
    percentage: float
    correct_answers: List[Any]
    feedback: List[str]


# ─────────────────────────────────────────────
# Admin
# ─────────────────────────────────────────────

class RoleUpdate(BaseModel):
    role: UserRole


class ThreatIndicatorVerify(BaseModel):
    verified: bool


class PlatformStats(BaseModel):
    total_analyses: int
    analyses_today: int
    phishing_count: int
    legitimate_count: int
    suspicious_count: int
    campaign_count: int
    accuracy: float
    analyses_per_day: List[Dict[str, Any]]
    pending_feedback: int
    verified_dataset_size: int
    top_domains: List[Dict[str, Any]]

