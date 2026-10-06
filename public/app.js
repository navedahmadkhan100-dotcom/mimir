
const MIMIR_API_BASE = String(window.MIMIR_CONFIG?.apiBase || '').replace(/\/$/, '');
const MIMIR_MAX_API_PAYLOAD_BYTES = Number(window.MIMIR_CONFIG?.maxApiPayloadBytes || 4_000_000);
const MIMIR_MAX_JD_CHARS = Number(window.MIMIR_CONFIG?.maxJdChars || 150_000);
const MIMIR_MAX_CV_CHARS = Number(window.MIMIR_CONFIG?.maxCvChars || 250_000);
const MIMIR_SERVER_UI_EXPORT = window.MIMIR_CONFIG?.serverUiExport !== false;
function apiUrl(path) {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${MIMIR_API_BASE}${path}`;
}

const $ = (id) => document.getElementById(id);
const SAVED_JD_STORAGE_VERSION = 'mimir-v2.0.0'; // Preserve the user's existing browser JD vault.
const ENGINE_CACHE_VERSION = 'mimir-v4.6.0-jd-intelligence';
const JD_PROFILE_VERSION = '4.6.0-jd-first-adaptive';
const STORAGE = {
  savedJds: `${SAVED_JD_STORAGE_VERSION}:saved-jds`,
  jdStructures: `${ENGINE_CACHE_VERSION}:jd-structures`,
  evidenceIntelligence: 'mimir-v4.0:evidence-intelligence',
  humanReviews: 'mimir-v4.0:human-reviews',
};

const state = {
  jdFile: null,
  cvFile: null,
  result: null,
  currentJdHash: null,
  loadedSavedJd: null,
  jdDocumentIntel: null,
  cvDocumentIntel: null,
  jdVisualAssets: [],
  cvVisualAssets: [],
  jdVisualPromise: null,
  cvVisualPromise: null,
  jdVisualStatus: 'idle',
  cvVisualStatus: 'idle',
  jdVisualGeneration: 0,
  cvVisualGeneration: 0,
  isEvaluating: false,
  isAnalyzingJd: false,
  abortController: null,
  runtimeMeta: { scoringVersion: 'unknown', promptVersion: 'unknown', referenceYear: 'unknown', model: 'unknown' },
};

function readStore(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    showToast('Browser storage is full or unavailable. The app will continue without local saving.');
    return false;
  }
}

function persistEvidenceIntelligence(result) {
  const record = result?.evidenceIntelligence;
  if (!record?.observations?.length) return;
  const store = readStore(STORAGE.evidenceIntelligence, { version: record.schema_version || 'unknown', totalEvaluations: 0, totalObservations: 0, patterns: {} });
  store.version = record.schema_version || store.version;
  store.totalEvaluations = Number(store.totalEvaluations || 0) + 1;
  for (const obs of record.observations) {
    const key = [obs.requirement_type, obs.strictness, obs.relation, obs.final_state, obs.source_type, obs.action_type, obs.ownership, obs.has_scale ? 'scale' : 'no-scale', obs.policy_decision].join('|');
    const current = store.patterns[key] || {
      requirementType: obs.requirement_type, strictness: obs.strictness, relation: obs.relation,
      finalState: obs.final_state, sourceType: obs.source_type, actionType: obs.action_type,
      ownership: obs.ownership, hasScale: Boolean(obs.has_scale), policyDecision: obs.policy_decision,
      observations: 0, verifiedSupported: 0, verifiedNotSupported: 0, stillUncertain: 0,
    };
    current.observations += 1;
    store.patterns[key] = current;
    store.totalObservations = Number(store.totalObservations || 0) + 1;
  }
  writeStore(STORAGE.evidenceIntelligence, store);
}

function storeHumanResolution(questionId, resolution) {
  if (!state.result?.auditId || !questionId) return;
  const reviews = readStore(STORAGE.humanReviews, {});
  reviews[state.result.auditId] ||= {};
  const previous = reviews[state.result.auditId][questionId]?.resolution || '';
  if (previous === resolution) return;
  reviews[state.result.auditId][questionId] = { resolution, updatedAt: new Date().toISOString() };
  writeStore(STORAGE.humanReviews, reviews);

  const question = (state.result.nextBestVerificationQuestions || []).find((q) => q.id === questionId);
  if (!question) return;
  const intel = readStore(STORAGE.evidenceIntelligence, null);
  if (!intel?.patterns) return;
  const field = (value) => ({
    verified_supported: 'verifiedSupported',
    verified_not_supported: 'verifiedNotSupported',
    still_uncertain: 'stillUncertain',
  })[value];
  const relevant = (state.result.evidenceIntelligence?.observations || []).filter((o) => o.requirement_id === question.requirement_id);
  for (const obs of relevant) {
    const key = [obs.requirement_type, obs.strictness, obs.relation, obs.final_state, obs.source_type, obs.action_type, obs.ownership, obs.has_scale ? 'scale' : 'no-scale', obs.policy_decision].join('|');
    const pattern = intel.patterns[key]; if (!pattern) continue;
    const previousField = field(previous);
    const nextField = field(resolution);
    if (previousField) pattern[previousField] = Math.max(0, Number(pattern[previousField] || 0) - 1);
    if (nextField) pattern[nextField] = Number(pattern[nextField] || 0) + 1;
  }
  writeStore(STORAGE.evidenceIntelligence, intel);
}

function normalizeText(value = '') {
  return String(value).replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function sha256Bytes(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(text) {
  return sha256Bytes(new TextEncoder().encode(String(text)));
}

async function fingerprintFile(file) {
  return sha256Bytes(await file.arrayBuffer());
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function humanize(value = '') {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(value = '', size = 62) {
  const text = String(value).trim();
  return text.length > size ? `${text.slice(0, size - 1)}…` : text;
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function showError(message) {
  $('formError').textContent = message;
  $('formError').classList.remove('hidden');
}

function clearError() {
  $('formError').classList.add('hidden');
  $('formError').textContent = '';
}

function setLoading(loading) {
  state.isEvaluating = loading;
  const button = $('evaluateBtn');
  const arrow = button.querySelector('.button-arrow');
  button.disabled = false;
  button.classList.toggle('cancel-mode', loading);
  button.classList.toggle('is-loading', loading);
  button.setAttribute('aria-busy', String(loading));
  button.setAttribute('aria-label', loading ? 'Cancel evaluation' : 'Find the Worthiness — evaluate the CV against this JD');
  button.title = loading ? 'Cancel evaluation' : 'Find the Worthiness';
  $('evaluateBtnText').innerHTML = loading ? 'Cancel' : 'Find<br>the<br>Worthiness';
  if (arrow) arrow.textContent = loading ? '×' : '↗';
  document.body.classList.toggle('is-evaluating', loading);

  if (loading) {
    $('emptyState').classList.add('hidden');
    $('results').classList.add('hidden');
    if ($('loadingState')) $('loadingState').classList.add('hidden');
    return;
  }

  if ($('loadingState')) $('loadingState').classList.add('hidden');
  if (state.result) {
    $('results').classList.remove('hidden');
    $('emptyState').classList.add('hidden');
    document.body.classList.add('has-results');
  } else {
    $('results').classList.add('hidden');
    $('emptyState').classList.remove('hidden');
    document.body.classList.remove('has-results');
  }
}

function invalidateResult() {
  if (state.isEvaluating) state.abortController?.abort();
  state.result = null;
  $('results').classList.add('hidden');
  if ($('loadingState')) $('loadingState').classList.add('hidden');
  $('emptyState').classList.remove('hidden');
  document.body.classList.remove('has-results', 'is-evaluating');
}

function setFileRemoveVisibility(kind, visible) {
  const button = $(kind === 'cv' ? 'removeCvFileBtn' : 'removeJdFileBtn');
  if (button) button.classList.toggle('hidden', !visible);
}

function detachUploadedSource(kind, { edited = false } = {}) {
  const isCv = kind === 'cv';
  if (isCv) {
    const hadSource = Boolean(state.cvFile);
    state.cvFile = null;
    state.cvDocumentIntel = null;
    state.cvVisualAssets = [];
    state.cvVisualPromise = null;
    state.cvVisualStatus = 'idle';
    state.cvVisualGeneration += 1;
    $('cvFile').value = '';
    $('cvFileName').textContent = edited && hadSource
      ? 'Visual source detached after text edit · re-upload to restore diagrams'
      : 'Drop CV or browse';
    renderDocumentIntel('cv', null);
    setFileRemoveVisibility('cv', false);
    return hadSource;
  }

  const hadSource = Boolean(state.jdFile);
  state.jdFile = null;
  state.jdDocumentIntel = null;
  state.jdVisualAssets = [];
  state.jdVisualPromise = null;
  state.jdVisualStatus = 'idle';
  state.jdVisualGeneration += 1;
  $('jdFile').value = '';
  $('jdFileName').textContent = edited && hadSource
    ? 'Visual source detached after text edit · re-upload to restore diagrams'
    : 'Drop JD or browse';
  renderDocumentIntel('jd', null);
  setFileRemoveVisibility('jd', false);
  return hadSource;
}

async function removeUploadedFile(kind) {
  clearError();
  invalidateResult();
  const isCv = kind === 'cv';
  detachUploadedSource(kind);
  if (isCv) {
    $('cvText').value = '';
    $('cvText').classList.remove('is-redacted');
    const transparency = $('cvTransparency');
    if (transparency) transparency.textContent = 'Drop a file to preview the redacted text channel. Text becomes ready first; diagrams and charts prepare in the background as a separate evidence channel.';
    showToast('CV file and extracted text removed.');
  } else {
    $('jdText').value = '';
    state.loadedSavedJd = null;
    state.currentJdHash = null;
    await refreshJdCacheState();
    showToast('JD file and extracted text removed.');
  }
}

function validateFile(file) {
  if (!file) return false;
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    showError('Use a PDF, DOCX or TXT file.');
    return false;
  }
  if (file.size > 8 * 1024 * 1024) {
    showError('File is larger than 8 MB.');
    return false;
  }
  return true;
}

function renderDocumentIntel(kind, intel = null) {
  const element = $(kind === 'cv' ? 'cvDocumentIntel' : 'jdDocumentIntel');
  if (!element) return;
  if (!intel) {
    element.classList.add('hidden');
    element.innerHTML = '';
    return;
  }
  const bits = [];
  if (intel.pageCount) bits.push(`${intel.pageCount} page${intel.pageCount === 1 ? '' : 's'}`);
  bits.push(`${Number(intel.nativeTextCharacters || 0).toLocaleString()} text chars`);
  const detected = Number(intel.visualCandidatesDetected || 0);
  const prepared = Number(intel.visualAssetsPrepared || 0);
  const withheld = Number(intel.visualAssetsWithheld || 0);
  bits.push(`${detected} visual candidate${detected === 1 ? '' : 's'}`);
  if (prepared) bits.push(`${prepared} visual asset${prepared === 1 ? '' : 's'} analysed`);
  if (withheld) bits.push(`${withheld} withheld by privacy gate`);
  const mode = detected > 0 ? 'Text + visual document' : 'Text-only document';
  const privacy = kind === 'cv' && Number(intel.visualCandidatesDetected || 0) > 0
    ? (intel.format === 'docx'
      ? 'Direct CV text identifiers are redacted locally; DOCX technical visuals use the fast no-OCR path in Practical PII mode.'
      : 'Visuals are privacy-scrubbed locally before model analysis.')
    : kind === 'jd' && Number(intel.visualCandidatesDetected || 0) > 0
      ? 'JD diagrams/charts will be included on the first evaluation.'
      : 'No substantive visual artefacts detected.';
  element.innerHTML = `<strong>${escapeHtml(mode)}</strong><span>${escapeHtml(bits.join(' · '))}</span><em>${escapeHtml(privacy)}</em>`;
  element.classList.remove('hidden');
}

async function startVisualPreparation(file, kind, textData) {
  const isCv = kind === 'cv';
  const promiseKey = isCv ? 'cvVisualPromise' : 'jdVisualPromise';
  const statusKey = isCv ? 'cvVisualStatus' : 'jdVisualStatus';
  const generationKey = isCv ? 'cvVisualGeneration' : 'jdVisualGeneration';
  const assetsKey = isCv ? 'cvVisualAssets' : 'jdVisualAssets';
  const intelKey = isCv ? 'cvDocumentIntel' : 'jdDocumentIntel';
  const label = isCv ? $('cvFileName') : $('jdFileName');
  const transparency = $('cvTransparency');

  const generation = state[generationKey] + 1;
  state[generationKey] = generation;
  state[statusKey] = 'processing';
  state[assetsKey] = [];

  const preparation = window.MimirDocumentClient.prepareVisuals(file, kind, textData, {
    onAsset: (asset, preparedCount = null, detectedCount = null) => {
      if (state[generationKey] !== generation) return;
      if (!state[assetsKey].some((item) => item.id === asset.id)) state[assetsKey].push(asset);
      const prepared = Number(preparedCount || state[assetsKey].length || 0);
      const detected = Number(detectedCount || state[intelKey]?.visualCandidatesDetected || prepared);
      state[intelKey] = {
        ...(state[intelKey] || {}),
        visualCandidatesDetected:detected,
        visualAssetsPrepared:prepared,
        mode:prepared > 0 ? 'text+visual' : (detected > 0 ? 'text+visual-pending' : 'text-only'),
        visualStatus:'preparing',
      };
      label.textContent = `${file.name} · text ready · visuals ${prepared}/${detected} prepared…`;
      renderDocumentIntel(kind, state[intelKey]);
    },
  }).then((visualData) => {
    if (state[generationKey] !== generation) return null;
    state[assetsKey] = visualData.visualAssets || state[assetsKey] || [];
    state[intelKey] = visualData.documentIntelligence || state[intelKey];
    state[statusKey] = 'ready';
    label.textContent = `${file.name} · local only`;
    renderDocumentIntel(kind, state[intelKey]);

    if (isCv && transparency) {
      const prepared = Number(state[intelKey]?.visualAssetsPrepared || 0);
      const withheld = Number(state[intelKey]?.visualAssetsWithheld || 0);
      transparency.innerHTML = `<strong>Basic PII redaction applied.</strong> CV text is ready and ${prepared} diagram/chart visual${prepared === 1 ? '' : 's'} prepared locally.${withheld ? ` ${withheld} visual candidate${withheld === 1 ? '' : 's'} withheld because local visual privacy/quality checks could not complete safely.` : ''}`;
    }
    return visualData;
  }).catch((error) => {
    if (state[generationKey] !== generation) return null;
    state[statusKey] = 'failed';
    label.textContent = `${file.name} · text ready · visuals skipped`;
    state[intelKey] = {
      ...(state[intelKey] || {}),
      visualStatus:'failed',
      notes:[...((state[intelKey]?.notes) || []), `Visual preparation skipped: ${error?.message || 'unknown visual processing error'}`],
    };
    renderDocumentIntel(kind, state[intelKey]);
    if (isCv && transparency) transparency.innerHTML = '<strong>Basic PII redaction applied.</strong> CV text is ready. Diagram/chart preparation could not finish, so Mimir will continue with the text evidence instead of blocking evaluation.';
    return null;
  });

  state[promiseKey] = preparation;
  return preparation;
}

async function waitForVisualPreparation({ includeJd = true, maxWaitMs = 6000 } = {}) {
  const pending = [];
  if (state.cvVisualStatus === 'processing' && state.cvVisualPromise) pending.push(state.cvVisualPromise);
  if (includeJd && state.jdVisualStatus === 'processing' && state.jdVisualPromise) pending.push(state.jdVisualPromise);
  if (!pending.length) return { timedOut:false };

  let timer;
  const timeoutPromise = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), maxWaitMs); });
  const outcome = await Promise.race([Promise.allSettled(pending).then(() => 'ready'), timeoutPromise]);
  clearTimeout(timer);
  return { timedOut: outcome === 'timeout' };
}

async function extractFileToTextarea(file, kind) {
  if (!validateFile(file)) return;
  clearError();
  invalidateResult();

  const isCv = kind === 'cv';
  const label = isCv ? $('cvFileName') : $('jdFileName');
  const textarea = isCv ? $('cvText') : $('jdText');
  const input = isCv ? $('cvFile') : $('jdFile');
  const transparency = $('cvTransparency');
  label.textContent = `Reading ${file.name} text locally…`;
  if (isCv && transparency) transparency.textContent = 'Reading and redacting CV text locally. Diagram/chart preparation will continue in the background.';

  try {
    if (!window.MimirDocumentClient?.extractText) throw new Error('Local document engine failed to load. Refresh and try again.');
    const data = await window.MimirDocumentClient.extractText(file, kind);
    const privacyWarnings = isCv ? (window.MimirPrivacy?.leakScan(data.text) || []) : [];

    textarea.value = data.text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    if (isCv) {
      state.cvFile = file;
      state.cvVisualAssets = [];
      state.cvDocumentIntel = data.documentIntelligence || null;
      textarea.classList.add('is-redacted');
      const totalMasked = Object.values(data.maskingReport || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      const detectedVisuals = Number(data.documentIntelligence?.visualCandidatesDetected || 0);
      label.textContent = detectedVisuals
        ? `${file.name} · text ready · ${detectedVisuals} visuals detected · preparing…`
        : `${file.name} · text ready · no embedded visuals detected`;
      if (transparency) {
        transparency.innerHTML = `<strong>CV text ready.</strong> ${totalMasked} direct identifier${totalMasked === 1 ? '' : 's'} masked locally.${privacyWarnings.length ? ` ${privacyWarnings.length} residual direct-identifier warning${privacyWarnings.length === 1 ? '' : 's'} will be re-masked server-side without blocking evaluation.` : ''}${detectedVisuals ? ` ${detectedVisuals} diagram/chart visual${detectedVisuals === 1 ? '' : 's'} detected and being prepared on the fast path.` : ''}`;
      }
      renderDocumentIntel('cv', data.documentIntelligence);
      setFileRemoveVisibility('cv', true);
      showToast('CV text is ready. Visual evidence is preparing in the background.');
    } else {
      state.jdFile = file;
      state.jdVisualAssets = [];
      state.jdDocumentIntel = data.documentIntelligence || null;
      state.loadedSavedJd = null;
      const detectedVisuals = Number(data.documentIntelligence?.visualCandidatesDetected || 0);
      label.textContent = detectedVisuals
        ? `${file.name} · text ready · ${detectedVisuals} visuals detected · preparing…`
        : `${file.name} · text ready · no embedded visuals detected`;
      renderDocumentIntel('jd', data.documentIntelligence);
      setFileRemoveVisibility('jd', true);
      await refreshJdCacheState();
      showToast('JD text is ready. Visual evidence is preparing in the background.');
    }
    input.value = '';

    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'txt') {
      if (isCv) { state.cvVisualStatus = 'ready'; label.textContent = `${file.name} · local only`; }
      else { state.jdVisualStatus = 'ready'; label.textContent = `${file.name} · local only`; }
      return;
    }

    // Do not await this. Text becomes usable immediately; visuals prepare independently.
    startVisualPreparation(file, kind, data);
  } catch (error) {
    label.textContent = isCv ? 'Drop CV or browse' : 'Drop JD or browse';
    if (isCv && transparency) transparency.textContent = 'Mimir could not read this CV text. The document itself may be unsupported or damaged.';
    showError(error.message);
  }
}

function setupDropzone({ inputId, zoneId, kind }) {
  const input = $(inputId);
  const zone = $(zoneId);

  const useFile = async (file) => {
    if (!validateFile(file)) return;
    await extractFileToTextarea(file, kind);
  };

  input.addEventListener('change', async () => {
    if (input.files?.[0]) await useFile(input.files[0]);
  });

  ['dragenter', 'dragover'].forEach((eventName) => zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.add('dragover');
  }));

  ['dragleave', 'dragend'].forEach((eventName) => zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove('dragover');
  }));

  zone.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) await useFile(file);
  });

  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
}

setupDropzone({ inputId: 'jdFile', zoneId: 'jdDropzone', kind: 'jd' });
setupDropzone({ inputId: 'cvFile', zoneId: 'cvDropzone', kind: 'cv' });

$('cvText').addEventListener('input', (event) => {
  if (event.isTrusted) {
    invalidateResult();
    // A manually edited text representation may no longer correspond to the uploaded
    // document's diagrams. Detach the visual source rather than risk cross-document evidence.
    const hadVisualSource = detachUploadedSource('cv', { edited: true });
    $('cvText').classList.remove('is-redacted');
    const transparency = $('cvTransparency');
    if (transparency) {
      transparency.textContent = hadVisualSource
        ? 'Text changed after extraction, so the original visual channel was detached for audit safety. Re-upload the CV to restore diagram/chart evidence.'
        : 'Pasted text is redacted server-side when you evaluate. Uploading a file also enables diagram/chart analysis.';
    }
  }
});

let jdRefreshTimer;
$('jdText').addEventListener('input', (event) => {
  if (event.isTrusted) {
    invalidateResult();
    hideJdPreview();
    state.loadedSavedJd = null;
    if (state.jdFile) detachUploadedSource('jd', { edited: true });
  }
  clearTimeout(jdRefreshTimer);
  jdRefreshTimer = setTimeout(refreshJdCacheState, 250);
});

function isCurrentJdProfile(structure) { return structure?.intelligence?.profile_version === JD_PROFILE_VERSION; }
function setJdInsightExpanded(expanded) {
  const panel = $('jdIntelligencePanel');
  const toggle = $('jdIntelligenceToggle');
  const content = $('jdIntelligenceBody');
  if (!panel || !toggle || !content) return;
  const open = Boolean(expanded) && !panel.classList.contains('hidden');
  panel.classList.toggle('is-expanded', open);
  toggle.setAttribute('aria-expanded', String(open));
  content.setAttribute('aria-hidden', String(!open));
  content.inert = !open;
  $('jdIntelligenceToggleText').textContent = open ? 'Collapse insights' : 'Expand insights';
}
function hideJdPreview() {
  setJdInsightExpanded(false);
  const preview = $('jdIntelligencePreview');
  if (preview) { preview.classList.add('hidden'); preview.innerHTML = ''; }
  $('jdIntelligencePanel')?.classList.add('hidden');
}
$('jdIntelligenceToggle').addEventListener('click', () => {
  setJdInsightExpanded($('jdIntelligenceToggle').getAttribute('aria-expanded') !== 'true');
});
async function currentJdHash() {
  const text = normalizeText($('jdText').value);
  if (!text) return null;
  if (state.loadedSavedJd?.structuredJd && normalizeText(state.loadedSavedJd.rawText) === text && !state.jdFile) {
    return state.loadedSavedJd.jdHash;
  }
  const fileHash = state.jdFile ? await fingerprintFile(state.jdFile) : '';
  return sha256Text(`${text}|source-file:${fileHash}`);
}

async function refreshJdCacheState() {
  const hash = await currentJdHash();
  state.currentJdHash = hash;
  if (!hash) {
    $('jdCacheState').textContent = 'No saved structure yet';
    return;
  }
  const structures = readStore(STORAGE.jdStructures, {});
  const hasStructure = Boolean(isCurrentJdProfile(state.loadedSavedJd?.structuredJd) || isCurrentJdProfile(structures[hash]?.structuredJd));
  $('jdCacheState').textContent = hasStructure
    ? 'Structured JD ready · warm evaluation'
    : state.jdFile && Number(state.jdDocumentIntel?.visualCandidatesDetected || 0) > 0
      ? 'New multimodal JD · first evaluation will read text + visuals'
      : 'New JD · first evaluation will structure it';
}

function savedJds() {
  return readStore(STORAGE.savedJds, []);
}

async function saveCurrentJd() {
  clearError();
  const rawText = $('jdText').value.trim();
  if (!rawText) return showError('Paste or upload a job description before saving it.');
  const jdHash = await currentJdHash();
  const structures = readStore(STORAGE.jdStructures, {});
  const structuredJd = structures[jdHash]?.structuredJd || null;
  const list = savedJds();
  const existingIndex = list.findIndex((item) => item.jdHash === jdHash);
  const fallbackTitle = truncate(rawText.split('\n').find((line) => line.trim()) || 'Saved job description', 70);
  const item = {
    id: existingIndex >= 0 ? list[existingIndex].id : crypto.randomUUID(),
    title: structuredJd?.role_title || fallbackTitle,
    rawText,
    jdHash,
    structuredJd,
    jdIntelligence:structures[jdHash]?.jdIntelligence || null,
    sourceFileName: state.jdFile?.name || null,
    hadVisualContext: Number(state.jdDocumentIntel?.visualCandidatesDetected || 0) > 0,
    updatedAt: new Date().toISOString(),
    createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : new Date().toISOString(),
  };
  if (existingIndex >= 0) list[existingIndex] = item;
  else list.unshift(item);
  writeStore(STORAGE.savedJds, list.slice(0, 30));
  showToast(existingIndex >= 0 ? 'Saved JD updated locally.' : 'JD saved locally in this browser.');
  renderSavedJds();
}

function openSavedModal() {
  renderSavedJds();
  $('savedJdsModal').classList.remove('hidden');
}
function closeSavedModal() { $('savedJdsModal').classList.add('hidden'); }

function renderSavedJds() {
  const root = $('savedJdsList');
  const list = savedJds().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (!list.length) {
    root.innerHTML = '<div class="saved-jd"><div><strong>No saved JDs yet</strong><p>Paste or upload a JD and press “Save JD”. Mimir stores it in this browser only.</p></div></div>';
    return;
  }
  root.innerHTML = list.map((item) => `
    <article class="saved-jd" data-id="${escapeHtml(item.id)}">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(truncate(normalizeText(item.rawText), 155))}</p>
        <div class="saved-jd-meta">${item.structuredJd ? 'Structured · warm-ready' : 'Raw JD · structure on first evaluation'} · ${new Date(item.updatedAt).toLocaleString()}</div>
      </div>
      <div class="saved-jd-actions">
        <button type="button" data-load-jd="${escapeHtml(item.id)}">Load</button>
        <button type="button" class="danger" data-delete-jd="${escapeHtml(item.id)}">Delete</button>
      </div>
    </article>`).join('');
}

$('savedJdsList').addEventListener('click', async (event) => {
  const loadId = event.target.closest('[data-load-jd]')?.dataset.loadJd;
  const deleteId = event.target.closest('[data-delete-jd]')?.dataset.deleteJd;
  if (loadId) {
    const item = savedJds().find((entry) => entry.id === loadId);
    if (!item) return;
    $('jdText').value = item.rawText;
    state.currentJdHash = item.jdHash;
    state.loadedSavedJd = item;
    state.jdFile = null;
    state.jdDocumentIntel = null;
    renderDocumentIntel('jd', null);
    $('jdFile').value = '';
    setFileRemoveVisibility('jd', false);
    invalidateResult();
    hideJdPreview();
    const cachedIntel = item.jdIntelligence || readStore(STORAGE.jdStructures,{})[item.jdHash]?.jdIntelligence;
    if (isCurrentJdProfile(item.structuredJd) && cachedIntel) renderJdIntelligence(cachedIntel,'jdIntelligencePreview');
    $('jdFileName').textContent = item.hadVisualContext && item.structuredJd
      ? 'Loaded structured multimodal JD from local vault'
      : item.hadVisualContext
        ? 'Loaded text only · re-upload source once for diagrams'
        : 'Loaded from local JD vault';
    closeSavedModal();
    await refreshJdCacheState();
    showToast(item.hadVisualContext && !item.structuredJd
      ? `Loaded ${item.title}. Re-upload the original JD before its first evaluation to include visuals.`
      : `Loaded ${item.title}`);
  }
  if (deleteId) {
    const list = savedJds().filter((entry) => entry.id !== deleteId);
    writeStore(STORAGE.savedJds, list);
    renderSavedJds();
    showToast('Saved JD removed from this browser.');
  }
});

$('saveJdBtn').addEventListener('click', saveCurrentJd);
$('savedJdsBtn').addEventListener('click', openSavedModal);
$('closeSavedJds').addEventListener('click', closeSavedModal);
$('savedJdsModal').addEventListener('click', (event) => {
  if (event.target.matches('[data-close-modal]')) closeSavedModal();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSavedModal();
});

async function updateSavedJdWithStructure(jdHash, structuredJd, jdIntelligence=null) {
  const structures = readStore(STORAGE.jdStructures, {});
  structures[jdHash] = { structuredJd, jdIntelligence, updatedAt: new Date().toISOString() };
  writeStore(STORAGE.jdStructures, structures);

  const list = savedJds();
  const index = list.findIndex((item) => item.jdHash === jdHash);
  if (index >= 0) {
    list[index].structuredJd = structuredJd;
    list[index].jdIntelligence = jdIntelligence;
    list[index].title = structuredJd.role_title || list[index].title;
    list[index].updatedAt = new Date().toISOString();
    writeStore(STORAGE.savedJds, list);
  }
}

function utf8Bytes(value='') {
  return new TextEncoder().encode(String(value)).byteLength;
}

function fitEvaluationPayload(payload) {
  // Keep evaluation requests inside Mimir's backend safety envelope. Visuals are
  // already resized in document-client.js; if a graphic-heavy document is still
  // too large, withhold the largest prepared visual(s) instead of failing the run.
  const cloned = { ...payload, jdVisualAssets:[...(payload.jdVisualAssets || [])], cvVisualAssets:[...(payload.cvVisualAssets || [])] };
  const dropped = [];
  let json = JSON.stringify(cloned);
  while (utf8Bytes(json) > MIMIR_MAX_API_PAYLOAD_BYTES) {
    const candidates = [
      ...cloned.jdVisualAssets.map((asset,index)=>({ bucket:'jdVisualAssets', index, size:String(asset.base64 || '').length, id:asset.id })),
      ...cloned.cvVisualAssets.map((asset,index)=>({ bucket:'cvVisualAssets', index, size:String(asset.base64 || '').length, id:asset.id })),
    ].sort((a,b)=>b.size-a.size);
    if (!candidates.length) break;
    const largest = candidates[0];
    const [removed] = cloned[largest.bucket].splice(largest.index,1);
    if (removed) dropped.push(removed.id || largest.id || 'visual');
    json = JSON.stringify(cloned);
  }
  if (utf8Bytes(json) > MIMIR_MAX_API_PAYLOAD_BYTES) {
    throw new Error('The sanitized evaluation payload is still too large for Mimir. Shorten unusually large pasted text and retry.');
  }
  if (dropped.length) {
    cloned.privacy = { ...(cloned.privacy || {}), payloadBudgetVisualsWithheld:dropped.length };
    showToast(`${dropped.length} oversized visual ${dropped.length === 1 ? 'asset was' : 'assets were'} withheld to stay inside the secure API payload limit.`);
    json = JSON.stringify(cloned);
  }
  return { payload:cloned, json, bytes:utf8Bytes(json), dropped };
}

async function evaluateCandidate() {
  clearError();
  const jdText = $('jdText').value.trim();
  const cvInput = $('cvText').value.trim();
  if (!jdText) return showError('Paste or upload a job description first.');
  if (!cvInput && !state.cvFile) return showError('Paste or upload a candidate CV first.');
  if (jdText.length > MIMIR_MAX_JD_CHARS) return showError(`Job description is too large. Maximum ${MIMIR_MAX_JD_CHARS.toLocaleString()} characters.`);
  if (cvInput.length > MIMIR_MAX_CV_CHARS) return showError(`Candidate CV is too large. Maximum ${MIMIR_MAX_CV_CHARS.toLocaleString()} characters.`);
  if (!window.MimirPrivacy) return showError('Candidate privacy firewall is unavailable. Refresh the page before evaluating.');
  const clientMasked = window.MimirPrivacy.mask(cvInput, 'cv');
  const privacyWarnings = window.MimirPrivacy.leakScan(clientMasked.maskedText);
  const cvText = clientMasked.maskedText.trim();

  const previousResult = state.result;
  state.abortController = new AbortController();
  setLoading(true);

  try {
    const jdHash = await currentJdHash();
    const structures = readStore(STORAGE.jdStructures, {});
    const cachedStructure = [structures[jdHash]?.structuredJd,state.loadedSavedJd?.structuredJd].find(isCurrentJdProfile) || null;

    // Text is ready immediately after upload. If diagram/chart preparation is still
    // finishing, wait briefly at evaluation time instead of freezing the upload UI.
    // A slow/failed visual never blocks the candidate evaluation.
    if (state.cvVisualStatus === 'processing' || (!cachedStructure && state.jdVisualStatus === 'processing')) {
      $('loadingCopy').textContent = 'Finishing background diagram/chart preparation…';
      const visualWait = await waitForVisualPreparation({ includeJd: !cachedStructure, maxWaitMs: 6000 });
      if (visualWait.timedOut) {
        const ready = Number(state.cvVisualAssets?.length || 0);
        const detected = Number(state.cvDocumentIntel?.visualCandidatesDetected || 0);
        showToast(`Visual preparation is still running. Mimir is continuing with ${ready}/${detected} CV visuals already ready rather than dropping the entire visual channel.`);
      }
    }

    const payload = {
      jdText,
      cvText,
      jdVisualAssets: cachedStructure ? [] : state.jdVisualAssets,
      cvVisualAssets: state.cvVisualAssets,
      jdDocumentIntelligence: state.jdDocumentIntel,
      cvDocumentIntelligence: state.cvDocumentIntel,
      privacy: { clientPrepared: true, firewallVersion: window.MimirPrivacy?.rulesVersion || 'unknown', documentEngineVersion: window.MimirDocumentClient?.version || 'unknown', mode: window.MimirPrivacy?.mode || 'practical', warnings: privacyWarnings },
    };

    if (cachedStructure) {
      payload.structuredJd = cachedStructure;
      payload.jdHash = jdHash;
      $('loadingCopy').textContent = state.cvFile
        ? 'Running a fresh candidate evaluation with the saved JD structure and redacted text + visual evidence.'
        : 'Running a fresh candidate evaluation with the saved JD structure.';
    } else {
      $('loadingCopy').textContent = (state.jdFile || state.cvFile)
        ? 'Reading text, diagrams and charts; privacy-scrubbing candidate visuals; then tracing fresh evidence.'
        : 'Structuring the JD once, then running a fresh evidence evaluation.';
    }

    const fitted = fitEvaluationPayload(payload);
    const response = await fetch(apiUrl('/api/evaluate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: fitted.json,
      signal: state.abortController.signal,
      cache: 'no-store',
    });
    let data;
    try { data = await response.json(); } catch { data = { error: `Server returned HTTP ${response.status}.` }; }
    if (!response.ok) throw new Error(data.error || 'Evaluation failed.');

    state.result = data;
    persistEvidenceIntelligence(data);
    if (data.documentIntelligence?.jd?.format && data.documentIntelligence.jd.format !== 'unknown') renderDocumentIntel('jd', data.documentIntelligence.jd);
    if (data.documentIntelligence?.cv?.format && data.documentIntelligence.cv.format !== 'unknown') renderDocumentIntel('cv', data.documentIntelligence.cv);
    await updateSavedJdWithStructure(jdHash, data.structuredJd, data.jdIntelligence);
    renderJdIntelligence(data.jdIntelligence,'jdIntelligencePreview');
    renderResult(data);
    showToast('Fresh evaluation completed. Results are never replayed from a previous CV run.');
  } catch (error) {
    if (error?.name === 'AbortError') {
      state.result = previousResult || null;
      showToast('Evaluation cancelled.');
    } else {
      state.result = previousResult || null;
      showError(error.message || 'Evaluation failed.');
    }
  } finally {
    state.abortController = null;
    setLoading(false);
  }
}

// JD-only preview: does not send or require a CV. One Gemini compilation per new JD;
// existing versioned browser-local structures can be reused for evaluation.
function renderJdIntelligence(profile, target='jdIntelligencePreview', scoring=null) {
  const root=$(target);
  if (!root) return;
  if (!profile) { root.classList.add('hidden');root.innerHTML='';return; }
  const categoryLabels={technical:'Technical',functional_domain:'Functional / Domain',operational_delivery:'Operational / Delivery',behavioral:'Behavioral',eligibility:'Eligibility'};
  const weights=scoring?.categoryWeights || profile.category_weights || {};
  const bars=Object.entries(categoryLabels).filter(([id])=>Number(weights[id]||0)>0).map(([id,label])=>{
    const v=Math.max(0,Math.min(100,Number(weights[id]||0)));
    return `<div class="jdi-bar-row"><span>${escapeHtml(label)}</span><div class="jdi-track"><i class="jdi-fill jdi-${escapeHtml(id)}" style="width:${v.toFixed(2)}%"></i></div><strong>${v.toFixed(1)}%</strong></div>`;
  }).join('');
  const capabilities=(profile.requirements||[]).filter(x=>x.assessment_mode!=='exclude').slice(0,45);
  const rows=capabilities.map((r)=>{
    const weight = scoring?.weightsByRequirement ? scoring.weightsByRequirement[r.id] : r.weight_percent;
    return `<div class="jdi-cap"><span class="jdi-cap-id">${escapeHtml(r.id)}</span><div><strong>${escapeHtml(r.capability)}</strong><small>${escapeHtml(categoryLabels[r.category]||humanize(r.category))} · ${escapeHtml(r.importance)} ${r.tier!=='none'?`· ${escapeHtml(r.tier)}`:''} · ${escapeHtml(r.responsibility_level)}</small></div><b>${r.assessment_mode==='score'?`${Number(weight||0).toFixed(1)}%`:escapeHtml(humanize(r.assessment_mode))}</b></div>`;
  }).join('');
  const route=scoring?.selected_pathway;
  const pathways=(profile.pathways||[]).map(p=>`<span class="jdi-path">${escapeHtml(p.label)}${route===p.id?' · selected':''}</span>`).join('');
  const ambiguities=(profile.ambiguities||[]).slice(0,8).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  root.innerHTML=`<div class="jdi-top"><div class="section-kicker gradient-text">ROLE INTENT · JD FIRST</div><strong>${escapeHtml(profile.role_intent || 'Role intelligence')}</strong><p>${escapeHtml(profile.role_focus || 'Weights are inferred from the client JD and are open to recruiter review.')}</p></div><div class="jdi-bars">${bars||'<span>No scored capabilities extracted.</span>'}</div>${pathways?`<div class="jdi-pathways">Valid sourcing pathways: ${pathways}</div>`:''}<details class="jdi-details"><summary>Inspect ${capabilities.length} capabilities and their importance</summary><div class="jdi-capabilities">${rows}</div></details>${ambiguities?`<details class="jdi-details"><summary>${(profile.ambiguities||[]).length} JD clarification flags</summary><ul>${ambiguities}</ul></details>`:''}<p class="jdi-note">Derived importance, not employer-provided percentages. Generic traits and unverified eligibility do not receive unexplained zero scores.</p>`;
  root.classList.remove('hidden');
  if (target === 'jdIntelligencePreview') {
    const panel = $('jdIntelligencePanel');
    const freshlyRevealed = panel?.classList.contains('hidden');
    panel?.classList.remove('hidden');
    if (freshlyRevealed) {
      setJdInsightExpanded(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setJdInsightExpanded(true)));
    }
  }
}

async function analyzeJdOnly() {
  if (state.isAnalyzingJd || state.isEvaluating) return;
  clearError();
  const jdText=$('jdText').value.trim();
  if (!jdText) return showError('Paste or upload a JD before requesting JD Intelligence.');
  if (jdText.length > MIMIR_MAX_JD_CHARS) return showError('JD exceeds the configured size limit.');
  const button=$('analyzeJdBtn');
  state.isAnalyzingJd=true;button.disabled=true;button.textContent='Understanding this role…';
  try {
    const jdHash=await currentJdHash();
    const structures=readStore(STORAGE.jdStructures,{});
    const saved=state.loadedSavedJd?.jdIntelligence ? state.loadedSavedJd : structures[jdHash];
    if (isCurrentJdProfile(saved?.structuredJd) && saved?.jdIntelligence) {
      renderJdIntelligence(saved.jdIntelligence);setJdInsightExpanded(true);showToast('JD Intelligence loaded from this browser.');return;
    }
    if (state.jdVisualStatus==='processing') await waitForVisualPreparation({includeJd:true,maxWaitMs:6000});
    const payload=fitEvaluationPayload({jdText,jdVisualAssets:state.jdVisualAssets,cvVisualAssets:[],privacy:{clientPrepared:true,firewallVersion:window.MimirPrivacy?.rulesVersion || 'unknown',documentEngineVersion:window.MimirDocumentClient?.version || 'unknown'}});
    const response=await fetch(apiUrl('/api/jd/analyze'),{method:'POST',headers:{'Content-Type':'application/json'},body:payload.json,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error||`JD Intelligence failed (HTTP ${response.status}).`);
    await updateSavedJdWithStructure(jdHash,data.structuredJd,data.jdIntelligence);
    renderJdIntelligence(data.jdIntelligence);
    refreshJdCacheState();
    showToast('JD understood and stored locally. CV evaluation will reuse this structure.');
  } catch(e) { showError(e.message||'Unable to analyze the JD.'); }
  finally {state.isAnalyzingJd=false;button.disabled=false;button.innerHTML='<span class="jd-action-label"><span class="jd-action-spark" aria-hidden="true">✧</span> Understand this JD</span><span class="jd-action-chevron" aria-hidden="true">↗</span>';}
}
$('analyzeJdBtn').addEventListener('click',analyzeJdOnly);

function cancelEvaluation() {
  if (!state.isEvaluating) return;
  state.abortController?.abort();
}

$('evaluateBtn').addEventListener('click', () => {
  if (state.isEvaluating) cancelEvaluation();
  else evaluateCandidate();
});

$('removeJdFileBtn').addEventListener('click', () => removeUploadedFile('jd'));
$('removeCvFileBtn').addEventListener('click', () => removeUploadedFile('cv'));

function stateClass(row) {
  if (row.assessment_mode === 'verify' || row.assessment_mode === 'gate') return 'state-verify';
  if (row.claim_state === 'supported') return 'state-proof';
  if (['partially_supported','contextual','ambiguous'].includes(row.claim_state)) return 'state-inferred';
  if (['not_evidenced','contradicted'].includes(row.claim_state)) return 'state-missing';
  if (['documented', 'listed'].includes(row.support_state)) return 'state-proof';
  if (['inferred_graph', 'inferred_behavioral', 'unsettled'].includes(row.support_state)) return 'state-inferred';
  return 'state-missing';
}

function stateLabel(row) {
  if (row.assessment_mode === 'verify') return (row.matched_quote || row.visual_observation) ? 'Interview signal' : 'Verify';
  if (row.assessment_mode === 'gate') return row.status_label;
  if (row.claim_state === 'supported') return row.evidence_source_type === 'visual' ? 'Supported visual' : 'Supported';
  if (row.claim_state === 'partially_supported') return 'Partially supported';
  if (row.claim_state === 'contextual') return 'Contextual';
  if (row.claim_state === 'ambiguous') return 'Ambiguous';
  if (row.claim_state === 'not_evidenced') return 'Not evidenced';
  if (row.claim_state === 'contradicted') return 'Contradicted';
  if (row.evidence_source_type === 'visual' && row.support_state === 'documented') return 'Visual proof';
  if (row.support_state === 'documented') return 'Documented';
  if (row.support_state === 'listed') return 'Listed';
  if (row.support_state === 'inferred_graph') return 'Graph inferred';
  if (row.support_state === 'inferred_behavioral') return 'Behaviour inferred';
  if (row.support_state === 'unsettled') return 'Unsettled';
  if (row.support_state === 'not_assessable') return 'Not assessed';
  return 'Missing';
}

function evidenceFallback(row) {
  if (row.assessment_mode === 'verify') return 'Not normally proven by CV wording — verify in interview.';
  if (row.assessment_mode === 'gate') return 'No explicit fact found — verification is required.';
  if (row.assessment_mode === 'exclude') return 'Optional / excluded from the core score.';
  return 'No verified CV evidence found.';
}

function renderEvidenceMatrix(rows = []) {
  const root = $('evidenceMatrix');
  root.innerHTML = rows.map((row) => {
    const path = (row.inference_path || []).map((step) => `${escapeHtml(step.from)} → ${escapeHtml(step.relation)} → ${escapeHtml(step.to)}`).join(' · ');
    const tags = [humanize(row.requirement_type || row.category), humanize(row.priority), row.claim_state ? humanize(row.claim_state) : null, row.assessment_mode === 'verify' ? 'Interview' : row.assessment_mode === 'gate' ? 'Gate' : null].filter(Boolean);
    const lineage = row.score_lineage;
    const lineageHtml = lineage ? `
      <details class="score-lineage">
        <summary>Score lineage · ${escapeHtml(lineage.final_score_points ?? 0)} final-score points</summary>
        <div class="score-lineage-grid">
          <span>Relation base<strong>${escapeHtml(lineage.base_points ?? 0)}</strong></span>
          <span>Support adj.<strong>${escapeHtml(lineage.adjustments?.support ?? 0)}</strong></span>
          <span>Depth adj.<strong>${escapeHtml(lineage.adjustments?.depth ?? 0)}</strong></span>
          <span>Recency adj.<strong>${escapeHtml(lineage.adjustments?.recency ?? 0)}</strong></span>
          <span>Before policy<strong>${escapeHtml(lineage.credit_before_policy ?? 0)}</strong></span>
          <span>Policy cap<strong>${escapeHtml(lineage.policy_cap ?? 100)}</strong></span>
          <span>Final credit<strong>${escapeHtml(lineage.credit_after_policy ?? 0)}</strong></span>
          <span>Priority weight<strong>${escapeHtml(lineage.priority_weight ?? 0)}</strong></span>
        </div>
        <div>${escapeHtml(lineage.formula || '')}</div>
      </details>` : '';
    return `
      <article class="evidence-row ${stateClass(row)}">
        <div class="evidence-row-top">
          <div class="req-id">${escapeHtml(row.requirement_id)}</div>
          <div class="req-copy">
            <span class="field-label">What the role requires</span>
            <strong>${escapeHtml(row.requirement_text)}</strong>
            <div class="req-tags">${tags.map((tag) => `<span class="tiny-tag">${escapeHtml(tag)}</span>`).join('')}</div>
          </div>
          <div class="state-cell" aria-label="Evidence classification">
            <span class="state-pill ${stateClass(row)}">${escapeHtml(stateLabel(row))}</span>
            <span class="relation-pill">${escapeHtml(humanize(row.relation))}</span>
          </div>
        </div>
        <div class="evidence-row-grid">
          <div class="evidence-block evidence-proof-block">
            <span class="field-label">CV evidence ${row.evidence_source_type === 'visual' ? '· verified visual' : '· quoted text'}</span>
            <blockquote class="evidence-quote ${(row.matched_quote || row.visual_observation) ? '' : 'empty'}">
              ${row.evidence_source_type === 'visual'
                ? `<span class="visual-source-badge">VISUAL${row.source_page ? ` · PAGE ${escapeHtml(row.source_page)}` : ''}${row.visual_asset_id ? ` · ${escapeHtml(row.visual_asset_id)}` : ''}</span><span>${escapeHtml(row.visual_observation || evidenceFallback(row))}</span>`
                : escapeHtml(row.matched_quote || evidenceFallback(row))}
            </blockquote>
          </div>
          <div class="evidence-block evidence-reason-block">
            <span class="field-label">Mimir’s interpretation</span>
            <p class="why-cell">${escapeHtml(row.reason || 'No explanation returned.')}</p>
            ${lineageHtml}
          </div>
        </div>
        ${path ? `<div class="path-line"><strong>Capability connection:</strong> ${path}</div>` : ''}
      </article>`;
  }).join('');
}

function renderSignals(result) {
  const gates = result.gateChecks || [];
  const verify = result.verificationItems || [];
  const constraints = result.constraintChecks || [];
  $('signalPanel').classList.toggle('hidden', !gates.length && !verify.length && !constraints.length);
  const constraintHtml = constraints.map((item) => {
    const label = item.type === 'count' ? `${item.verified} / ${item.required} verified` : `${item.verified}`;
    return `<div class="signal-item"><span class="signal-state">${escapeHtml(item.status)}</span><strong>${escapeHtml(item.requirement_id)} · ${escapeHtml(humanize(item.type))}</strong><span>${escapeHtml(label)}</span></div>`;
  }).join('');
  const gateHtml = gates.map((item) => `<div class="signal-item"><span class="signal-state">${escapeHtml(item.status)}</span><strong>${escapeHtml(item.requirement_text)}</strong><span>${escapeHtml(item.reason)}</span></div>`).join('');
  $('gateList').innerHTML = (constraintHtml + gateHtml) || '<div class="signal-item"><strong>No hard constraints extracted</strong><span>Nothing to verify here.</span></div>';
  $('verifyList').innerHTML = verify.length ? verify.map((item) => `
    <div class="signal-item"><span class="signal-state">${escapeHtml(item.status)}</span><strong>${escapeHtml(item.requirement_text)}</strong><span>${escapeHtml(item.reason)}</span></div>`).join('') : '<div class="signal-item"><strong>No interview-only signals</strong><span>All extracted requirements are CV-assessable.</span></div>';
}

function renderJdAudit(result) {
  const issues = result.jdAudit?.issues || [];
  const panel = $('jdAuditPanel');
  panel.classList.toggle('hidden', !issues.length);
  if (!issues.length) { $('jdAuditList').innerHTML = ''; return; }
  $('jdAuditList').innerHTML = issues.map((issue) => `<article class="odin-item"><div class="odin-meta"><span class="odin-code">${escapeHtml(issue.requirement_id || 'JD')} · ${escapeHtml(issue.code || 'AUDIT')}</span><span class="odin-severity">${escapeHtml(issue.severity || 'review')}</span></div><strong>JD wording to clarify</strong><p>${escapeHtml(issue.message || issue.reason || '')}</p></article>`).join('');
}

function renderClaims(result) {
  const claims = result.claimAssessments || [];
  const panel = $('claimPanel');
  panel.classList.toggle('hidden', !claims.length);
  if (!claims.length) return;
  const counts = claims.reduce((acc, c) => { acc[c.state] = (acc[c.state] || 0) + 1; return acc; }, {});
  $('claimSummary').innerHTML = Object.entries(counts).map(([key, value]) => `<span class="summary-chip">${escapeHtml(humanize(key))} · ${value}</span>`).join('');
  $('claimList').innerHTML = claims.map((claim) => {
    const gaps = [...(claim.not_established || []), ...(claim.uncertainty_reasons || [])];
    const changes = claim.what_would_change || [];
    return `<article class="claim-item"><div><strong>${escapeHtml(claim.statement)}</strong><p>${escapeHtml((claim.established || []).join(' · ') || 'No positive dimension established yet.')}</p>${gaps.length ? `<div class="claim-gaps"><strong>Not established:</strong> ${escapeHtml(gaps.join(' · '))}</div>` : ''}${changes.length ? `<div class="claim-gaps"><strong>Evidence needed:</strong> ${escapeHtml(changes.join(' · '))}</div>` : ''}</div><span class="claim-state ${escapeHtml(claim.state)}">${escapeHtml(humanize(claim.state))}</span></article>`;
  }).join('');
}

function renderVerificationIntelligence(result) {
  const challenges = result.odinChallenges || [];
  const questions = result.nextBestVerificationQuestions || [];
  $('verificationPanel').classList.toggle('hidden', !challenges.length && !questions.length);
  $('odinList').innerHTML = challenges.length ? challenges.map((c) => `<article class="odin-item"><div class="odin-meta"><span class="odin-code">${escapeHtml(c.requirement_id)} · ${escapeHtml(c.code)}</span><span class="odin-severity">${escapeHtml(c.severity)}</span></div><strong>Why Odin flagged this</strong><p>${escapeHtml(c.challenge)}</p></article>`).join('') : '';
  const saved = readStore(STORAGE.humanReviews, {})[result.auditId] || {};
  $('verificationQuestionList').innerHTML = questions.length ? questions.map((q) => {
    const selected = saved[q.id]?.resolution || '';
    const btn = (value, label) => `<button type="button" class="verification-action ${selected === value ? 'selected' : ''}" data-verification-id="${escapeHtml(q.id)}" data-resolution="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
    return `<article class="verification-item"><strong>${escapeHtml(q.requirement_id)} · Ask the candidate</strong><p>${escapeHtml(q.question)}</p><div class="verification-actions">${btn('verified_supported','Verified supported')}${btn('verified_not_supported','Not supported')}${btn('still_uncertain','Still uncertain')}</div></article>`;
  }).join('') : '';
}

