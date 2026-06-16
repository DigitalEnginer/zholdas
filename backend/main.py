from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
import os
import re
import requests
import time
from urllib.parse import quote
from uuid import UUID

load_dotenv()

# Create a global session for connection pooling to speed up Supabase REST and Auth calls
session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
session.mount("https://", adapter)
session.mount("http://", adapter)

SYSTEM_SETTINGS_CACHE = {}
SYSTEM_SETTINGS_CACHE_TTL = 300 # 5 minutes
SYSTEM_SETTINGS_CACHE_TIME = 0

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BACKEND_CORS_ORIGINS = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:8081,http://localhost:19006,http://localhost:3000,http://127.0.0.1:8081,https://zholdas.vercel.app",
)
BACKEND_CORS_ORIGIN_REGEX = os.getenv("BACKEND_CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is missing")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is missing")

if not SUPABASE_ANON_KEY:
    raise RuntimeError("SUPABASE_ANON_KEY is missing")

app = FastAPI()


def parse_csv_env(value: str):
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_csv_env(BACKEND_CORS_ORIGINS),
    allow_origin_regex=BACKEND_CORS_ORIGIN_REGEX or None,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    return response

client = OpenAI(api_key=OPENAI_API_KEY)

AI_RATE_WINDOW_SECONDS = 10 * 60
AI_RATE_LIMIT = 8
ADMIN_DELETE_RATE_WINDOW_SECONDS = 10 * 60
ADMIN_DELETE_RATE_LIMIT = 5
ai_rate_log: dict[str, list[float]] = {}
admin_delete_rate_log: dict[str, list[float]] = {}
USER_STORAGE_BUCKETS = ("profile-photos", "event-photos", "chat-photos")

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


def parse_bool(value: str | None, default: bool = False):
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def ensure_ai_rate_limit(user_id: str):
    now = time.time()
    limit = get_system_setting_int("ai_rate_limit_per_10m", AI_RATE_LIMIT)
    recent = [
        timestamp
        for timestamp in ai_rate_log.get(user_id, [])
        if now - timestamp < AI_RATE_WINDOW_SECONDS
    ]

    if len(recent) >= limit:
        retry_minutes = max(1, round((AI_RATE_WINDOW_SECONDS - (now - recent[0])) / 60))
        raise HTTPException(
            status_code=429,
            detail=f"Лимит AI: {limit} запросов за 10 минут. Попробуй через {retry_minutes} мин.",
        )

    recent.append(now)
    ai_rate_log[user_id] = recent


def ensure_admin_delete_rate_limit(admin_id: str):
    now = time.time()
    recent = [
        timestamp
        for timestamp in admin_delete_rate_log.get(admin_id, [])
        if now - timestamp < ADMIN_DELETE_RATE_WINDOW_SECONDS
    ]

    if len(recent) >= ADMIN_DELETE_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many admin delete attempts. Try again later.")

    recent.append(now)
    admin_delete_rate_log[admin_id] = recent


def ensure_uuid(value: str | None, field_name: str):
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")


def raise_upstream_error(action: str):
    raise HTTPException(status_code=502, detail=f"{action} failed")


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

    response = session.get(
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


def service_role_headers():
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_SERVICE_ROLE_KEY is missing")

    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }


def fetch_service_rows(table: str, params: dict):
    response = session.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=service_role_headers(),
        params=params,
        timeout=10,
    )

    if response.status_code != 200:
        raise_upstream_error("Supabase read")

    return response.json()


def insert_service_row(table: str, payload: dict):
    response = session.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            **service_role_headers(),
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=payload,
        timeout=10,
    )

    if response.status_code not in (200, 201, 204):
        raise_upstream_error("Supabase insert")


def get_system_settings_cached():
    global SYSTEM_SETTINGS_CACHE, SYSTEM_SETTINGS_CACHE_TIME
    now = time.time()
    if now - SYSTEM_SETTINGS_CACHE_TIME > SYSTEM_SETTINGS_CACHE_TTL:
        if not SUPABASE_SERVICE_ROLE_KEY:
            return SYSTEM_SETTINGS_CACHE
        try:
            response = session.get(
                f"{SUPABASE_URL}/rest/v1/system_settings",
                headers=service_role_headers(),
                timeout=5,
            )
            if response.status_code == 200:
                rows = response.json()
                SYSTEM_SETTINGS_CACHE = {row["key"]: row["value"] for row in rows if "key" in row}
                SYSTEM_SETTINGS_CACHE_TIME = now
        except Exception:
            pass
    return SYSTEM_SETTINGS_CACHE


