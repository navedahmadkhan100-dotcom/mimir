import { GoogleGenAI } from '@google/genai';
import { JD_SYSTEM_INSTRUCTION, EVALUATION_SYSTEM_INSTRUCTION } from './prompt.js';
import { normalizeJdTransport } from './transportNormalize.js';

export const MODEL_ID = 'gemini-3.5-flash-lite';

function visualAssetContext(asset) {
  return [
    `VISUAL_ASSET ${asset.id}`,
    `Document: ${asset.id.startsWith('JD-') ? 'JOB DESCRIPTION' : 'CANDIDATE CV'}`,
    asset.sourcePage ? `Source page: ${asset.sourcePage}` : null,
    asset.sourceHint ? `Source hint: ${asset.sourceHint}` : null,
    asset.nearbyText ? `Nearby extracted text: ${asset.nearbyText}` : null,
  ].filter(Boolean).join('\n');
}

function parseJsonText(text, label) {
  const raw=String(text||'').trim();
  if(!raw) throw new Error(`Gemini returned no ${label} JSON output.`);
  const unfenced=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  const attempts=[unfenced];
  const start=unfenced.indexOf('{'), end=unfenced.lastIndexOf('}');
  if(start>=0 && end>start) attempts.push(unfenced.slice(start,end+1));
  for(const candidate of attempts){
    try { return JSON.parse(candidate); } catch {}
    // JSON-mode outputs can occasionally contain harmless trailing commas.
    // Repair only that unambiguous serialization defect; never infer content.
    try { return JSON.parse(candidate.replace(/,\s*([}\]])/g,'$1')); } catch {}
  }
  throw new Error(`Gemini returned invalid ${label} JSON.`);
}

function providerDetail(error){
  const status=error?.status ?? error?.response?.status ?? error?.code ?? null;
  const message=error?.error?.message || error?.response?.data?.error?.message || error?.message || 'Unknown provider error';
  const providerStatus=error?.error?.status || error?.response?.data?.error?.status || '';
  return {status,message:String(message),providerStatus:String(providerStatus)};
}
function retryableTransportFailure(error){
  const {status,message,providerStatus}=providerDetail(error);
  const detail=`${status||''} ${message} ${providerStatus}`.toLowerCase();
  return status===400 || status===408 || status===422 || [500,502,503,504].includes(Number(status)) ||
    detail.includes('invalid_argument') || detail.includes('invalid argument') || detail.includes('invalid json') ||
    detail.includes('returned invalid') || detail.includes('unavailable') || detail.includes('request timeout');
}

export class GeminiExtractor {
  constructor(apiKey){
    if(!apiKey) throw new Error('GEMINI_API_KEY (or CV_GEMINI_KEY) is required.');
    this.client=new GoogleGenAI({apiKey});
  }

  async interactionJson({prompt,visualAssets,systemInstruction,maxTokens,label,normalizer=(x)=>x,timeoutMs=45_000}){
    const input=[{type:'text',text:prompt}];
    for(const asset of visualAssets){
      input.push({type:'text',text:visualAssetContext(asset)});
      input.push({type:'image',mime_type:asset.mimeType||'image/jpeg',data:asset.buffer.toString('base64')});
    }
    const interaction=await this.client.interactions.create({
      model:MODEL_ID,store:false,system_instruction:systemInstruction,input,
      // Current Interactions output-format contract: request JSON text without
      // a provider-side schema. Mimir validates/reconstructs the rich structure
      // locally, avoiding deep-schema INVALID_ARGUMENT failures.
      response_format:{type:'text',mime_type:'application/json'},
      generation_config:{max_output_tokens:maxTokens},
    }, { timeout_ms:timeoutMs });
    return {json:normalizer(parseJsonText(interaction.output_text,label)),usage:interaction.usage||null,interactionId:interaction.id||null,model:interaction.model||MODEL_ID};
  }

