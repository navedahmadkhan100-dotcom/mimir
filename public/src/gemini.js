import { GoogleGenAI } from '@google/genai';
import { evaluationSchema } from './schemas.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';

export const MODEL_ID = 'gemini-3.5-flash-lite';

export class GeminiExtractor {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY (or CV_GEMINI_KEY) is required.');
    this.client = new GoogleGenAI({ apiKey });
  }

  async evaluate(prompt) {
    const interaction = await this.client.interactions.create({
      model: MODEL_ID,
      store: false,
      system_instruction: SYSTEM_INSTRUCTION,
      input: prompt,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: evaluationSchema,
      },
      generation_config: {
        temperature: 0,
        seed: 424242,
        thinking_level: 'minimal',
        max_output_tokens: 16000,
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
