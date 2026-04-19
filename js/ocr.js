/* ═══════════════════════════════════════════════
   PlateVision — OCR Engine (Tesseract.js)
   ═══════════════════════════════════════════════ */

const OCREngine = (() => {
  'use strict';

  let worker = null;
  let isReady = false;

  /**
   * Initialize the Tesseract worker
   */
  async function init(onProgress) {
    try {
      if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js not loaded');
      }

      worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (onProgress && m.progress) {
            onProgress({
              status: m.status,
              progress: Math.round(m.progress * 100),
            });
          }
        },
      });

      // Set recognition parameters optimized for license plates
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        tessedit_pageseg_mode: '7', // Single text line
        preserve_interword_spaces: '0',
      });

      isReady = true;
      console.log('[OCR] Tesseract.js worker initialized');
      return true;
    } catch (err) {
      console.error('[OCR] Failed to initialize:', err);
      throw err;
    }
  }

  /**
   * Perform OCR on a canvas element
   * @param {HTMLCanvasElement} canvas - The enhanced plate image
   * @returns {Object} { text, confidence, rawText }
   */
  async function recognize(canvas) {
    if (!isReady || !worker) {
      throw new Error('OCR engine not initialized');
    }

    try {
      const result = await worker.recognize(canvas);
      const rawText = result.data.text.trim();
      const confidence = Math.round(result.data.confidence);
      
      // Clean the OCR output
      const cleanedText = Utils.cleanPlateText(rawText);
      
      console.log(`[OCR] Raw: "${rawText}" → Cleaned: "${cleanedText}" (${confidence}%)`);

      return {
        text: cleanedText,
        rawText: rawText,
        confidence: confidence,
        words: result.data.words || [],
      };
    } catch (err) {
      console.error('[OCR] Recognition failed:', err);
      throw err;
    }
  }

  /**
   * Terminate the worker to free memory
   */
  async function terminate() {
    if (worker) {
      await worker.terminate();
      worker = null;
      isReady = false;
    }
  }

  /**
   * Check if the engine is ready
   */
  function ready() {
    return isReady;
  }

  return {
    init,
    recognize,
    terminate,
    ready,
  };
})();
