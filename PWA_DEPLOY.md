# Zholdas PWA Deployment

This checklist prepares the public web/PWA version. Account-specific values are intentionally left for the final setup step.

## Current Architecture

- Expo web exports a static app into `dist`.
- Vercel serves the static app and rewrites app routes back to `/`.
- Supabase remains the public auth/database/storage backend.
- Leaflet/OpenStreetMap is used for web maps.
- Native Android/iOS still use `react-native-maps`.
- Browser push is not enabled yet; the MVP uses in-app notifications.

## Local Verification

```bash
npm install
npm run build:web
npm run serve:web
```

Open:

```txt
http://localhost:8081
http://localhost:8081/manifest.json
http://localhost:8081/sw.js
```

## Vercel Settings

Build command:

```bash
npx expo export -p web
```

Output directory:

```txt
dist
```

Environment variables:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
EXPO_PUBLIC_BACKEND_URL=https://your-public-backend-url
EXPO_PUBLIC_SUPER_ADMIN_EMAIL=admin@example.com,second-admin@example.com
```

## Supabase Settings

After the Vercel URL exists, add it to Supabase Auth settings:

```txt
Site URL: https://your-vercel-domain.vercel.app
Redirect URLs:
https://your-vercel-domain.vercel.app
https://your-vercel-domain.vercel.app/**
```

## Backend Requirement

The public PWA cannot use:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

Deploy the FastAPI backend first, or leave AI chat on fallback responses until a public backend exists.

Set these backend environment variables on Render:

```env
BACKEND_CORS_ORIGINS=https://your-vercel-domain.vercel.app
BACKEND_CORS_ORIGIN_REGEX=https://.*\.vercel\.app
```

Remove `BACKEND_CORS_ORIGIN_REGEX` if you want only the production Vercel domain to call the backend.

## MVP Limitations

- Web map uses OpenStreetMap tiles, not Google Maps or 2GIS.
- Route drawing is simplified; the route button opens Google Maps externally.
- PWA install is browser-controlled. On iOS: Safari -> Share -> Add to Home Screen.
- Push notifications are not implemented for web yet.