function renderGovernance(result) {
  const g = result.governance || {};
  const r = g.risk_summary || {};
  const rows = [
    ['Final decision', g.automated_final_decision ? 'Automated' : 'Human-controlled'],
    ['Human oversight', g.human_oversight_required ? 'Required' : '—'],
    ['Auto rejection', g.automated_rejection_permitted ? 'Permitted' : 'Disabled'],
    ['Uncertain claims', r.uncertainty_count ?? 0],
    ['Odin challenges', r.odin_challenge_count ?? 0],
    ['Bounded policies', r.bounded_policy_count ?? 0],
  ];
  $('governanceMeta').innerHTML = rows.map(([label,value]) => `<div class="audit-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function renderEvidenceIntelligence(result) {
  const local = readStore(STORAGE.evidenceIntelligence, { totalEvaluations:0,totalObservations:0,patterns:{} });
  const runObs = result.evidenceIntelligence?.observations?.length || 0;
  const verified = Object.values(local.patterns || {}).reduce((sum, p) => sum + Number(p.verifiedSupported || 0) + Number(p.verifiedNotSupported || 0), 0);
  const rows = [
    ['This evaluation', `${runObs} anonymous evidence observations`],
    ['Local evaluations', local.totalEvaluations || 0],
    ['Local observations', local.totalObservations || 0],
    ['Human-verified outcomes', verified],
    ['Identity stored', 'No'],
    ['CV quotes stored in learning', 'No'],
  ];
  $('intelligenceMeta').innerHTML = rows.map(([label,value]) => `<div class="audit-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function renderMasking(report = {}) {
  const cv = report.cv || {};
  const labels = {
    names: 'Names', phones: 'Phones', emails: 'Emails', profiles: 'Profiles', socialHandles: 'Social IDs', dob: 'DOB', nationality: 'Nationality', gender: 'Gender', maritalStatus: 'Marital', addresses: 'Addresses', locations: 'Locations', employers: 'Employers', clearances: 'Clearance', identifiers: 'IDs', references: 'References',
  };
  $('maskingReport').innerHTML = Object.entries(labels).map(([key, label]) => `<span class="mask-chip">${label}<strong>${Number(cv[key] || 0)}</strong></span>`).join('');
}

function renderAudit(result) {
  const audit = result.audit || {};
  const graph = result.evidenceGraph?.counts || {};
  const rows = [
    ['Model', audit.model || '—'],
    ['AI provider', audit.aiProvider || '—'],
    ['Scoring policy', audit.scoringVersion || '—'],
    ['Claim model', audit.claimModelVersion || '—'],
    ['Evidence semantics', audit.evidenceSemanticsVersion || '—'],
    ['Entailment', audit.entailmentVersion || '—'],
    ['Odin', audit.odinVersion || '—'],
    ['Evidence policy', audit.policyVersion || '—'],
    ['Evidence graph', `${graph.nodes || 0} nodes · ${graph.edges || 0} edges`],
    ['JD audit', `${result.jdAudit?.issue_count || 0} flags`],
    ['Reference year', audit.scoringReferenceYear ?? '—'],
    ['JD intelligence', audit.warmStructuredJdUsed ? 'Reused from browser' : 'Structured on this run'],
    ['Document mode', audit.multimodalInputUsed ? 'Text + visual' : 'Text only'],
    ['Candidate result replay', 'Disabled · fresh run'],
    ['Raw CV stored', audit.rawCandidateStored ? 'Yes' : 'No'],
    ['Server database', audit.serverDatabaseUsed ? 'Used' : 'None'],
  ];
  $('auditMeta').innerHTML = rows.map(([label, value]) => `<div class="audit-line"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`).join('');
}

function renderResult(result) {
  document.body.classList.add('has-results');
  $('emptyState').classList.add('hidden');
  if ($('loadingState')) $('loadingState').classList.add('hidden');
  $('results').classList.remove('hidden');

  const score = Number(result.finalScore || 0);
  $('scoreValue').textContent = score;
  $('scoreRing').style.setProperty('--score-pct', `${Math.max(0, Math.min(100, score))}%`);
  $('verdict').textContent = result.verdict || '—';
  $('dealbreakerBadge').classList.toggle('hidden', !result.hasDealbreaker);
  $('roleTitle').textContent = result.structuredJd?.role_title || 'Candidate evaluation';
  $('auditId').textContent = result.auditId || '';

  const components = result.componentBreakdown || {};
  for (const key of ['experience', 'skills', 'depth']) {
    const value = Math.max(0, Math.min(100, Number(components[key] || 0)));
    $(`${key}Score`).textContent = `${Math.round(value)}%`;
    $(`${key}Bar`).style.width = `${value}%`;
  }

  renderJdIntelligence(result.jdIntelligence,'jdIntelligenceResultsBody',result.adaptiveWeighting);
  $('jdIntelligenceResults').classList.toggle('hidden',!result.jdIntelligence);
  renderSignals(result);
  renderJdAudit(result);
  renderClaims(result);
  renderVerificationIntelligence(result);
  renderEvidenceMatrix(result.breakdownTable || []);
  renderMasking(result.maskingReport);
  renderAudit(result);
  renderGovernance(result);
  renderEvidenceIntelligence(result);

  requestAnimationFrame(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportFilename(ext) {
  const title = (state.result?.structuredJd?.role_title || 'mimir-report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70);
  return `${title || 'mimir-report'}-Mimir.${ext}`;
}

async function semanticExportFallback(format) {
  const response = await fetch(apiUrl(`/api/export/${format}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report: state.result }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Unable to create ${format.toUpperCase()} report.`);
  }
  return response.blob();
}

async function captureResultUi() {
  if (!window.html2canvas) throw new Error('UI capture library is unavailable.');
  const surface = $('results');
  document.body.classList.add('exporting-ui');
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = await window.html2canvas(surface, {
      backgroundColor: '#070711',
      scale: 1.15,
      useCORS: true,
      logging: false,
      windowWidth: Math.max(document.documentElement.clientWidth, surface.scrollWidth),
    });
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Unable to capture result UI.'))),
      'image/jpeg',
      0.92,
    ));
  } finally {
    document.body.classList.remove('exporting-ui');
  }
}

async function exportServer(format) {
  if (!state.result) return;
  const button = format === 'pdf' ? $('downloadPdfBtn') : $('downloadDocxBtn');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    let blob;
    if (!MIMIR_SERVER_UI_EXPORT) {
      // Render mode uses the structured semantic report generator directly; this
      // avoids sending a large UI screenshot back to the server.
      blob = await semanticExportFallback(format);
    } else {
      try {
        const uiImage = await captureResultUi();
        const form = new FormData();
        form.append('uiImage', uiImage, 'mimir-result-ui.jpg');
        form.append('report', JSON.stringify(state.result));
        const response = await fetch(apiUrl(`/api/export/ui/${format}`), { method: 'POST', body: form });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Unable to create UI ${format.toUpperCase()} report.`);
        }
        blob = await response.blob();
      } catch (uiError) {
        console.warn('[Mimir UI export fallback]', uiError);
        blob = await semanticExportFallback(format);
        showToast(`UI capture was unavailable, so Mimir created the structured ${format.toUpperCase()} report instead.`);
      }
    }
    downloadBlob(blob, reportFilename(format));
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

$('downloadPdfBtn').addEventListener('click', () => exportServer('pdf'));
$('downloadDocxBtn').addEventListener('click', () => exportServer('docx'));
$('downloadAuditBtn').addEventListener('click', () => {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: 'application/json' });
  downloadBlob(blob, reportFilename('json'));
});

$('verificationQuestionList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-verification-id]');
  if (!button) return;
  storeHumanResolution(button.dataset.verificationId, button.dataset.resolution);
  renderVerificationIntelligence(state.result);
  renderEvidenceIntelligence(state.result);
  showToast('Human verification outcome saved locally and added to Evidence Intelligence.');
});


function purgeLegacyEvaluationCaches() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('mimir-') && key.endsWith(':evaluation-cache')) localStorage.removeItem(key);
    }
  } catch {
    // Storage may be blocked. Fresh evaluation still works because no result cache is read.
  }
}

purgeLegacyEvaluationCaches();
async function loadRuntimeMeta() {
  try {
    const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    state.runtimeMeta = {
      scoringVersion: data.scoringVersion || 'unknown',
      promptVersion: data.promptVersion || 'unknown',
      referenceYear: data.referenceYear ?? 'unknown',
      model: data.model || 'unknown',
      claimModelVersion: data.claimModelVersion || 'unknown',
      entailmentVersion: data.entailmentVersion || 'unknown',
      odinVersion: data.odinVersion || 'unknown',
      policyVersion: data.policyVersion || 'unknown',
      jdIntelligenceVersion:data.jdIntelligenceVersion || 'unknown',
    };
  } catch {
    // The evaluator will surface network errors when the user runs an evaluation.
  }
}

await loadRuntimeMeta();
refreshJdCacheState();