  async generateJson({prompt,visualAssets,systemInstruction,maxTokens,label,normalizer=(x)=>x,jsonMime=true,timeoutMs=35_000}){
    const contents=[{text:prompt}];
    for(const asset of visualAssets){
      contents.push({text:visualAssetContext(asset)});
      contents.push({inlineData:{mimeType:asset.mimeType||'image/jpeg',data:asset.buffer.toString('base64')}});
    }
    const config={systemInstruction,maxOutputTokens:maxTokens,httpOptions:{timeout:timeoutMs}};
    if(jsonMime) config.responseMimeType='application/json';
    const response=await this.client.models.generateContent({model:MODEL_ID,contents,config});
    return {json:normalizer(parseJsonText(response.text,label)),usage:response.usageMetadata||null,interactionId:null,model:MODEL_ID};
  }

  /**
   * Transport invariant: Mimir never sends its internal JD schema to Google.
   * Richness belongs to the prompt + local normalizer/AJV, not provider schema
   * complexity.  This removes the class of 400 errors caused by deep schemas.
   */
  async structureJd(prompt,visualAssets=[]){
    try {
      const out=await this.interactionJson({prompt,visualAssets,systemInstruction:JD_SYSTEM_INSTRUCTION,maxTokens:7000,label:'JD structure',normalizer:normalizeJdTransport});
      return {...out,transport:'interactions-prompt-json-local-validation'};
    } catch(error){
      if(!retryableTransportFailure(error)) throw error;
      const d=providerDetail(error); console.warn(`[Mimir AI] JD primary transport failed (${d.status||'n/a'} ${d.providerStatus||''}): ${d.message}. Trying JSON MIME fallback.`);
    }
    try {
      const out=await this.generateJson({prompt,visualAssets,systemInstruction:JD_SYSTEM_INSTRUCTION,maxTokens:7000,label:'JD structure',normalizer:normalizeJdTransport,jsonMime:true,timeoutMs:35_000});
      return {...out,transport:'generateContent-json-local-validation-fallback'};
    } catch(error){
      if(!retryableTransportFailure(error)) throw error;
      const d=providerDetail(error); console.warn(`[Mimir AI] JD JSON MIME fallback failed (${d.status||'n/a'} ${d.providerStatus||''}): ${d.message}. Trying plain-text JSON fallback.`);
      const out=await this.generateJson({prompt,visualAssets,systemInstruction:JD_SYSTEM_INSTRUCTION,maxTokens:7000,label:'JD structure',normalizer:normalizeJdTransport,jsonMime:false,timeoutMs:20_000});
      return {...out,transport:'generateContent-plain-json-local-validation-fallback'};
    }
  }

  /** Candidate evaluation uses the same schema-free transport principle. */
  async evaluate(prompt,visualAssets=[]){
    try {
      const out=await this.interactionJson({prompt,visualAssets,systemInstruction:EVALUATION_SYSTEM_INSTRUCTION,maxTokens:12000,label:'evaluation'});
      return {...out,transport:'interactions-prompt-json-local-validation'};
    } catch(error){
      if(!retryableTransportFailure(error)) throw error;
      const d=providerDetail(error); console.warn(`[Mimir AI] CV primary transport failed (${d.status||'n/a'} ${d.providerStatus||''}): ${d.message}. Trying JSON MIME fallback.`);
    }
    try {
      const out=await this.generateJson({prompt,visualAssets,systemInstruction:EVALUATION_SYSTEM_INSTRUCTION,maxTokens:12000,label:'evaluation',jsonMime:true,timeoutMs:35_000});
      return {...out,transport:'generateContent-json-local-validation-fallback'};
    } catch(error){
      if(!retryableTransportFailure(error)) throw error;
      const d=providerDetail(error); console.warn(`[Mimir AI] CV JSON MIME fallback failed (${d.status||'n/a'} ${d.providerStatus||''}): ${d.message}. Trying plain-text JSON fallback.`);
      const out=await this.generateJson({prompt,visualAssets,systemInstruction:EVALUATION_SYSTEM_INSTRUCTION,maxTokens:12000,label:'evaluation',jsonMime:false,timeoutMs:20_000});
      return {...out,transport:'generateContent-plain-json-local-validation-fallback'};
    }
  }
}
