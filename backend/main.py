from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os
import requests

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


class ChatRequest(BaseModel):
    message: str
    event_id: str | None = None
    user_name: str | None = None


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
        chat_messages = [
            {
                "role": "system",
                "content": (
                    "Ты AI-ассистент приложения Жолдас. "
                    "Помогаешь пользователям находить компанию, события, маршруты, "
                    "места и активности в Алматы. Отвечай коротко и полезно. "
                    "Если в истории чата есть полезный контекст, учитывай его."
                ),
            },
        ]

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
        )

        reply = response.choices[0].message.content
        saved = save_ai_message(request.event_id, reply) if request.event_id else False

        return {
            "user_id": user.get("id"),
            "reply": reply,
            "saved": saved,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
