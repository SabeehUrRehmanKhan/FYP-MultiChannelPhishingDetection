const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface SSEChannelResult {
  channel: string;
  score: number;
  verdict: string;
  confidence: number;
  features: Record<string, unknown>;
  cascade_skipped: boolean;
  processing_time_ms: number;
  screenshot_url?: string;
}

export interface SSEThreatHit {
  indicator_type: string;
  value: string;
  threat_score: number;
  verified: boolean;
  report_count: number;
}

export interface SSECorrelation {
  level: string;
  signal_type: string;
  evidence: unknown;
  affected_domains: string[];
}

export interface SSEFinalVerdict {
  verdict: string;
  confidence: number;
  analysis_id: string;
  channels_run: string[];
  total_time_ms: number;
  cascade_skipped: boolean;
  screenshot_evidence?: {
    screenshot_url?: string;
    annotated_screenshot_url?: string;
    dom_features: Record<string, unknown>;
    brand_signals: Record<string, unknown>;
    suspicious_elements: Array<{ selector: string; reason: string; severity: string }>;
    redirect_chain: string[];
    ssl_valid: boolean;
  };
  voice_analysis?: {
    analysis_type: string;
    verdict_label: string;
    duration_sec: number;
    scores: { acoustic_clarity: number; prosody_analysis: number; neural_transformer: number };
    acoustic_rules_hit: string[];
    fake_segments: Array<{ start: string; end: string; probability: number }>;
  };
}

export interface SSEError {
  channel: string;
  message: string;
  recoverable: boolean;
}

export type SSEEventHandler = {
  onChannelResult?: (data: SSEChannelResult) => void;
  onThreatHit?: (data: SSEThreatHit) => void;
  onCorrelation?: (data: SSECorrelation) => void;
  onFinalVerdict?: (data: SSEFinalVerdict) => void;
  onError?: (data: SSEError) => void;
  onDone?: () => void;
};

export async function streamAnalysis(
  input: string,
  type: string,
  token: string,
  handlers: SSEEventHandler,
  file?: File,
  signal?: AbortSignal
): Promise<void> {
  const formData = new FormData();
  formData.append('input', input);
  formData.append('type', type);
  if (file) {
    formData.append('file', file);
  }

  const response = await fetch(`${API_BASE}/analyze/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    signal,
  });

  if (!response.ok) throw new Error(`SSE error: ${response.status}`);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) { handlers.onDone?.(); break; }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.replace('event:', '').trim();
      } else if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.replace('data:', '').trim());
          switch (currentEvent) {
            case 'channel_result':      handlers.onChannelResult?.(data); break;
            case 'threat_indicator_hit': handlers.onThreatHit?.(data); break;
            case 'correlation_update':  handlers.onCorrelation?.(data); break;
            case 'final_verdict':       handlers.onFinalVerdict?.(data); break;
            case 'error':               handlers.onError?.(data); break;
          }
        } catch { /* ignore parse errors */ }
        currentEvent = '';
      }
    }
  }
}
