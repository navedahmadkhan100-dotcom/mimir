const $ = (id) => document.getElementById(id);
const CACHE_VERSION = 'mimir-v2.0.0'; // Keep v2 localStorage keys so saved JDs survive the UI upgrade.
const STORAGE = {
  savedJds: `${CACHE_VERSION}:saved-jds`,
  jdStructures: `${CACHE_VERSION}:jd-structures`,
  evaluations: `${CACHE_VERSION}:evaluation-cache`,
};

const state = {
  jdFile: null,
  cvFile: null,
  result: null,
  currentJdHash: null,
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
  $('evaluateBtn').disabled = loading;
  $('evaluateBtnText').textContent = loading ? 'Tracing evidence…' : 'Find the Worthiness';
  if (loading) {
    $('emptyState').classList.add('hidden');
    $('results').classList.add('hidden');
    $('loadingState').classList.remove('hidden');
  } else {
    $('loadingState').classList.add('hidden');
    if (!state.result) $('emptyState').classList.remove('hidden');
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

async function extractFileToTextarea(file, kind) {
  if (!validateFile(file)) return;
  clearError();

  const isCv = kind === 'cv';
  const label = isCv ? $('cvFileName') : $('jdFileName');
  const textarea = isCv ? $('cvText') : $('jdText');
  const input = isCv ? $('cvFile') : $('jdFile');
  const transparency = $('cvTransparency');

  label.textContent = `Reading ${file.name}…`;
  if (isCv && transparency) transparency.textContent = 'Extracting text and applying identity redaction…';

  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);

  try {
    const response = await fetch('/api/extract', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Unable to read ${isCv ? 'CV' : 'JD'} file.`);

    textarea.value = data.text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    label.textContent = file.name;

    // The browser keeps only the extracted text for evaluation. For CVs this is
    // the server-redacted text, so recruiters can inspect exactly what Mimir sees.
    if (isCv) {
      state.cvFile = null;
      textarea.classList.add('is-redacted');
      const totalMasked = Object.values(data.maskingReport || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      if (transparency) {
        transparency.innerHTML = `<strong>Redacted preview ready.</strong> ${totalMasked} identity marker${totalMasked === 1 ? '' : 's'} masked. This is the exact CV text sent into evaluation.`;
      }
      showToast('CV extracted and redacted. Review the preview, then find the worthiness.');
    } else {
      state.jdFile = null;
      await refreshJdCacheState();
      showToast('JD extracted into the text box. You can edit or save it before evaluation.');
    }

    input.value = '';
  } catch (error) {
    label.textContent = isCv ? 'Drop CV or browse' : 'Drop JD or browse';
    if (isCv && transparency) transparency.textContent = 'Redaction preview unavailable until a CV is successfully extracted.';
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
  state.cvFile = null;
  if (event.isTrusted) {
    $('cvText').classList.remove('is-redacted');
    $('cvFileName').textContent = 'Drop CV or browse';
    const transparency = $('cvTransparency');
    if (transparency) transparency.textContent = 'Pasted text is redacted server-side when you evaluate. Uploaded files show the redacted preview here immediately.';
  }
});

let jdRefreshTimer;
$('jdText').addEventListener('input', () => {
  clearTimeout(jdRefreshTimer);
  jdRefreshTimer = setTimeout(refreshJdCacheState, 250);
});

async function currentJdHash() {
  const text = normalizeText($('jdText').value);
  if (!text) return null;
  return sha256Text(text);
}

async function refreshJdCacheState() {
  const hash = await currentJdHash();
  state.currentJdHash = hash;
  if (!hash) {
    $('jdCacheState').textContent = 'No saved structure yet';
    return;
  }
  const structures = readStore(STORAGE.jdStructures, {});
  $('jdCacheState').textContent = structures[hash]?.structuredJd
    ? 'Structured JD ready · warm evaluation'
    : 'New JD · first evaluation will structure it';
}

function savedJds() {
  return readStore(STORAGE.savedJds, []);
}

async function saveCurrentJd() {
  clearError();
  const rawText = $('jdText').value.trim();
  if (!rawText) return showError('Paste or upload a job description before saving it.');
  const jdHash = await sha256Text(normalizeText(rawText));
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
    $('jdFile').value = '';
    $('jdFileName').textContent = 'Loaded from local JD vault';
    closeSavedModal();
      showToast(`Loaded ${item.title}`);
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

function getEvaluationCache() {
  return readStore(STORAGE.evaluations, {});
}

function cacheEvaluation(key, result) {
  const cache = getEvaluationCache();
  cache[key] = { result, savedAt: Date.now() };
  const sorted = Object.entries(cache).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 12);
  writeStore(STORAGE.evaluations, Object.fromEntries(sorted));
}

async function cvFingerprint() {
  const text = normalizeText($('cvText').value);
  if (text) return sha256Text(text);
  if (state.cvFile) return fingerprintFile(state.cvFile);
  return null;
}

async function evaluationCacheKey(jdHash, cvHash) {
  const meta = state.runtimeMeta;
  return sha256Text(`${CACHE_VERSION}|${meta.model}|${meta.promptVersion}|${meta.scoringVersion}|${meta.referenceYear}|${jdHash}|${cvHash}|evidence-graph`);
}

async function updateSavedJdWithStructure(jdHash, structuredJd) {
  const structures = readStore(STORAGE.jdStructures, {});
  structures[jdHash] = { structuredJd, updatedAt: new Date().toISOString() };
  writeStore(STORAGE.jdStructures, structures);

  const list = savedJds();
  const index = list.findIndex((item) => item.jdHash === jdHash);
  if (index >= 0) {
    list[index].structuredJd = structuredJd;
    list[index].title = structuredJd.role_title || list[index].title;
    list[index].updatedAt = new Date().toISOString();
    writeStore(STORAGE.savedJds, list);
  }
}

async function evaluateCandidate() {
  clearError();
  const jdText = $('jdText').value.trim();
  const cvText = $('cvText').value.trim();
  if (!jdText) return showError('Paste or upload a job description first.');
  if (!cvText && !state.cvFile) return showError('Paste or upload a candidate CV first.');

  setLoading(true);
  try {
    const jdHash = await sha256Text(normalizeText(jdText));
    const cvHash = await cvFingerprint();
    const evalKey = await evaluationCacheKey(jdHash, cvHash);
    const cachedEval = getEvaluationCache()[evalKey]?.result;
    if (cachedEval) {
      state.result = cachedEval;
      renderResult(cachedEval);
      showToast('Exact JD + CV found in local evidence cache. No model call used.');
      return;
    }

    const structures = readStore(STORAGE.jdStructures, {});
    const cachedStructure = structures[jdHash]?.structuredJd || null;
    const form = new FormData();
    if (cachedStructure) {
      form.append('structuredJd', JSON.stringify(cachedStructure));
      form.append('jdHash', jdHash);
      $('loadingCopy').textContent = 'Reusing the saved JD structure and matching fresh CV evidence.';
    } else {
      form.append('jdText', jdText);
      $('loadingCopy').textContent = 'Structuring the JD once, then mapping capability and quote-backed CV evidence.';
    }

    if (cvText) form.append('cvText', cvText);
    else form.append('cvFile', state.cvFile, state.cvFile.name);

    const response = await fetch('/api/evaluate', { method: 'POST', body: form });
    let data;
    try { data = await response.json(); } catch { data = { error: `Server returned HTTP ${response.status}.` }; }
    if (!response.ok) throw new Error(data.error || 'Evaluation failed.');

    state.result = data;
    await updateSavedJdWithStructure(jdHash, data.structuredJd);
    cacheEvaluation(evalKey, data);
    renderResult(data);
  } catch (error) {
    state.result = null;
    showError(error.message || 'Evaluation failed.');
    $('emptyState').classList.remove('hidden');
  } finally {
    setLoading(false);
  }
}

$('evaluateBtn').addEventListener('click', evaluateCandidate);

function stateClass(row) {
  if (row.assessment_mode === 'verify' || row.assessment_mode === 'gate') return 'state-verify';
  if (['documented', 'listed'].includes(row.support_state)) return 'state-proof';
  if (['inferred_graph', 'inferred_behavioral', 'unsettled'].includes(row.support_state)) return 'state-inferred';
  return 'state-missing';
}

function stateLabel(row) {
  if (row.assessment_mode === 'verify') return row.matched_quote ? 'Interview signal' : 'Verify';
  if (row.assessment_mode === 'gate') return row.status_label;
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
    const tags = [humanize(row.category), humanize(row.priority), row.assessment_mode === 'verify' ? 'Interview' : row.assessment_mode === 'gate' ? 'Gate' : null].filter(Boolean);
    return `
      <article class="evidence-row">
        <div class="evidence-main">
          <div class="req-id">${escapeHtml(row.requirement_id)}</div>
          <div class="req-copy">
            <strong>${escapeHtml(row.requirement_text)}</strong>
            <div class="req-tags">${tags.map((tag) => `<span class="tiny-tag">${escapeHtml(tag)}</span>`).join('')}</div>
          </div>
          <div class="state-cell">
            <span class="state-pill ${stateClass(row)}">${escapeHtml(stateLabel(row))}</span>
            <span class="relation-pill">${escapeHtml(humanize(row.relation))}</span>
          </div>
          <div class="evidence-quote ${row.matched_quote ? '' : 'empty'}">${escapeHtml(row.matched_quote || evidenceFallback(row))}</div>
          <div class="why-cell">${escapeHtml(row.reason || 'No explanation returned.')}</div>
        </div>
        ${path ? `<div class="path-line"><strong>Evidence path:</strong> ${path}</div>` : ''}
      </article>`;
  }).join('');
}

function renderSignals(result) {
  const gates = result.gateChecks || [];
  const verify = result.verificationItems || [];
  $('signalPanel').classList.toggle('hidden', !gates.length && !verify.length);
  $('gateList').innerHTML = gates.length ? gates.map((item) => `
    <div class="signal-item"><span class="signal-state">${escapeHtml(item.status)}</span><strong>${escapeHtml(item.requirement_text)}</strong><span>${escapeHtml(item.reason)}</span></div>`).join('') : '<div class="signal-item"><strong>No hard gates extracted</strong><span>Nothing to verify here.</span></div>';
  $('verifyList').innerHTML = verify.length ? verify.map((item) => `
    <div class="signal-item"><span class="signal-state">${escapeHtml(item.status)}</span><strong>${escapeHtml(item.requirement_text)}</strong><span>${escapeHtml(item.reason)}</span></div>`).join('') : '<div class="signal-item"><strong>No interview-only signals</strong><span>All extracted requirements are CV-assessable.</span></div>';
}

function renderMasking(report = {}) {
  const cv = report.cv || {};
  const labels = {
    names: 'Names', phones: 'Phones', emails: 'Emails', profiles: 'Profiles', dob: 'DOB', nationality: 'Nationality', gender: 'Gender', maritalStatus: 'Marital', addresses: 'Addresses', employers: 'Employers',
  };
  $('maskingReport').innerHTML = Object.entries(labels).map(([key, label]) => `<span class="mask-chip">${label}<strong>${Number(cv[key] || 0)}</strong></span>`).join('');
}

function renderAudit(result) {
  const audit = result.audit || {};
  const rows = [
    ['Model', audit.model || '—'],
    ['Scoring policy', audit.scoringVersion || '—'],
    ['Reference year', audit.scoringReferenceYear ?? '—'],
    ['JD intelligence', audit.warmStructuredJdUsed ? 'Reused from browser' : 'Structured on this run'],
    ['Raw CV stored', audit.rawCandidateStored ? 'Yes' : 'No'],
    ['Server database', audit.serverDatabaseUsed ? 'Used' : 'None'],
  ];
  $('auditMeta').innerHTML = rows.map(([label, value]) => `<div class="audit-line"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`).join('');
}

function renderResult(result) {
  $('emptyState').classList.add('hidden');
  $('loadingState').classList.add('hidden');
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

  renderSignals(result);
  renderEvidenceMatrix(result.breakdownTable || []);
  renderMasking(result.maskingReport);
  renderAudit(result);

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

async function exportServer(format) {
  if (!state.result) return;
  const button = format === 'pdf' ? $('downloadPdfBtn') : $('downloadDocxBtn');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '…';
  try {
    const response = await fetch(`/api/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: state.result }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Unable to create ${format.toUpperCase()} report.`);
    }
    downloadBlob(await response.blob(), reportFilename(format));
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

async function loadRuntimeMeta() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    state.runtimeMeta = {
      scoringVersion: data.scoringVersion || 'unknown',
      promptVersion: data.promptVersion || 'unknown',
      referenceYear: data.referenceYear ?? 'unknown',
      model: data.model || 'unknown',
    };
  } catch {
    // The evaluator will surface network errors when the user runs an evaluation.
  }
}

await loadRuntimeMeta();
refreshJdCacheState();
