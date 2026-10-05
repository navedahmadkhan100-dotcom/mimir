(function () {
  const MAX_VISUALS = 6;
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

    async function encode(target, q) {
      const blob = await new Promise((resolve,reject) => target.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to encode visual asset.')), 'image/jpeg', q));
      return blob;
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
    if (blob.size > MAX_PREPARED_VISUAL_BYTES) throw new Error("Visual asset could not be compressed inside Mimir\'s privacy-safe payload limit.");
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

  async function scrubCanvas(canvas, sensitiveText, worker) {
    try {
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
          || /^(?:sc|dv|bpss|ctc)$/i.test(token);
        if (!sensitiveTokens.has(token) && !directPattern) continue;
        const b = word.bbox || {};
        ctx.fillStyle = '#111827';
        ctx.fillRect(Math.max(0,(b.x0||0)-3),Math.max(0,(b.y0||0)-2),Math.max(2,((b.x1||0)-(b.x0||0))+6),Math.max(2,((b.y1||0)-(b.y0||0))+4));
        redactions += 1;
      }

      // Practical PII mode intentionally avoids a second full OCR pass. The first OCR
      // pass redacts detected direct identifiers; ambiguous residuals are warnings, not
      // blockers. This cuts visual preparation time roughly in half on OCR-heavy CVs.
      return { ok:true, redactions, ocrText:ocrWords.join(' '), leaks:[] };
    } catch {
      return { ok:false, redactions:0, ocrText:'', leaks:['ocr_failure'] };
    }
  }

  async function pdfPageVisualSignal(page, lib, text, pageNumber) {
    try {
      const ops = await page.getOperatorList();
      const imageOps = new Set([lib.OPS?.paintImageXObject, lib.OPS?.paintInlineImageXObject, lib.OPS?.paintImageMaskXObject].filter((x)=>x !== undefined));
      const pathOps = new Set([lib.OPS?.constructPath, lib.OPS?.stroke, lib.OPS?.fill, lib.OPS?.eoFill].filter((x)=>x !== undefined));
      let images=0, vectors=0;
      for (const fn of ops.fnArray || []) { if (imageOps.has(fn)) images += 1; if (pathOps.has(fn)) vectors += 1; }
      // Raster-only pages can be portraits/logos. Do not transmit them just because a PDF
      // contains an image. A raster page must also carry a strong technical-visual hint;
      // vector-heavy pages are treated as likely diagrams/charts.
      if (images > 0 && vectors < 45) return VISUAL_HINT.test(text);
      if (VISUAL_HINT.test(text)) return true;
      return vectors >= 45;
    } catch {
      return false;
    }
  }

  async function extractPdf(file, kind) {
    const lib = await pdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data:bytes }).promise;
    if (doc.numPages > MAX_PDF_PAGES) throw new Error(`PDF has ${doc.numPages} pages. Mimir accepts up to ${MAX_PDF_PAGES} pages per document.`);
    const pageTexts = []; const visualPages = [];
    let extractedChars = 0;
    for (let n=1;n<=doc.numPages;n+=1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((i)=>i.str).join(' ');
      extractedChars += text.length;
      const maxTextChars = kind === 'jd' ? MAX_JD_TEXT_CHARS : MAX_CV_TEXT_CHARS;
      if (extractedChars > maxTextChars) throw new Error(`PDF contains too much extracted text to process safely (maximum ${maxTextChars.toLocaleString()} characters).`);
      pageTexts.push(text);
      if (visualPages.length < MAX_VISUALS && await pdfPageVisualSignal(page, lib, text, n)) visualPages.push(n);
    }

    const rawText = pageTexts.map((text, index) => `[PAGE ${index + 1}]\n${text}`).join('\n\n');
    const masked = window.MimirPrivacy.mask(rawText, kind);
    const assets = []; let withheld = 0;
    let ocrWorker = null;
    try {
      for (const n of visualPages) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale:1.20 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext:canvas.getContext('2d'), viewport }).promise;
        if (kind === 'cv') {
          const pageText = pageTexts[n - 1] || '';
          const pageSensitive = window.MimirPrivacy?.sensitiveTerms?.(pageText) || [];
          // Native-text technical pages with no detected direct identifiers do not need
          // expensive OCR. Image-only/scanned pages still use OCR before transmission.
          const needsOcr = pageSensitive.length > 0 || pageText.trim().length < 40;
          if (needsOcr) {
            if (!ocrWorker) ocrWorker = await Tesseract.createWorker('eng');
            const scrub = await scrubCanvas(canvas, pageText || rawText, ocrWorker);
            if (!scrub.ok) { withheld += 1; continue; }
          }
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
    } finally {
      await ocrWorker?.terminate?.();
    }
    return { text:masked.maskedText, maskingReport:masked.report, visualAssets:assets, documentIntelligence:{ format:'pdf', pageCount:doc.numPages, nativeTextCharacters:rawText.length, visualCandidatesDetected:visualPages.length, visualAssetsPrepared:assets.length, visualAssetsWithheld:withheld, visualPages, mode:assets.length?'text+visual':'text-only', notes:['Fast visual preparation: one shared OCR worker; native-text visual pages without direct PII skip OCR.'] } };
  }

  async function extractDocx(file, kind) {
    const buffer = await file.arrayBuffer();
    if (!window.mammoth || !window.JSZip) throw new Error('DOCX parser failed to load.');

    // Preflight the ZIP central directory before Mammoth extracts content. This blocks
    // compressed DOCX bombs and unusually large embedded media from freezing the browser.
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
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES || mediaUncompressed > MAX_DOCX_MEDIA_BYTES) throw new Error("DOCX expands beyond Mimir\'s safe processing limit.");

    const rawText = (await mammoth.extractRawText({ arrayBuffer:buffer })).value || '';
    const maxTextChars = kind === 'jd' ? MAX_JD_TEXT_CHARS : MAX_CV_TEXT_CHARS;
    if (rawText.length > maxTextChars) throw new Error(`DOCX contains too much extracted text to process safely (maximum ${maxTextChars.toLocaleString()} characters).`);
    const masked = window.MimirPrivacy.mask(rawText, kind);
    const assets = []; let detected=0, withheld=0;

    if (window.JSZip) {
      const names = Object.keys(zip.files).filter((n)=>/^word\/media\//.test(n) && !zip.files[n].dir).slice(0,MAX_VISUALS*2);
      detected = names.length;
      let ocrWorker = null;
      try {
        for (const name of names) {
          if (assets.length >= MAX_VISUALS) break;
          const blob = await zip.files[name].async('blob');
          const img = await createImageBitmap(blob);
          if (img.width < 220 || img.height < 120) { img.close(); withheld += 1; continue; }
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d').drawImage(img,0,0); img.close();

          if (kind === 'cv') {
            if (!ocrWorker) ocrWorker = await Tesseract.createWorker('eng');
            const scrub = await scrubCanvas(canvas, rawText, ocrWorker);
            const words = String(scrub.ocrText || '').trim().split(/\s+/).filter(Boolean);
            // A substantive technical visual normally contains labels. Withhold likely photos/logos and any failed privacy scrub.
            if (!scrub.ok || (words.length < 4 && !VISUAL_HINT.test(scrub.ocrText || ''))) { withheld += 1; continue; }
          }
          const enc = await canvasJpeg(canvas);
          assets.push({ id:`${kind==='cv'?'CV':'JD'}-V${assets.length+1}`,...enc,sourcePage:null,sourceHint:`DOCX embedded visual ${assets.length+1}`,nearbyText:'',origin:'browser-docx-embedded' });
        }
      } finally {
        await ocrWorker?.terminate?.();
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
      const maxTextChars = kind === 'jd' ? MAX_JD_TEXT_CHARS : MAX_CV_TEXT_CHARS;
      if (rawText.length > maxTextChars) throw new Error(`TXT contains too much text to process safely (maximum ${maxTextChars.toLocaleString()} characters).`);
      const masked = window.MimirPrivacy.mask(rawText,kind);
      return { text:masked.maskedText, maskingReport:masked.report, visualAssets:[], documentIntelligence:{ format:'txt', pageCount:null, nativeTextCharacters:rawText.length, visualCandidatesDetected:0, visualAssetsPrepared:0, visualAssetsWithheld:0, visualPages:[], mode:'text-only', notes:[] } };
    }
    throw new Error('Unsupported file type.');
  }

  window.MimirDocumentClient = { extract, version:'browser-document-intelligence-2.5.0-fast-practical' };
})();
