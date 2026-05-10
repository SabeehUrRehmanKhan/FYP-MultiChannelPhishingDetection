-- ============================================================
-- PhishGuard — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. PROFILES (extends Supabase auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'moderator', 'admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────────
-- 2. SESSIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  metadata    JSONB DEFAULT '{}'
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);


-- ─────────────────────────────────────────────
-- 3. ANALYSES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analyses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID REFERENCES sessions(id) ON DELETE SET NULL,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  input_type     TEXT NOT NULL CHECK (input_type IN ('url','email','web','voice','sms')),
  raw_input      TEXT NOT NULL,
  final_verdict  TEXT CHECK (final_verdict IN ('phishing','legitimate','suspicious','unknown')),
  confidence     FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  channels_run   TEXT[] DEFAULT '{}',
  cascade_skip   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analyses_user_id   ON analyses(user_id);
CREATE INDEX idx_analyses_session   ON analyses(session_id);
CREATE INDEX idx_analyses_verdict   ON analyses(final_verdict);
CREATE INDEX idx_analyses_created   ON analyses(created_at DESC);


-- ─────────────────────────────────────────────
-- 4. FEATURES
-- ⚠️  MODEL CHANGE POINT:
--     features JSONB structure changes per model.
--     No migration needed — JSONB is flexible.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id  UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('url','nlp','web','voice')),
  score        FLOAT NOT NULL,
  features     JSONB NOT NULL DEFAULT '{}',
  model_ver    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_features_analysis ON features(analysis_id);


-- ─────────────────────────────────────────────
-- 5. THREAT INDICATORS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threat_indicators (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('domain','ip','email','phone','url_pattern')),
  value          TEXT NOT NULL,
  threat_score   FLOAT NOT NULL CHECK (threat_score >= 0 AND threat_score <= 1),
  first_seen     TIMESTAMPTZ DEFAULT NOW(),
  last_seen      TIMESTAMPTZ DEFAULT NOW(),
  report_count   INT DEFAULT 1,
  source         TEXT DEFAULT 'ml_model'
                   CHECK (source IN ('user_report','ml_model','admin_manual','feed')),
  verified       BOOLEAN DEFAULT FALSE,
  UNIQUE(indicator_type, value)
);

CREATE INDEX idx_indicators_type_value ON threat_indicators(indicator_type, value);
CREATE INDEX idx_indicators_verified   ON threat_indicators(verified);


-- ─────────────────────────────────────────────
-- 6. CAMPAIGN SIGNALS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id  UUID REFERENCES threat_indicators(id) ON DELETE CASCADE,
  analysis_id   UUID REFERENCES analyses(id) ON DELETE CASCADE,
  signal_type   TEXT CHECK (signal_type IN ('domain_overlap','template_match','ip_cluster','cross_user')),
  evidence      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_indicator ON campaign_signals(indicator_id);
CREATE INDEX idx_campaigns_created   ON campaign_signals(created_at DESC);


-- ─────────────────────────────────────────────
-- 7. FEEDBACK
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  submitted_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_verdict  TEXT NOT NULL CHECK (user_verdict IN ('phishing','legitimate')),
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   UUID REFERENCES profiles(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(analysis_id, submitted_by)
);

CREATE INDEX idx_feedback_status  ON feedback(status);
CREATE INDEX idx_feedback_created ON feedback(created_at ASC);


-- ─────────────────────────────────────────────
-- 8. VERIFIED DATASET
-- ⚠️  MODEL CHANGE POINT:
--     Use GET /dataset/export to download this for ML retraining.
--     features column contains extracted feature vectors snapshot.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verified_dataset (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id  UUID REFERENCES feedback(id),
  analysis_id  UUID REFERENCES analyses(id) ON DELETE SET NULL,
  input_type   TEXT NOT NULL,
  raw_input    TEXT NOT NULL,
  true_label   TEXT NOT NULL CHECK (true_label IN ('phishing','legitimate')),
  features     JSONB,
  approved_by  UUID REFERENCES profiles(id),
  approved_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dataset_label ON verified_dataset(true_label);
CREATE INDEX idx_dataset_type  ON verified_dataset(input_type);


-- ─────────────────────────────────────────────
-- 9. SIMULATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  sim_type        TEXT NOT NULL CHECK (sim_type IN ('email','url','sms','voice')),
  content         JSONB NOT NULL,
  difficulty      TEXT CHECK (difficulty IN ('beginner','intermediate','advanced')),
  explanation     TEXT,
  hints           TEXT[] DEFAULT '{}',
  correct_answer  TEXT DEFAULT 'phishing',
  active          BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_simulations_active ON simulations(active);
CREATE INDEX idx_simulations_type   ON simulations(sim_type);


-- ─────────────────────────────────────────────
-- 10. AWARENESS ACTIVITIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS awareness_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  activity_type TEXT CHECK (activity_type IN ('quiz','drag_drop','spot_the_phish','fill_blank')),
  questions     JSONB NOT NULL DEFAULT '[]',
  difficulty    TEXT CHECK (difficulty IN ('beginner','intermediate','advanced')),
  active        BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- 11. USER PROGRESS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_id    UUID NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('simulation','activity')),
  score         INT,
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  answers       JSONB DEFAULT '{}',
  UNIQUE(user_id, content_id)
);

CREATE INDEX idx_progress_user ON user_progress(user_id);


-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE features          ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_signals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_dataset  ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE awareness_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress     ENABLE ROW LEVEL SECURITY;

-- Profiles: users see only their own
CREATE POLICY "own_profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Sessions: users see only their own
CREATE POLICY "own_sessions" ON sessions
  FOR ALL USING (auth.uid() = user_id);

-- Analyses: users see only their own
CREATE POLICY "own_analyses" ON analyses
  FOR ALL USING (auth.uid() = user_id);

-- Features: users see features of their own analyses
CREATE POLICY "own_features" ON features
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM analyses WHERE analyses.id = features.analysis_id AND analyses.user_id = auth.uid())
  );

-- Threat indicators: all authenticated users can read
CREATE POLICY "read_indicators" ON threat_indicators
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Admin-only write on threat indicators
CREATE POLICY "admin_write_indicators" ON threat_indicators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Feedback: users see their own, moderators see all
CREATE POLICY "own_feedback" ON feedback
  FOR SELECT USING (
    auth.uid() = submitted_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "insert_feedback" ON feedback
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

-- Verified dataset: moderator+ only
CREATE POLICY "moderator_dataset" ON verified_dataset
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

-- Simulations: authenticated users can read active ones
CREATE POLICY "read_active_simulations" ON simulations
  FOR SELECT USING (active = TRUE AND auth.uid() IS NOT NULL);

CREATE POLICY "admin_manage_simulations" ON simulations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Activities: same as simulations
CREATE POLICY "read_active_activities" ON awareness_activities
  FOR SELECT USING (active = TRUE AND auth.uid() IS NOT NULL);

CREATE POLICY "admin_manage_activities" ON awareness_activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- User progress: own records only
CREATE POLICY "own_progress" ON user_progress
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 12. STORAGE BUCKETS
-- ============================================================

-- Create a bucket for screenshots
INSERT INTO storage.buckets (id, name, public) 
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to screenshots
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'screenshots');

-- Allow authenticated users to upload screenshots
CREATE POLICY "Auth Uploads" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'screenshots' 
    AND auth.role() = 'authenticated'
);
