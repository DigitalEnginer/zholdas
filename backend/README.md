# Zholdas Backend

FastAPI backend for protected AI chat calls. It keeps the OpenAI API key and Supabase service role key outside the mobile/PWA client.

## Local Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

On Windows:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Required Environment

```env
OPENAI_API_KEY=your_openai_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

## Cloud Run Command

Use this start command on hosts that provide a `PORT` environment variable:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

For the public PWA, set the frontend variable to the deployed backend URL:

```env
EXPO_PUBLIC_BACKEND_URL=https://your-public-backend-url
```
