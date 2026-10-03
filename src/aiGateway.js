import { GeminiExtractor, MODEL_ID as GEMINI_MODEL_ID } from './gemini.js';

export const AI_GATEWAY_VERSION = '4.0.0-provider-gateway';

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

  async evaluate(prompt, visualAssets = []) {
    const result = await this.adapter.evaluate(prompt, visualAssets);
    return { ...result, provider:this.provider, gatewayVersion:AI_GATEWAY_VERSION };
  }
}
