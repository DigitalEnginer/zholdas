# Zholdas

Zholdas is an Expo React Native app for finding company for events in Almaty. It uses Supabase for auth, data, RLS, realtime-style app data, and a FastAPI backend for OpenAI chat so API keys stay off the mobile client.

## Stack

- Expo / React Native
- TypeScript
- Supabase Auth, Postgres, RLS
- FastAPI backend
- OpenAI API through backend only

## Requirements

- Node.js 22.13.x recommended
- npm
- Python 3.12+
- Supabase project
- OpenAI API key

If Metro fails with `configs.toReversed is not a function`, your Node version is too old. Use Node 22.

## Frontend Setup

Create `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

Install and start:

```bash
npm install
npm start
```

For iOS Simulator:

```bash
npm run ios
```

For Expo Go on a physical phone, `EXPO_PUBLIC_BACKEND_URL` must point to an address reachable from the phone, for example:

```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.10:8000
```

## Backend Setup

Create `backend/.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

Install and start:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Check:

```bash
curl http://localhost:8000/health
```

## Supabase SQL Order

Run these files in Supabase SQL Editor in this order:

1. `supabase_moderation_hardening.sql`
2. `supabase_social_features.sql`
3. `supabase_final_product_layer.sql`
4. `supabase_event_status.sql`
5. `supabase_reviews_hardening.sql`
6. `supabase_seed_demo.sql` optional demo data

Important: `supabase_final_product_layer.sql` contains stricter message insert rules. Run it after `SUPABASE_SERVICE_ROLE_KEY` is configured in `backend/.env`, because AI messages are saved by the backend service role.

## Roles

Profiles use:

- `user`
- `moderator`
- `admin`

To make a user an admin manually in Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

If your `profiles` table does not have an `email` column, use the profile `id`:

```sql
update public.profiles
set role = 'admin'
where id = 'user-uuid-here';
```

## Moderation Features

- Moderator/admin can ban and unban users.
- Banned users cannot create events, join events, send messages, send reviews, create reports, or use backend AI chat.
- Reports are visible in moderator dashboard.
- Moderation actions are logged.
- Banned account screen is shown on login.

## Social Features

- Friend requests
- Friends screen
- Personal blocks
- Notifications
- Participants screen with hidden banned users for regular users
- Creator/moderator/admin can remove participants

## Reviews And Rating

- Users can review only other participants of the same event.
- Reviews are allowed only after an event is marked as `finished`.
- One user can leave only one review per participant per event.
- Rating is constrained to 1-5.
- `profiles.rating` and `profiles.reviews_count` are recalculated by Supabase triggers.

## Event Statuses

- `active` events can be joined and chatted in.
- `finished` events are closed for joining and can be reviewed.
- `cancelled` events are closed for joining, chat, and reviews.

## Security Notes

- Do not commit `.env` or `backend/.env`.
- `EXPO_PUBLIC_*` values are public in the app bundle. Never put service role or OpenAI keys there.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only on the backend/server.

## Verification

TypeScript check:

```bash
npx tsc --noEmit
```

Backend syntax check:

```bash
backend/.venv/bin/python -m py_compile backend/main.py
```
