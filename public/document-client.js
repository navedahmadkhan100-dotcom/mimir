(function () {
  const MAX_VISUALS = 6;
  const MAX_VISUAL_EDGE = 1280;
  const JPEG_QUALITY = 0.70;
  const VISUAL_HINT = /\b(architecture|architectural|diagram|topology|workflow|flowchart|chart|graph|design|network|solution|infrastructure|schema|model|dashboard|roadmap|process|sequence|data\s+flow)\b/i;

  let pdfjsPromise;
  async function pdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then((lib) => {
        // PDF.js v4 requires an explicit worker URL when loaded as an ES module.
        // Without this, PDF uploads fail with: No \"GlobalWorkerOptions.workerSrc\" specified.
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        return lib;
      });
    }
    return pdfjsPromise;
  }
  function dataUrlToBase64(url) { return String(url).split(',')[1] || ''; }
  function blobDataUrl(blob) { return new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(blob); }); }
  async function canvasJpeg(canvas, quality=JPEG_QUALITY) {
    let output = canvas;
    const longest = Math.max(canvas.width, canvas.height);
    if (longest > MAX_VISUAL_EDGE) {
      const scale = MAX_VISUAL_EDGE / longest;
      const resized = document.createElement('canvas');
      resized.width = Math.max(1, Math.round(canvas.width * scale));
      resized.height = Math.max(1, Math.round(canvas.height * scale));
      resized.getContext('2d').drawImage(canvas, 0, 0, resized.width, resized.height);
      output = resized;
    }
    return new Promise((resolve,reject) => output.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Unable to encode visual asset.'));
      resolve({ base64:dataUrlToBase64(await blobDataUrl(blob)), mimeType:'image/jpeg', width:output.width, height:output.height });
    }, 'image/jpeg', quality));
  }

  function normalizedToken(value='') { return String(value).toLowerCase().replace(/[^a-z0-9@.+_-]/g,''); }
  function sensitiveTokenSet(text='') {
    const phrases = window.MimirPrivacy?.sensitiveTerms?.(text) || [];
    const tokens = new Set();
    for (const phrase of phrases) {
      for (const token of String(phrase).toLowerCase().split(/[^a-z0-9@.+_-]+/)) {
        if (token.length >= 3 || ['sc','dv'].includes(token)) tokens.add(token);
      }
    }
    return tokens;
  }

  async function scrubCanvas(canvas, sensitiveText) {
    let worker;
    try {
      worker = await Tesseract.createWorker('eng');
      const first = await worker.recognize(canvas);
      const ctx = canvas.getContext('2d');
      const sensitiveTokens = sensitiveTokenSet(sensitiveText);
      const blocks = first?.data?.blocks || [];
      let redactions = 0;
      const ocrWords = [];

      for (const block of blocks) for (const para of block.paragraphs || []) for (const line of para.lines || []) for (const word of line.words || []) {
        const raw = String(word.text || '').trim();
        const token = normalizedToken(raw);
        if (raw) ocrWords.push(raw);
        const directPattern = /@|linkedin|github|gitlab|bitbucket|stackoverflow|passport|nationalinsurance|postcode/i.test(token)
          || /^(?:sc|dv|bpSS|ctc)$/i.test(token);
        if (!sensitiveTokens.has(token) && !directPattern) continue;
        const b = word.bbox || {};
        ctx.fillStyle = '#111827';
        ctx.fillRect(Math.max(0,(b.x0||0)-3),Math.max(0,(b.y0||0)-2),Math.max(2,((b.x1||0)-(b.x0||0))+6),Math.max(2,((b.y1||0)-(b.y0||0))+4));
        redactions += 1;
      }

      // Fail closed: OCR the scrubbed result again and refuse transmission if a recognisable sensitive pattern remains.
      const second = await worker.recognize(canvas);
      const postText = String(second?.data?.text || '');
      const leaks = window.MimirPrivacy?.leakScan?.(postText) || [];
      if (leaks.length) return { ok:false, redactions, ocrText:ocrWords.join(' '), leaks };
      return { ok:true, redactions, ocrText:ocrWords.join(' '), leaks:[] };
    } catch {
      return { ok:false, redactions:0, ocrText:'', leaks:['ocr_failure'] };
    } finally {
      await worker?.terminate?.();
    }
  }

  async function pdfPageVisualSignal(page, lib, text, pageNumber) {
    try {
      const ops = await page.getOperatorList();
      const imageOps = new Set([lib.OPS?.paintImageXObject, lib.OPS?.paintInlineImageXObject, lib.OPS?.paintImageMaskXObject].filter((x)=>x !== undefined));
      const pathOps = new Set([lib.OPS?.constructPath, lib.OPS?.stroke, lib.OPS?.fill, lib.OPS?.eoFill].filter((x)=>x !== undefined));
      let images=0, vectors=0;
      for (const fn of ops.fnArray || []) { if (imageOps.has(fn)) images += 1; if (pathOps.has(fn)) vectors += 1; }
      // CV page 1 commonly contains a portrait/logo beside profile text. For privacy,
      // raster-image-only page-1 visuals fail closed even when the page mentions architecture.
      if (pageNumber === 1 && images > 0 && vectors < 45) return false;
      if (VISUAL_HINT.test(text)) return true;
      return images >= 1 || vectors >= 45;
    } catch {
      return false;
    }
  }

  async function extractPdf(file, kind) {
    const lib = await pdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data:bytes }).promise;
    const pageTexts = []; const visualPages = [];
    for (let n=1;n<=doc.numPages;n+=1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((i)=>i.str).join(' ');
      pageTexts.push(text);
      if (visualPages.length < MAX_VISUALS && await pdfPageVisualSignal(page, lib, text, n)) visualPages.push(n);
    }

    const rawText = pageTexts.map((text, index) => `[PAGE ${index + 1}]\n${text}`).join('\n\n');
    const masked = window.MimirPrivacy.mask(rawText, kind);
    const assets = []; let withheld = 0;
    for (const n of visualPages) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale:1.35 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext:canvas.getContext('2d'), viewport }).promise;
      if (kind === 'cv') {
        const scrub = await scrubCanvas(canvas, rawText);
        if (!scrub.ok) { withheld += 1; continue; }
      }
      const enc = await canvasJpeg(canvas);
      assets.push({
        id:`${kind==='cv'?'CV':'JD'}-V${assets.length+1}`,
        ...enc,
        sourcePage:n,
        sourceHint:`PDF page ${n} rendered visual context`,
        nearbyText:window.MimirPrivacy.mask(pageTexts[n-1],kind).maskedText,
        origin:'browser-rendered-page',
      });
    }
    return { text:masked.maskedText, maskingReport:masked.report, visualAssets:assets, documentIntelligence:{ format:'pdf', pageCount:doc.numPages, nativeTextCharacters:rawText.length, visualCandidatesDetected:visualPages.length, visualAssetsPrepared:assets.length, visualAssetsWithheld:withheld, visualPages, mode:assets.length?'text+visual':'text-only', notes:[] } };
  }

  async function extractDocx(file, kind) {
    const buffer = await file.arrayBuffer();
    if (!window.mammoth) throw new Error('DOCX parser failed to load.');
    const rawText = (await mammoth.extractRawText({ arrayBuffer:buffer })).value || '';
    const masked = window.MimirPrivacy.mask(rawText, kind);
    const assets = []; let detected=0, withheld=0;

    if (window.JSZip) {
      const zip = await JSZip.loadAsync(buffer);
      const names = Object.keys(zip.files).filter((n)=>/^word\/media\//.test(n) && !zip.files[n].dir).slice(0,MAX_VISUALS*2);
      detected = names.length;
      for (const name of names) {
        if (assets.length >= MAX_VISUALS) break;
        const blob = await zip.files[name].async('blob');
        const img = await createImageBitmap(blob);
        if (img.width < 220 || img.height < 120) { img.close(); withheld += 1; continue; }
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img,0,0); img.close();

        if (kind === 'cv') {
          const scrub = await scrubCanvas(canvas, rawText);
          const words = String(scrub.ocrText || '').trim().split(/\s+/).filter(Boolean);
          // A substantive technical visual normally contains labels. Withhold likely photos/logos and any failed privacy scrub.
          if (!scrub.ok || (words.length < 4 && !VISUAL_HINT.test(scrub.ocrText || ''))) { withheld += 1; continue; }
        }
        const enc = await canvasJpeg(canvas);
        assets.push({ id:`${kind==='cv'?'CV':'JD'}-V${assets.length+1}`,...enc,sourcePage:null,sourceHint:`DOCX embedded visual ${assets.length+1}`,nearbyText:'',origin:'browser-docx-embedded' });
      }
    }
    return { text:masked.maskedText, maskingReport:masked.report, visualAssets:assets, documentIntelligence:{ format:'docx', pageCount:null, nativeTextCharacters:rawText.length, visualCandidatesDetected:detected, visualAssetsPrepared:assets.length, visualAssetsWithheld:withheld, visualPages:[], mode:assets.length?'text+visual':'text-only', notes:[] } };
  }

  async function extract(file, kind) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') return extractPdf(file,kind);
    if (ext === 'docx') return extractDocx(file,kind);
    if (ext === 'txt') {
      const rawText = await file.text();
      const masked = window.MimirPrivacy.mask(rawText,kind);
      return { text:masked.maskedText, maskingReport:masked.report, visualAssets:[], documentIntelligence:{ format:'txt', pageCount:null, nativeTextCharacters:rawText.length, visualCandidatesDetected:0, visualAssetsPrepared:0, visualAssetsWithheld:0, visualPages:[], mode:'text-only', notes:[] } };
    }
    throw new Error('Unsupported file type.');
  }

  window.MimirDocumentClient = { extract, version:'browser-document-intelligence-2.3.1-pdf-worker-fixed' };
})();
