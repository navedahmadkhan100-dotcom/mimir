import { GoogleGenAI } from '@google/genai';
import { jdIntelligenceGenerationSchema, providerSafeEvaluationSchema } from './schemas.js';
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

function parseJsonText(text, label) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error(`Gemini returned no ${label} JSON output.`);
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch (firstError) {
    // Prompt-only JSON fallback (used only if a provider rejects JSON mode):
    // tolerate a short accidental preamble/fence without changing semantics.
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(unfenced.slice(start, end + 1)); } catch {}
    }
    throw new Error(`Gemini returned invalid ${label} JSON: ${firstError.message}`);
  }
}

function invalidArgument(error) {
  const status = error?.status ?? error?.response?.status ?? error?.code;
  const detail = [
    status,
    error?.message,
    error?.error?.message,
    error?.error?.status,
    error?.response?.data?.error?.message,
    error?.response?.data?.error?.status,
  ].filter(Boolean).join(' ').toLowerCase();
  return status === 400 || detail.includes('invalid_argument') || detail.includes('invalid argument');
}

export class GeminiExtractor {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY (or CV_GEMINI_KEY) is required.');
    this.client = new GoogleGenAI({ apiKey });
  }

  // JD compilation remains on Interactions structured output because the JD
  // schema is smaller and proven to be accepted. Candidate evaluation uses a
  // different transport below so Google's schema parser never sees Mimir's
  // much deeper evidence graph schema.
  async structureJd(prompt, visualAssets = []) {
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
      system_instruction: JD_SYSTEM_INSTRUCTION,
      input,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: jdIntelligenceGenerationSchema,
      },
      generation_config: {
        max_output_tokens: 9000,
      },
    });

    return {
      json: parseJsonText(interaction.output_text, 'JD structure'),
      usage: interaction.usage || null,
      interactionId: interaction.id || null,
      model: interaction.model || MODEL_ID,
      transport: 'interactions-structured',
    };
  }

  async evaluate(prompt, visualAssets = []) {
    // Primary path: use a shallow provider-safe schema on Interactions. This keeps
    // Gemini structurally anchored (especially text-vs-visual provenance and
    // dimension rows) without exposing Mimir's deeply nested authoritative schema.
    const input = [{ type: 'text', text: prompt }];
    for (const asset of visualAssets) {
      input.push({ type: 'text', text: visualAssetContext(asset) });
      input.push({
        type: 'image',
        mime_type: asset.mimeType || 'image/jpeg',
        data: asset.buffer.toString('base64'),
      });
    }

    try {
      const interaction = await this.client.interactions.create({
        model: MODEL_ID,
        store: false,
        system_instruction: EVALUATION_SYSTEM_INSTRUCTION,
        input,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: providerSafeEvaluationSchema,
        },
        generation_config: { max_output_tokens: 14000 },
      });
      return {
        json: parseJsonText(interaction.output_text, 'evaluation'),
        usage: interaction.usage || null,
        interactionId: interaction.id || null,
        model: interaction.model || MODEL_ID,
        transport: 'interactions-flat-structured-ajv',
      };
    } catch (structuredError) {
      if (!invalidArgument(structuredError)) throw structuredError;
      console.warn('[Mimir AI] Flat structured CV transport rejected; switching to JSON MIME transport.');
    }

    const contents = [{ text: prompt }];
    for (const asset of visualAssets) {
      contents.push({ text: visualAssetContext(asset) });
      contents.push({
        inlineData: {
          mimeType: asset.mimeType || 'image/jpeg',
          data: asset.buffer.toString('base64'),
        },
      });
    }

    try {
      const response = await this.client.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: EVALUATION_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          maxOutputTokens: 14000,
        },
      });
      return {
        json: parseJsonText(response.text, 'evaluation'),
        usage: response.usageMetadata || null,
        interactionId: null,
        model: MODEL_ID,
        transport: 'generateContent-json-local-ajv-fallback',
      };
    } catch (error) {
      if (!invalidArgument(error)) throw error;
      console.warn('[Mimir AI] JSON MIME CV transport rejected; switching to schema-free Interactions fallback.');
      const interaction = await this.client.interactions.create({
        model: MODEL_ID,
        store: false,
        system_instruction: EVALUATION_SYSTEM_INSTRUCTION,
        input,
        generation_config: { max_output_tokens: 14000 },
      });
      return {
        json: parseJsonText(interaction.output_text, 'evaluation'),
        usage: interaction.usage || null,
        interactionId: interaction.id || null,
        model: interaction.model || MODEL_ID,
        transport: 'interactions-prompt-json-local-ajv-fallback',
      };
    }
  }}