def get_system_setting(key: str, default: str | None = None):
    settings = get_system_settings_cached()
    if key in settings:
        return settings[key]

    if not SUPABASE_SERVICE_ROLE_KEY:
        return default

    try:
        rows = fetch_service_rows(
            "system_settings",
            {
                "key": f"eq.{key}",
                "select": "value",
                "limit": "1",
            },
        )
    except HTTPException:
        return default

    val = rows[0].get("value") if rows else default
    if val is not None:
        SYSTEM_SETTINGS_CACHE[key] = val
    return val


def get_system_setting_int(key: str, default: int):
    try:
        return max(1, int(get_system_setting(key, str(default)) or default))
    except ValueError:
        return default


def ensure_ai_is_enabled():
    if not parse_bool(get_system_setting("ai_enabled", "true"), True):
        raise HTTPException(status_code=403, detail="AI temporarily disabled by admin")


def ensure_super_admin(user_id: str):
    profiles = fetch_service_rows(
        "profiles",
        {
            "id": f"eq.{user_id}",
            "select": "id,email,role,is_banned",
            "limit": "1",
        },
    )

    if not profiles:
        raise HTTPException(status_code=403, detail="Admin profile not found")

    profile = profiles[0]
    if profile.get("role") != "admin" or profile.get("is_banned"):
        raise HTTPException(status_code=403, detail="Super admin access required")

    try:
        allowed_emails = fetch_service_rows("super_admin_emails", {"select": "email"})
    except HTTPException:
        allowed_emails = []

    allowed = {
        (item.get("email") or "").strip().lower()
        for item in allowed_emails
        if item.get("email")
    }

    if allowed and (profile.get("email") or "").strip().lower() not in allowed:
        raise HTTPException(status_code=403, detail="Super admin email is not allowed")

    return profile


def rest_delete(table: str, params: dict, *, optional: bool = False):
    response = session.delete(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            **service_role_headers(),
            "Prefer": "return=minimal",
        },
        params=params,
        timeout=15,
    )

    if response.status_code in (200, 204):
        return

    if optional and response.status_code in (404, 400):
        return

    raise_upstream_error("Supabase delete")


def delete_auth_user(user_id: str):
    response = session.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=service_role_headers(),
        timeout=15,
    )

    if response.status_code not in (200, 204):
        raise_upstream_error("Supabase auth delete")


def list_storage_objects(bucket: str, prefix: str):
    response = session.post(
        f"{SUPABASE_URL}/storage/v1/object/list/{bucket}",
        headers={
            **service_role_headers(),
            "Content-Type": "application/json",
        },
        json={
            "prefix": prefix,
            "limit": 1000,
            "offset": 0,
        },
        timeout=15,
    )

    if response.status_code != 200:
        return []

    return response.json()


def delete_storage_object(bucket: str, path: str):
    response = session.delete(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{quote(path, safe='/')}",
        headers=service_role_headers(),
        timeout=15,
    )
    return response.status_code in (200, 204, 404)


def cleanup_user_storage(target_user_id: str):
    deleted = 0
    failed = 0

    for bucket in USER_STORAGE_BUCKETS:
        objects = list_storage_objects(bucket, target_user_id)
        for item in objects:
            name = item.get("name")
            if not name:
                continue
            path = name if name.startswith(f"{target_user_id}/") else f"{target_user_id}/{name}"
            if delete_storage_object(bucket, path):
                deleted += 1
            else:
                failed += 1

    return {"deleted": deleted, "failed": failed}


def cleanup_user_data(target_user_id: str):
    created_events = fetch_service_rows(
        "events",
        {
            "created_by": f"eq.{target_user_id}",
            "select": "id",
        },
    )
    created_event_ids = [event["id"] for event in created_events if event.get("id")]
    event_id_filter = f"in.({','.join(created_event_ids)})" if created_event_ids else None

    if event_id_filter:
        rest_delete("messages", {"event_id": event_id_filter})
        rest_delete("event_participants", {"event_id": event_id_filter})
        rest_delete("reviews", {"event_id": event_id_filter}, optional=True)
        rest_delete("content_moderation_violations", {"event_id": event_id_filter}, optional=True)

    rest_delete("messages", {"user_id": f"eq.{target_user_id}"})
    rest_delete("event_participants", {"user_id": f"eq.{target_user_id}"})
    rest_delete("friend_requests", {"or": f"(from_user_id.eq.{target_user_id},to_user_id.eq.{target_user_id})"}, optional=True)
    rest_delete("blocks", {"or": f"(blocker_id.eq.{target_user_id},blocked_id.eq.{target_user_id})"}, optional=True)
    rest_delete("notifications", {"or": f"(recipient_id.eq.{target_user_id},actor_id.eq.{target_user_id})"}, optional=True)
    rest_delete("reports", {"or": f"(reporter_id.eq.{target_user_id},reported_user_id.eq.{target_user_id})"})
    rest_delete("user_bans", {"or": f"(user_id.eq.{target_user_id},banned_by.eq.{target_user_id})"})
    rest_delete("moderation_actions", {"or": f"(moderator_id.eq.{target_user_id},target_user_id.eq.{target_user_id})"}, optional=True)
    rest_delete("content_moderation_violations", {"user_id": f"eq.{target_user_id}"}, optional=True)
    rest_delete("reviews", {"or": f"(from_user_id.eq.{target_user_id},to_user_id.eq.{target_user_id})"}, optional=True)
    rest_delete("events", {"created_by": f"eq.{target_user_id}"})
    rest_delete("profiles", {"id": f"eq.{target_user_id}"})


