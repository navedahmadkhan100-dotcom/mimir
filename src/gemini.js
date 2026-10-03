import { GoogleGenAI } from '@google/genai';
import { evaluationSchema } from './schemas.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';

export const MODEL_ID = 'gemini-3.5-flash-lite';

function visualAssetContext(asset) {
  const parts = [
    `VISUAL_ASSET ${asset.id}`,
    `Document: ${asset.id.startsWith('JD-') ? 'JOB DESCRIPTION' : 'CANDIDATE CV'}`,
    asset.sourcePage ? `Source page: ${asset.sourcePage}` : null,
    asset.sourceHint ? `Source hint: ${asset.sourceHint}` : null,
    asset.nearbyText ? `Nearby extracted text: ${asset.nearbyText}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

export class GeminiExtractor {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY (or CV_GEMINI_KEY) is required.');
    this.client = new GoogleGenAI({ apiKey });
  }

  async evaluate(prompt, visualAssets = []) {
    const input = [{ type: 'text', text: prompt }];
    for (const asset of visualAssets) {
      input.push({ type: 'text', text: visualAssetContext(asset) });
      input.push({
        type: 'image',
        mime_type: asset.mimeType || 'image/jpeg',
        data: asset.buffer.toString('base64'),
      });
    }

    const interaction = await this.client.interactions.create({
      model: MODEL_ID,
      store: false,
      system_instruction: SYSTEM_INSTRUCTION,
      input,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: evaluationSchema,
      },
      generation_config: {
        temperature: 0,
        seed: 424242,
        thinking_level: 'minimal',
        max_output_tokens: 20000,
      },
    });

    if (!interaction.output_text) {
      throw new Error('Gemini returned no JSON output.');
    }

    let json;
    try {
      json = JSON.parse(interaction.output_text);
    } catch (error) {
      throw new Error(`Gemini returned invalid JSON: ${error.message}`);
    }

    return {
      json,
      usage: interaction.usage || null,
      interactionId: interaction.id || null,
      model: interaction.model || MODEL_ID,
    };
  }
}
