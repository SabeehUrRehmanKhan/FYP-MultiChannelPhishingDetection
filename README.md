# PhishGuard 🛡️

> Multi-channel AI-powered phishing detection platform with real-time neural analysis, security awareness training, and team threat intelligence.

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Quick Start](#quick-start)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Supabase Setup](#supabase-setup)
6. [User Roles & Permissions](#user-roles--permissions)
7. [Managing Simulations & Activities (Admin Guide)](#managing-simulations--activities)
8. [API Reference](#api-reference)
9. [Known Issues Fixed (QA Audit)](#qa-audit--fixes)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Vite + React + TypeScript) │
│  LoginPage → Dashboard → History → Simulations → Admin   │
│  AuthContext (Supabase JWT) → FastAPI Backend            │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────┐
│              Backend (FastAPI + Python)                   │
│  /auth/me   /analyze  /simulations  /activities           │
│  /history   /feedback  /admin       /sessions             │
└──────────┬───────────────────────────┬───────────────────┘
           │                           │
    ┌──────▼──────┐           ┌────────▼────────┐
    │  Supabase   │           │   Redis Cache   │
    │  (Postgres  │           │  (Rate-limit,   │
    │   + Auth)   │           │   threat cache) │
    └─────────────┘           └─────────────────┘
```

### Key Components
| Layer | Tech | Purpose |
|-------|------|---------|
| Frontend | React 18 + Vite + TypeScript | SPA with dark-mode UI |
| Auth | Supabase Auth (email + Google OAuth) | JWT sessions, email confirmation |
| Backend | FastAPI (Python 3.11+) | REST + SSE analysis API |
| Database | Supabase (PostgreSQL) | Profiles, analyses, simulations, feedback |
| Cache | Redis | Threat indicator cache, session rate-limiting |
| ML Models | Scikit-learn / custom | URL, NLP, web, voice phishing classifiers |

---

## Quick Start

```bash
# 1. Clone and open
cd e:\phishguard\phishguard

# 2. Start backend
cd backend
python -m uvicorn app.main:app --reload --port 8000

# 3. Start frontend (separate terminal)
cd Frontend/PhishGuard
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**  
Backend API docs at **http://localhost:8000/docs** (development mode only)

---

## Backend Setup

### Requirements
```bash
cd backend
pip install -r requirements.txt
```

### Environment Variables (`backend/.env`)
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # Required for admin ops

# App
APP_ENV=development          # development | production
FRONTEND_URL=http://localhost:5173

# Redis
REDIS_URL=redis://localhost:6379

# ML
USE_MOCK_MODELS=true         # false = load real .pkl models from ml_models/
```

### Starting the Server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Frontend Setup

### Environment Variables (`Frontend/PhishGuard/.env.local`)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000
```

### Commands
```bash
npm install       # Install dependencies
npm run dev       # Development server
npm run build     # Production build
npm run preview   # Preview production build
```

---

## Supabase Setup

### 1. Run the Schema
Go to **Supabase Dashboard → SQL Editor → New Query**, paste and run the contents of:
```
backend/supabase_schema.sql
```

This creates all tables, indexes, Row Level Security policies, and the auto-profile trigger.

### 2. Apply the `avatar_url` Migration
If you already ran the schema, run this additional migration:
```sql
-- Add avatar_url and phone columns if not already present
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update the trigger to capture Google profile picture
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles.display_name),
    avatar_url   = COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', profiles.avatar_url),
    updated_at   = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. Enable Google OAuth (optional)
- Supabase Dashboard → Auth → Providers → Google → Enable
- Add your Google OAuth Client ID and Secret

### 4. Email Confirmation
- Auth → Settings → **Enable email confirmations** ✅ (already enabled per your config)
- The frontend shows a verification banner after signup — users must confirm before logging in.

### 5. Promote First Admin
Run in SQL Editor after your first user registers:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-admin@email.com';
```

---

## User Roles & Permissions

| Role | Who | Access |
|------|-----|--------|
| `user` | Default for all registrations | Dashboard, History, Simulations, Threat Intel |
| `moderator` | Trusted team member | All user access + Feedback Queue + Dataset review |
| `admin` | Platform administrator | Everything + User role management + Simulation/Activity CRUD + Stats |

### Promoting a User
**Option A — SQL Editor (Supabase)**:
```sql
UPDATE profiles SET role = 'moderator' WHERE email = 'user@example.com';
UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

**Option B — Admin UI**:  
Login as admin → Admin sidebar → Platform Stats → (User management in `/admin/users` endpoint — UI coming in next sprint)

---

## Managing Simulations & Activities

> **Who can manage:** Only users with `admin` role see the admin sidebar section.

### Simulations (Phishing Scenarios)
Located in sidebar: **Admin → Simulations** (`/admin/simulations`)

Simulations are realistic phishing scenarios that users must classify as *Phishing* or *Legitimate*.

**To create a simulation:**
1. Click **+ New Simulation**
2. Fill in:
   - **Title** — Short name (e.g. "Suspicious PayPal Password Reset")
   - **Type** — `email`, `url`, `sms`, or `voice`
   - **Difficulty** — `beginner`, `intermediate`, `advanced`
   - **Sender / From** — Spoofed sender (e.g. `support@paypa1.com`)
   - **Subject** — Email subject line
   - **URL** — Malicious link shown in the scenario
   - **Body / Content** — The phishing message text
   - **Explanation** — Shown to users AFTER they submit (teach the red flags)
   - **Hints** — Optional hints (one per line), revealed on demand
3. Check **Active** to make it visible to users
4. Click **Save**

**Content example (email simulation):**
```
Sender:  security-alert@amaz0n.com
Subject: Action Required: Unusual sign-in detected
Body:    We detected a sign-in to your Amazon account from a new device.
         If this wasn't you, click here immediately to secure your account:
         http://amaz0n-secure.net/verify?token=abc123
Hints:   - Check the sender domain carefully
         - Hover over links before clicking
Explanation: The sender domain is "amaz0n.com" — note the zero instead of 'o'. 
             The link also goes to a non-Amazon domain. Classic domain spoofing attack.
```

### MCQ Activities (Awareness Quizzes)
Located in sidebar: **Admin → MCQ Activities** (`/admin/activities`)

Activities are multiple-choice knowledge quizzes to reinforce phishing awareness concepts.

**To create a quiz:**
1. Click **+ New Activity**
2. Set Title, Type (`quiz`/`spot_the_phish`/`fill_blank`), and Difficulty
3. For each question:
   - Enter the question text
   - Fill in 2–4 answer options
   - Click the **radio button** next to the correct answer
   - Add an explanation (shown in the result breakdown)
4. Click **+ Add Question** to add more questions
5. Check **Active** and click **Save Activity**

**Question example:**
```
Question: Which of the following is a red flag in a phishing email?
Options:
  ○ The email is from your bank's official domain
  ◉ The email asks you to click a link to "verify your account immediately"   ← correct
  ○ The email has a proper greeting with your full name
  ○ The email mentions your recent transaction

Explanation: Urgency language ("immediately") and credential-harvesting links 
             are hallmark phishing tactics.
```

### User Progress Tracking
All simulation and activity completions are stored in `user_progress` table with:
- Score achieved
- Answers submitted
- Completion timestamp

Users can re-attempt activities — only the latest score is stored (upsert).

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/auth/me` | Bearer JWT | Get current user profile |
| PUT | `/auth/me` | Bearer JWT | Update display_name / avatar_url |

### Analysis
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/analyze/stream` | Bearer JWT | SSE stream: real-time phishing analysis |

### Simulations
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/simulations` | Bearer JWT | List active simulations |
| GET | `/simulations/{id}` | Bearer JWT | Get one simulation |
| POST | `/simulations/{id}/complete` | Bearer JWT | Submit answer, get score + explanation |
| GET | `/simulations/activities/list` | Bearer JWT | List awareness activities |
| GET | `/simulations/activities/{id}` | Bearer JWT | Get one activity with questions |
| POST | `/simulations/activities/{id}/submit` | Bearer JWT | Submit quiz answers |
| GET | `/simulations/progress/me` | Bearer JWT | My completion history |

### Admin — Simulations
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/simulations/admin/simulations` | Admin JWT | Create simulation |
| PUT | `/simulations/admin/simulations/{id}` | Admin JWT | Update simulation |
| DELETE | `/simulations/admin/simulations/{id}` | Admin JWT | Deactivate simulation |
| POST | `/simulations/admin/activities` | Admin JWT | Create activity |
| PUT | `/simulations/admin/activities/{id}` | Admin JWT | Update activity |

### History
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/history` | Bearer JWT | Paginated analysis history |
| GET | `/history/{id}` | Bearer JWT | Analysis detail with features |

### Feedback
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/feedback` | Bearer JWT | Submit verdict correction |
| GET | `/feedback` | Moderator+ | List pending feedback |
| PATCH | `/feedback/{id}/approve` | Moderator+ | Approve and add to dataset |
| PATCH | `/feedback/{id}/reject` | Moderator+ | Reject feedback |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/stats` | Admin | Platform-wide statistics |
| GET | `/admin/users` | Admin | List all users |
| PATCH | `/admin/users/{id}/role` | Admin | Change user role |
| GET | `/admin/threat-indicators` | Admin | All threat indicators |
| PATCH | `/admin/threat-indicators/{id}/verify` | Admin | Verify/unverify indicator |

---

## QA Audit & Fixes

The following bugs were identified and fixed in this release:

| # | Bug | Status |
|---|-----|--------|
| 1 | Register form missing `display_name` / Full Name field | ✅ Fixed |
| 2 | No email verification banner after signup | ✅ Fixed |
| 3 | `signUpWithEmail` not passing metadata to Supabase | ✅ Fixed |
| 4 | `avatar_url` missing from profiles schema and TS types | ✅ Fixed |
| 5 | No `/auth/me` backend endpoint (every load returned 404) | ✅ Fixed |
| 6 | Simulations page always empty (API key mismatch `simulations` vs `items`) | ✅ Fixed |
| 7 | Activities/MCQ tab completely absent from frontend | ✅ Fixed |
| 8 | Google OAuth avatar not shown in sidebar | ✅ Fixed |
| 9 | No admin UI for creating/editing simulations and activities | ✅ Fixed |

### Database Migration Required
Run the `avatar_url` migration SQL shown in the Supabase Setup section above if you already have an existing database.

---

## Project Structure

```
phishguard/
├── backend/
│   ├── app/
│   │   ├── api/routes/
│   │   │   ├── auth.py          ← NEW: /auth/me endpoint
│   │   │   ├── analyze.py       SSE streaming analysis
│   │   │   ├── simulations.py   Simulations + Activities
│   │   │   ├── admin.py         Admin management
│   │   │   ├── history.py
│   │   │   ├── feedback.py
│   │   │   └── dataset.py
│   │   ├── auth/
│   │   │   └── dependencies.py  JWT validation + role guards
│   │   ├── schemas/
│   │   │   └── all.py           Pydantic models (UserProfile + avatar_url)
│   │   ├── db/supabase_client.py
│   │   ├── cache/redis_client.py
│   │   └── main.py
│   ├── ml_models/               Trained .pkl classifier files
│   ├── supabase_schema.sql      Full DB schema + RLS policies
│   └── requirements.txt
│
└── Frontend/PhishGuard/
    └── src/
        ├── contexts/
        │   └── AuthContext.tsx  ← FIXED: displayName, avatar_url, email confirm
        ├── pages/
        │   ├── LoginPage.tsx    ← FIXED: Name field, verification banner
        │   ├── SimulationsPage.tsx ← FIXED: Tabbed Simulations + MCQ Activities
        │   ├── DashboardPage.tsx
        │   ├── HistoryPage.tsx
        │   ├── ThreatIntelPage.tsx
        │   └── admin/
        │       ├── AdminStatsPage.tsx
        │       ├── AdminFeedbackPage.tsx
        │       ├── AdminDatasetPage.tsx
        │       ├── AdminSimulationsPage.tsx ← NEW: Simulation CRUD
        │       └── AdminActivitiesPage.tsx  ← NEW: MCQ Quiz CRUD
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx  ← FIXED: Shows avatar photo, email, new admin links
        │   │   └── AppLayout.tsx
        │   └── ui/UIComponents.tsx
        └── lib/
            ├── api.ts           ← FIXED: Simulations response adapter
            ├── supabase.ts      ← FIXED: avatar_url in UserProfile type
            └── sse.ts
```

---

*PhishGuard v4.2.0 — QA Release*