def ensure_user_is_not_banned(user_id: str, token: str):
    response = session.get(
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

    response = session.post(
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
    response = session.get(
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
    response = session.get(
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


@app.delete("/admin/users/{target_user_id}")
def admin_delete_user(target_user_id: str, authorization: str | None = Header(default=None)):
    target_user_id = ensure_uuid(target_user_id, "target_user_id")
    user = verify_supabase_token(authorization)
    admin_profile = ensure_super_admin(user.get("id"))
    ensure_admin_delete_rate_limit(admin_profile.get("id"))

    if target_user_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Admins cannot delete their own account")

    target_profiles = fetch_service_rows(
        "profiles",
        {
            "id": f"eq.{target_user_id}",
            "select": "id,email,role",
            "limit": "1",
        },
    )

    if target_profiles and target_profiles[0].get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admins cannot delete another admin account")

    storage_result = cleanup_user_storage(target_user_id)
    cleanup_user_data(target_user_id)
    delete_auth_user(target_user_id)
    insert_service_row("admin_audit_logs", {
        "actor_id": admin_profile.get("id"),
        "target_user_id": None,
        "action": "user_hard_deleted",
        "details": (
            f"deleted_user_id:{target_user_id}\n"
            f"deleted_email:{target_profiles[0].get('email') if target_profiles else ''}\n"
            f"storage_deleted:{storage_result['deleted']}\n"
            f"storage_failed:{storage_result['failed']}"
        ),
    })

    return {
        "deleted_user_id": target_user_id,
        "deleted_email": target_profiles[0].get('email') if target_profiles else None,
        "admin_id": admin_profile.get("id"),
    }


@app.post("/chat")
def chat(request: ChatRequest, authorization: str | None = Header(default=None)):
    start_total = time.time()
    user = verify_supabase_token(authorization)
    t_token = time.time() - start_total
    
    token = authorization.replace("Bearer ", "") if authorization else ""
    user_id = user.get("id")

    ensure_ai_is_enabled()

    if request.event_id:
        request.event_id = ensure_uuid(request.event_id, "event_id")

    try:
        # Run DB checks in parallel using ThreadPoolExecutor to minimize latency
        def check_banned_task():
            ensure_user_is_not_banned(user_id, token)

        def check_participant_task():
            if request.event_id:
                ensure_event_participant(request.event_id, user_id, token)

        def load_messages_task():
            if request.event_id:
                return load_recent_messages(request.event_id, token)
            return []

        start_db = time.time()
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_ban = executor.submit(check_banned_task)
            future_participant = executor.submit(check_participant_task)
            future_messages = executor.submit(load_messages_task)

            # Retrieve results (will raise any HTTPExceptions occurred during threads)
            future_ban.result()
            future_participant.result()
            context_messages = future_messages.result()
        t_db = time.time() - start_db

        # In-memory validation
        ensure_ai_scope(request.message, request.event_title, context_messages)
        ensure_ai_rate_limit(user_id)

        # Build chat prompt history
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

        # OpenAI completion
        start_openai = time.time()
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=chat_messages,
            temperature=0.4,
            max_tokens=220,
        )
        t_openai = time.time() - start_openai

        reply = response.choices[0].message.content.strip()

        # Remove double prefixes if AI generated them (e.g. "Жолдас AI: ...")
        reply = re.sub(r"^(Жолдас AI|Zholdas AI):\s*", "", reply, flags=re.IGNORECASE).strip()

        start_save = time.time()
        saved = save_ai_message(request.event_id, reply) if request.event_id else False
        t_save = time.time() - start_save
        t_total = time.time() - start_total

        print(f"[AI_CHAT_STATS] Total: {t_total:.3f}s | Token: {t_token:.3f}s | DB: {t_db:.3f}s | LLM: {t_openai:.3f}s | Save: {t_save:.3f}s")

        return {
            "user_id": user_id,
            "reply": reply,
            "saved": saved,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Chat request failed error: {e}")
        raise HTTPException(status_code=500, detail="AI request failed")
