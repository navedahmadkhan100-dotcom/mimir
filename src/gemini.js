import { GoogleGenAI } from '@google/genai';
import { warmEvaluationSchema, jdIntelligenceGenerationSchema } from './schemas.js';
import { JD_SYSTEM_INSTRUCTION, EVALUATION_SYSTEM_INSTRUCTION } from './prompt.js';

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

function parseJsonOutput(interaction, label) {
  if (!interaction.output_text) throw new Error(`Gemini returned no ${label} JSON output.`);
  try {
    return JSON.parse(interaction.output_text);
  } catch (error) {
    throw new Error(`Gemini returned invalid ${label} JSON: ${error.message}`);
  }
}

export class GeminiExtractor {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY (or CV_GEMINI_KEY) is required.');
    this.client = new GoogleGenAI({ apiKey });
  }

  async runInteraction(prompt, visualAssets, schema, systemInstruction, maxOutputTokens) {
    const input = [{ type: 'text', text: prompt }];
    for (const asset of visualAssets) {
      input.push({ type: 'text', text: visualAssetContext(asset) });
      input.push({
        type: 'image',
        mime_type: asset.mimeType || 'image/jpeg',
        data: asset.buffer.toString('base64'),
      });
    }

    return this.client.interactions.create({
      model: MODEL_ID,
      store: false,
      system_instruction: systemInstruction,
      input,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema,
      },
      // Gemini 3.5 Flash-Lite defaults to minimal thinking. Avoid deprecated
      // sampling controls (temperature/top_p/top_k), which newer Gemini 3.x
      // API revisions can reject with HTTP 400 INVALID_ARGUMENT.
      generation_config: {
        max_output_tokens: maxOutputTokens,
      },
    });
  }

  async structureJd(prompt, visualAssets = []) {
    const interaction = await this.runInteraction(prompt, visualAssets, jdIntelligenceGenerationSchema, JD_SYSTEM_INSTRUCTION, 9000);
    return {
      json: parseJsonOutput(interaction, 'JD structure'),
      usage: interaction.usage || null,
      interactionId: interaction.id || null,
      model: interaction.model || MODEL_ID,
    };
  }

  async evaluate(prompt, visualAssets = []) {
    const interaction = await this.runInteraction(prompt, visualAssets, warmEvaluationSchema, EVALUATION_SYSTEM_INSTRUCTION, 14000);
    return {
      json: parseJsonOutput(interaction, 'evaluation'),
      usage: interaction.usage || null,
      interactionId: interaction.id || null,
      model: interaction.model || MODEL_ID,
    };
  }
}
