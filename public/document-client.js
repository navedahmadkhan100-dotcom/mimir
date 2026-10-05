(function () {
  const MAX_VISUALS = 6;
  const MAX_DOCX_VISUALS = 4;
  const MAX_VISUAL_EDGE = 1280;
  const JPEG_QUALITY = 0.70;
  const MAX_PDF_PAGES = 80;
  const MAX_JD_TEXT_CHARS = 150000;
  const MAX_CV_TEXT_CHARS = 250000;
  const MAX_PREPARED_VISUAL_BYTES = 800 * 1024;
  const MAX_DOCX_ENTRIES = 2000;
  const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
  const MAX_DOCX_XML_BYTES = 8 * 1024 * 1024;
  const MAX_DOCX_MEDIA_BYTES = 24 * 1024 * 1024;
  const MAX_DOCX_SINGLE_MEDIA_BYTES = 6 * 1024 * 1024;
  const OCR_TIMEOUT_MS = 4500;
  const PDF_OPERATOR_TIMEOUT_MS = 1400;
  const VISUAL_HINT = /\b(architecture|architectural|diagram|topology|workflow|flowchart|chart|graph|design|network|solution|infrastructure|schema|model|dashboard|roadmap|process|sequence|data\s+flow)\b/i;


  let tesseractPromise;
  async function getTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (!tesseractPromise) {
      tesseractPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR engine did not initialize.'));
        script.onerror = () => reject(new Error('OCR engine failed to load.'));
        document.head.appendChild(script);
      });
    }
    return tesseractPromise;
  }

  let pdfjsPromise;
  async function pdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        return lib;
      });
    }
    return pdfjsPromise;
  }

  function timeout(promise, ms, fallback = null) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
    ]);
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

    async function encode(target, q) {
      return new Promise((resolve,reject) => target.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to encode visual asset.')), 'image/jpeg', q));
    }

    let q = quality;
    let blob = await encode(output, q);
    while (blob.size > MAX_PREPARED_VISUAL_BYTES && q > 0.42) {
      q = Math.max(0.42, q - 0.08);
      blob = await encode(output, q);
    }
    if (blob.size > MAX_PREPARED_VISUAL_BYTES) {
      const scale = Math.sqrt(MAX_PREPARED_VISUAL_BYTES / blob.size) * 0.92;
      const smaller = document.createElement('canvas');
      smaller.width = Math.max(320, Math.round(output.width * scale));
      smaller.height = Math.max(320, Math.round(output.height * scale));
      smaller.getContext('2d').drawImage(output, 0, 0, smaller.width, smaller.height);
      output = smaller;
      blob = await encode(output, 0.48);
    }
    if (blob.size > MAX_PREPARED_VISUAL_BYTES) throw new Error("Visual asset could not be compressed inside Mimir's privacy-safe payload limit.");
    return { base64:dataUrlToBase64(await blobDataUrl(blob)), mimeType:'image/jpeg', width:output.width, height:output.height };
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

  function isDirectSensitiveToken(raw, sensitiveTokens) {
    const token = normalizedToken(raw);
    if (!token) return false;
    const directPattern = /@|linkedin|github|gitlab|bitbucket|stackoverflow|passport|nationalinsurance|postcode/i.test(token)
      || /^(?:sc|dv|bpss|ctc)$/i.test(token);
    return sensitiveTokens.has(token) || directPattern;
  }

  async function scrubCanvas(canvas, sensitiveText, worker) {
    try {
      const first = await timeout(worker.recognize(canvas), OCR_TIMEOUT_MS, null);
      if (!first) return { ok:false, timedOut:true, redactions:0, ocrText:'', leaks:['ocr_timeout'] };
      const ctx = canvas.getContext('2d');
      const sensitiveTokens = sensitiveTokenSet(sensitiveText);
      const blocks = first?.data?.blocks || [];
      let redactions = 0;
      const ocrWords = [];

      for (const block of blocks) for (const para of block.paragraphs || []) for (const line of para.lines || []) for (const word of line.words || []) {
        const raw = String(word.text || '').trim();
        if (raw) ocrWords.push(raw);
        if (!isDirectSensitiveToken(raw, sensitiveTokens)) continue;
        const b = word.bbox || {};
        ctx.fillStyle = '#111827';
        ctx.fillRect(Math.max(0,(b.x0||0)-3),Math.max(0,(b.y0||0)-2),Math.max(2,((b.x1||0)-(b.x0||0))+6),Math.max(2,((b.y1||0)-(b.y0||0))+4));
        redactions += 1;
      }
      return { ok:true, redactions, ocrText:ocrWords.join(' '), leaks:[] };
    } catch {
      return { ok:false, redactions:0, ocrText:'', leaks:['ocr_failure'] };
    }
  }

  // Native-text PDFs do not need expensive OCR just to cover names/contact details.
  // PDF.js already knows where each text item is drawn, so redact matching items directly
  // on the rendered page. OCR is reserved for scan/image-only pages.
  async function scrubNativePdfText(canvas, page, viewport, lib, pageText) {
    const sensitiveTokens = sensitiveTokenSet(pageText);
    if (!sensitiveTokens.size) return { redactions:0 };
    const content = await page.getTextContent();
    const ctx = canvas.getContext('2d');
    let redactions = 0;
    for (const item of content.items || []) {
      const raw = String(item.str || '').trim();
      if (!raw || !isDirectSensitiveToken(raw, sensitiveTokens)) continue;
      try {
        const tx = lib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.max(8, Math.hypot(tx[2], tx[3]));
        const x = tx[4];
        const y = tx[5] - fontHeight;
        const width = Math.max(fontHeight, Number(item.width || 0) * viewport.scale);
        ctx.fillStyle = '#111827';
        ctx.fillRect(Math.max(0, x - 3), Math.max(0, y - 3), Math.max(4, width + 6), Math.max(4, fontHeight + 7));
        redactions += 1;
      } catch {
        // Coordinate failure for one text item should never block the document.
      }
    }
    return { redactions };
  }

  async function pdfPageVisualSignal(page, lib, text) {
    if (VISUAL_HINT.test(text)) return true;
    try {
      const ops = await timeout(page.getOperatorList(), PDF_OPERATOR_TIMEOUT_MS, null);
      if (!ops) return false;
      const imageOps = new Set([lib.OPS?.paintImageXObject, lib.OPS?.paintInlineImageXObject, lib.OPS?.paintImageMaskXObject].filter((x)=>x !== undefined));
      const pathOps = new Set([lib.OPS?.constructPath, lib.OPS?.stroke, lib.OPS?.fill, lib.OPS?.eoFill].filter((x)=>x !== undefined));
      let images=0, vectors=0;
      for (const fn of ops.fnArray || []) { if (imageOps.has(fn)) images += 1; if (pathOps.has(fn)) vectors += 1; }
      // A raster-only page is often a photo/logo; require a text hint. Vector-heavy pages
      // are much more likely to be diagrams/charts.
      if (images > 0 && vectors < 45) return false;
      return vectors >= 45;
    } catch {
      return false;
    }
  }

  function docIntelBase(format, textChars, pageCount = null, supportsVisuals = false) {
    return {
      format,
      pageCount,
      nativeTextCharacters:textChars,
      visualCandidatesDetected:0,
      visualAssetsPrepared:0,
      visualAssetsWithheld:0,
      visualPages:[],
      mode:'text-only',
      visualStatus:supportsVisuals ? 'preparing' : 'none',
      notes:supportsVisuals ? ['Text is ready. Diagrams/charts are prepared in the background and do not block CV readiness.'] : [],
    };
  }

  async function extractPdfText(file, kind) {
    const lib = await pdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data:bytes }).promise;
    if (doc.numPages > MAX_PDF_PAGES) throw new Error(`PDF has ${doc.numPages} pages. Mimir accepts up to ${MAX_PDF_PAGES} pages per document.`);
    const pageTexts = [];
    let extractedChars = 0;
    for (let n=1;n<=doc.numPages;n+=1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((i)=>`${i.str || ''}${i.hasEOL ? '\n' : ' '}`).join('').replace(/[ \t]+\n/g, '\n').trim();
      extractedChars += text.length;
      const maxTextChars = kind === 'jd' ? MAX_JD_TEXT_CHARS : MAX_CV_TEXT_CHARS;
      if (extractedChars > maxTextChars) throw new Error(`PDF contains too much extracted text to process safely (maximum ${maxTextChars.toLocaleString()} characters).`);
      pageTexts.push(text);
    }
    const rawText = pageTexts.map((text,index)=>`[PAGE ${index+1}]\n${text}`).join('\n\n');
    const masked = window.MimirPrivacy.mask(rawText, kind);
    return {
      text:masked.maskedText,
      maskingReport:masked.report,
      visualAssets:[],
      documentIntelligence:docIntelBase('pdf', rawText.length, doc.numPages, true),
      _visualContext:{ pageTexts },
    };
  }

  async function preparePdfVisuals(file, kind, textData, onAsset) {
    const lib = await pdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data:bytes }).promise;
    const pageTexts = textData?._visualContext?.pageTexts || [];
    const visualPages = [];

    // Hinted pages are cheap and get priority. Operator-list scanning then finds vector
    // diagrams/charts that do not explicitly contain words such as "diagram" or "chart".
    for (let n=1;n<=doc.numPages && visualPages.length<MAX_VISUALS;n+=1) {
      if (VISUAL_HINT.test(pageTexts[n-1] || '')) visualPages.push(n);
    }
    for (let n=1;n<=doc.numPages && visualPages.length<MAX_VISUALS;n+=1) {
      if (visualPages.includes(n)) continue;
      const page = await doc.getPage(n);
      if (await pdfPageVisualSignal(page, lib, pageTexts[n-1] || '')) visualPages.push(n);
    }

    const assets = [];
    let withheld = 0;
    let ocrWorker = null;
    try {
      for (const n of visualPages) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale:1.15 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext:canvas.getContext('2d'), viewport }).promise;

        if (kind === 'cv') {
          const pageText = pageTexts[n-1] || '';
          if (pageText.trim().length >= 40) {
            await scrubNativePdfText(canvas, page, viewport, lib, pageText);
          } else {
            if (!ocrWorker) { const Tesseract = await getTesseract(); ocrWorker = await Tesseract.createWorker('eng'); }
            const scrub = await scrubCanvas(canvas, pageText, ocrWorker);
            if (!scrub.ok) {
              withheld += 1;
              if (scrub.timedOut) { await ocrWorker?.terminate?.(); ocrWorker = null; }
              continue;
            }
          }
        }

        const enc = await canvasJpeg(canvas);
        const asset = {
          id:`${kind==='cv'?'CV':'JD'}-V${assets.length+1}`,
          ...enc,
          sourcePage:n,
          sourceHint:`PDF page ${n} rendered visual context`,
          nearbyText:window.MimirPrivacy.mask(pageTexts[n-1] || '', kind).maskedText,
          origin:'browser-rendered-page',
        };
        assets.push(asset);
        onAsset?.(asset, assets.length);
      }
    } finally {
      await ocrWorker?.terminate?.();
    }

    return {
      visualAssets:assets,
      documentIntelligence:{
        ...docIntelBase('pdf', textData?.documentIntelligence?.nativeTextCharacters || 0, doc.numPages, true),
        visualCandidatesDetected:visualPages.length,
        visualAssetsPrepared:assets.length,
        visualAssetsWithheld:withheld,
        visualPages,
        mode:assets.length?'text+visual':'text-only',
        visualStatus:'ready',
        notes:['Visuals prepared in the background. Native-text PDF pages use coordinate-based PII masking; OCR is reserved for scanned/image-only pages.'],
      },
    };
  }

  async function loadDocx(file) {
    const buffer = await file.arrayBuffer();
    if (!window.mammoth || !window.JSZip) throw new Error('DOCX parser failed to load.');
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files || {});
    if (entries.length > MAX_DOCX_ENTRIES) throw new Error('DOCX contains too many internal files to process safely.');
    let totalUncompressed = 0;
    let mediaUncompressed = 0;
    for (const entry of entries) {
      const size = Number(entry?._data?.uncompressedSize || 0);
      totalUncompressed += size;
      if (entry.name === 'word/document.xml' && size > MAX_DOCX_XML_BYTES) throw new Error('DOCX document content is too large to process safely.');
      if (/^word\/media\//.test(entry.name || '')) {
        if (size > MAX_DOCX_SINGLE_MEDIA_BYTES) throw new Error('DOCX contains an embedded image that is too large to process safely.');
        mediaUncompressed += size;
      }
    }
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES || mediaUncompressed > MAX_DOCX_MEDIA_BYTES) throw new Error("DOCX expands beyond Mimir's safe processing limit.");
    return { buffer, zip };
  }

  async function extractDocxText(file, kind) {
    const { buffer } = await loadDocx(file);
    const rawText = (await mammoth.extractRawText({ arrayBuffer:buffer })).value || '';
    const maxTextChars = kind === 'jd' ? MAX_JD_TEXT_CHARS : MAX_CV_TEXT_CHARS;
    if (rawText.length > maxTextChars) throw new Error(`DOCX contains too much extracted text to process safely (maximum ${maxTextChars.toLocaleString()} characters).`);
    const masked = window.MimirPrivacy.mask(rawText, kind);
    return {
      text:masked.maskedText,
      maskingReport:masked.report,
      visualAssets:[],
      documentIntelligence:docIntelBase('docx', rawText.length, null, true),
      _visualContext:{ rawText },
    };
  }

  async function prepareDocxVisuals(file, kind, textData, onAsset) {
    const { zip } = await loadDocx(file);
    const rawText = textData?._visualContext?.rawText || '';
    const names = Object.keys(zip.files).filter((n)=>/^word\/media\//.test(n) && !zip.files[n].dir).slice(0,MAX_DOCX_VISUALS*2);
    const assets = [];
    let withheld = 0;
    let ocrWorker = null;
    try {
      for (const name of names) {
        if (assets.length >= MAX_DOCX_VISUALS) break;
        const blob = await zip.files[name].async('blob');
        const img = await createImageBitmap(blob);
        if (img.width < 220 || img.height < 120) { img.close(); withheld += 1; continue; }
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img,0,0);
        img.close();

        if (kind === 'cv') {
          if (!ocrWorker) { const Tesseract = await getTesseract(); ocrWorker = await Tesseract.createWorker('eng'); }
          const scrub = await scrubCanvas(canvas, rawText, ocrWorker);
          const words = String(scrub.ocrText || '').trim().split(/\s+/).filter(Boolean);
          // Failed/slow OCR withholds only this visual. It never blocks the CV text channel.
          if (!scrub.ok || (words.length < 4 && !VISUAL_HINT.test(scrub.ocrText || ''))) {
            withheld += 1;
            if (scrub.timedOut) { await ocrWorker?.terminate?.(); ocrWorker = null; }
            continue;
          }
        }

        const enc = await canvasJpeg(canvas);
        const asset = {
          id:`${kind==='cv'?'CV':'JD'}-V${assets.length+1}`,
          ...enc,
          sourcePage:null,
          sourceHint:`DOCX embedded visual ${assets.length+1}`,
          nearbyText:'',
          origin:'browser-docx-embedded',
        };
        assets.push(asset);
        onAsset?.(asset, assets.length);
      }
    } finally {
      await ocrWorker?.terminate?.();
    }

    return {
      visualAssets:assets,
      documentIntelligence:{
        ...docIntelBase('docx', textData?.documentIntelligence?.nativeTextCharacters || 0, null, true),
        visualCandidatesDetected:names.length,
        visualAssetsPrepared:assets.length,
        visualAssetsWithheld:withheld,
        mode:assets.length?'text+visual':'text-only',
        visualStatus:'ready',
        notes:['Embedded visuals are prepared in the background. OCR timeout/failure withholds only the affected visual and never blocks CV readiness.'],
      },
    };
  }

  async function extractText(file, kind) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') return extractPdfText(file,kind);
    if (ext === 'docx') return extractDocxText(file,kind);
    if (ext === 'txt') {
      const rawText = await file.text();
      const maxTextChars = kind === 'jd' ? MAX_JD_TEXT_CHARS : MAX_CV_TEXT_CHARS;
      if (rawText.length > maxTextChars) throw new Error(`TXT contains too much text to process safely (maximum ${maxTextChars.toLocaleString()} characters).`);
      const masked = window.MimirPrivacy.mask(rawText,kind);
      return { text:masked.maskedText, maskingReport:masked.report, visualAssets:[], documentIntelligence:docIntelBase('txt',rawText.length,null,false), _visualContext:null };
    }
    throw new Error('Unsupported file type.');
  }

  async function prepareVisuals(file, kind, textData, options = {}) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') return preparePdfVisuals(file,kind,textData,options.onAsset);
    if (ext === 'docx') return prepareDocxVisuals(file,kind,textData,options.onAsset);
    return { visualAssets:[], documentIntelligence:textData.documentIntelligence };
  }

  // Compatibility method for older callers/tests. The UI uses the split text-first API.
  async function extract(file, kind) {
    const textData = await extractText(file,kind);
    const visualData = await prepareVisuals(file,kind,textData);
    return {
      text:textData.text,
      maskingReport:textData.maskingReport,
      visualAssets:visualData.visualAssets || [],
      documentIntelligence:visualData.documentIntelligence || textData.documentIntelligence,
    };
  }

  window.MimirDocumentClient = {
    extract,
    extractText,
    prepareVisuals,
    version:'browser-document-intelligence-2.6.0-text-first-background-visuals',
  };
})();
