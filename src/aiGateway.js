import { GeminiExtractor, MODEL_ID as GEMINI_MODEL_ID } from './gemini.js';

export const AI_GATEWAY_VERSION = '4.4.0-provider-gateway-timeout';

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

  async withTimeout(operation) {
    const timeoutMs = Math.max(10_000, Math.min(120_000, Number(this.env.AI_TIMEOUT_MS || 75_000)));
    let timer;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('AI evaluation timed out. Please retry.')), timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async structureJd(prompt, visualAssets = []) {
    const result = await this.withTimeout(() => this.adapter.structureJd(prompt, visualAssets));
    return { ...result, provider:this.provider, gatewayVersion:AI_GATEWAY_VERSION };
  }

  async evaluate(prompt, visualAssets = []) {
    const result = await this.withTimeout(() => this.adapter.evaluate(prompt, visualAssets));
    return { ...result, provider:this.provider, gatewayVersion:AI_GATEWAY_VERSION };
  }
}
