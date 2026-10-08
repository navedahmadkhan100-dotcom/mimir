import { GeminiExtractor, MODEL_ID as GEMINI_MODEL_ID } from './gemini.js';

export const AI_GATEWAY_VERSION = '6.0.0-schema-free-resilient-transport';

export class AITimeoutError extends Error {
  constructor(stage, durationMs) {
    super(`Gemini ${stage} exceeded the ${Math.round(durationMs / 1000)}-second request deadline. If this is a new JD, run “Understand this JD” first, then evaluate the CV. You can retry once after checking Render logs.`);
    this.name = 'AITimeoutError';
    this.code = 'AI_TIMEOUT';
    this.stage = stage;
    this.timeoutMs = durationMs;
  }
}

export class AIGateway {
  constructor(env = process.env) {
    this.provider = String(env.AI_PROVIDER || 'gemini').toLowerCase();
    this.env = env;
    if (this.provider !== 'gemini') {
      throw new Error(`Unsupported AI_PROVIDER "${this.provider}". This build ships the Gemini adapter; add another adapter without changing Mimir's evidence/scoring layers.`);
    }
    this.adapter = new GeminiExtractor(env.GEMINI_API_KEY || env.CV_GEMINI_KEY);
  }

  get modelId() { return this.provider === 'gemini' ? GEMINI_MODEL_ID : 'unknown'; }

  async withTimeout(operation, stage = 'evaluation') {
    const raw = Number(this.env.AI_TIMEOUT_MS || 105_000);
    const timeoutMs = Number.isFinite(raw) ? Math.max(10_000, Math.min(180_000, raw)) : 105_000;
    const startedAt = Date.now();
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new AITimeoutError(stage, timeoutMs)), timeoutMs);
          timer.unref?.();
        }),
      ]);
      console.info(`[Mimir AI] ${stage} completed in ${Date.now() - startedAt}ms`);
      return result;
    } catch (error) {
      const providerStatus = error?.status || error?.response?.status || error?.code || error?.name || 'Error';
      const providerMessage = String(error?.error?.message || error?.response?.data?.error?.message || error?.message || '')
        .replace(/\s+/g, ' ').slice(0, 700);
      const providerReason = String(error?.error?.status || error?.response?.data?.error?.status || error?.statusText || '')
        .replace(/\s+/g, ' ').slice(0, 200);
      console.warn(`[Mimir AI] ${stage} failed after ${Date.now() - startedAt}ms; type=${providerStatus}; reason=${providerReason || 'n/a'}; message=${providerMessage}`);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async structureJd(prompt, visualAssets = []) {
    const result = await this.withTimeout(() => this.adapter.structureJd(prompt, visualAssets), 'JD analysis');
    return { ...result, provider:this.provider, gatewayVersion:AI_GATEWAY_VERSION };
  }

  async evaluate(prompt, visualAssets = []) {
    const result = await this.withTimeout(() => this.adapter.evaluate(prompt, visualAssets), 'CV evaluation');
    return { ...result, provider:this.provider, gatewayVersion:AI_GATEWAY_VERSION };
  }
}
