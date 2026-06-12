from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os
import re
import requests
import time

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is missing")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is missing")

if not SUPABASE_ANON_KEY:
    raise RuntimeError("SUPABASE_ANON_KEY is missing")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=OPENAI_API_KEY)

AI_RATE_WINDOW_SECONDS = 10 * 60
AI_RATE_LIMIT = 8
ai_rate_log: dict[str, list[float]] = {}

OUT_OF_SCOPE_PATTERNS = [
    r"\b(реши|решить)\s+(уравнен|пример|задач|матем)",
    r"\b(уравнен|интеграл|производн|теорем|домашк|контрольн)\b",
    r"\b(python|javascript|typescript|html|css|sql|код|программ)\b",
    r"\b(essay|реферат|сочинен|переведи|translate)\b",
    r"\d+\s*[\+\-\*\/\^=]\s*\d+",
]

EVENT_SCOPE_KEYWORDS = [
    "ивент", "событие", "встреч", "чат", "участник", "группа", "организ",
    "маршрут", "адрес", "место", "локац", "где", "когда", "во сколько",
    "добраться", "ехать", "идти", "взять", "одеть", "погода", "алматы",
    "созвон", "опозда", "правила", "план", "сбор", "стоимость",
]


class ChatRequest(BaseModel):
    message: str
    event_id: str | None = None
    event_title: str | None = None
    user_name: str | None = None


def ensure_ai_rate_limit(user_id: str):
    now = time.time()
    recent = [
        timestamp
        for timestamp in ai_rate_log.get(user_id, [])
        if now - timestamp < AI_RATE_WINDOW_SECONDS
    ]

    if len(recent) >= AI_RATE_LIMIT:
        retry_minutes = max(1, round((AI_RATE_WINDOW_SECONDS - (now - recent[0])) / 60))
        raise HTTPException(
            status_code=429,
            detail=f"Лимит AI: {AI_RATE_LIMIT} запросов за 10 минут. Попробуй через {retry_minutes} мин.",
        )

    recent.append(now)
    ai_rate_log[user_id] = recent


def normalize_text(value: str | None):
    return re.sub(r"\s+", " ", value or "").strip().lower()


def is_obviously_out_of_scope(message: str):
    text = normalize_text(message)
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in OUT_OF_SCOPE_PATTERNS)


def is_event_related(message: str, event_title: str | None, context_messages: list[dict]):
    text = normalize_text(message)
    title_words = [
        word
        for word in re.split(r"\W+", normalize_text(event_title))
        if len(word) >= 4
    ]

    if any(keyword in text for keyword in EVENT_SCOPE_KEYWORDS):
        return True

    if any(word in text for word in title_words):
        return True

    if len(text) <= 80 and context_messages:
        return not is_obviously_out_of_scope(text)

    return False


def ensure_ai_scope(message: str, event_title: str | None, context_messages: list[dict]):
    if is_obviously_out_of_scope(message) or not is_event_related(message, event_title, context_messages):
        raise HTTPException(
            status_code=400,
            detail="Жолдас AI отвечает только по теме этого ивента и его чата: место, время, маршрут, участники и организация.",
        )


def verify_supabase_token(authorization: str | None):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    token = authorization.replace("Bearer ", "")

    response = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        timeout=10,
    )

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Supabase token")

    return response.json()


def ensure_user_is_not_banned(user_id: str, token: str):
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        params={
            "id": f"eq.{user_id}",
            "select": "is_banned,ban_reason",
        },
        timeout=10,
    )

    if response.status_code != 200:
        raise HTTPException(status_code=403, detail="Could not verify ban status")

    profiles = response.json()
    if profiles and profiles[0].get("is_banned"):
        raise HTTPException(
            status_code=403,
            detail=profiles[0].get("ban_reason") or "User is banned",
        )


def save_ai_message(event_id: str, text: str):
    if not SUPABASE_SERVICE_ROLE_KEY:
        return False

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/messages",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json={
            "event_id": event_id,
            "user_id": "ai",
            "user_name": "Жолдас AI",
            "text": text,
            "is_ai": True,
        },
        timeout=10,
    )

    return response.status_code in (200, 201, 204)


def ensure_event_participant(event_id: str, user_id: str, token: str):
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/event_participants",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        params={
            "event_id": f"eq.{event_id}",
            "user_id": f"eq.{user_id}",
            "select": "event_id",
            "limit": "1",
        },
        timeout=10,
    )

    if response.status_code != 200:
        raise HTTPException(status_code=403, detail="Could not verify event access")

    if not response.json():
        raise HTTPException(status_code=403, detail="Only event participants can use AI in this chat")


def load_recent_messages(event_id: str, token: str):
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/messages",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        params={
            "event_id": f"eq.{event_id}",
            "select": "user_name,text,is_ai,created_at",
            "order": "created_at.desc",
            "limit": "20",
        },
        timeout=10,
    )

    if response.status_code != 200:
        return []

    return list(reversed(response.json()))


@app.get("/")
def root():
    return {"status": "Backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(authorization: str | None = Header(default=None)):
    user = verify_supabase_token(authorization)
    token = authorization.replace("Bearer ", "") if authorization else ""
    ensure_user_is_not_banned(user.get("id"), token)
    return {
        "id": user.get("id"),
        "email": user.get("email"),
    }


@app.post("/chat")
def chat(request: ChatRequest, authorization: str | None = Header(default=None)):
    user = verify_supabase_token(authorization)
    token = authorization.replace("Bearer ", "") if authorization else ""
    ensure_user_is_not_banned(user.get("id"), token)
    if request.event_id:
        ensure_event_participant(request.event_id, user.get("id"), token)

    try:
        context_messages = load_recent_messages(request.event_id, token) if request.event_id else []
        ensure_ai_scope(request.message, request.event_title, context_messages)
        ensure_ai_rate_limit(user.get("id"))
        chat_messages = [
            {
                "role": "system",
                "content": (
                    "Ты AI-ассистент приложения Жолдас. "
                    "Отвечай только по теме текущего ивента и его чата: место, время, маршрут, "
                    "участники, подготовка, правила и организация встречи. "
                    "Если пользователь просит решить математику, написать код, сделать домашнее задание "
                    "или спрашивает не по теме ивента, коротко откажи и верни разговор к ивенту. "
                    "Не помогай обходить модерацию, оскорблять людей или организовывать опасные действия. "
                    "Отвечай коротко и полезно."
                ),
            },
        ]

        if request.event_title:
            chat_messages.append({
                "role": "system",
                "content": f"Название ивента: {request.event_title}",
            })

        for message in context_messages:
            chat_messages.append({
                "role": "assistant" if message.get("is_ai") else "user",
                "content": f"{message.get('user_name') or 'Пользователь'}: {message.get('text') or ''}",
            })

        chat_messages.append({
            "role": "user",
            "content": request.message,
        })

        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=chat_messages,
            temperature=0.4,
            max_tokens=220,
        )

        reply = response.choices[0].message.content
        saved = save_ai_message(request.event_id, reply) if request.event_id else False

        return {
            "user_id": user.get("id"),
            "reply": reply,
            "saved": saved,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
