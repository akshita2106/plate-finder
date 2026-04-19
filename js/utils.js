/* ═══════════════════════════════════════════════
   PlateVision — Utility Functions
   ═══════════════════════════════════════════════ */

const Utils = (() => {
  'use strict';

  /**
   * Timer utility for measuring processing time
   */
  class Timer {
    constructor() {
      this.startTime = 0;
      this.marks = {};
    }

    start() {
      this.startTime = performance.now();
      this.marks = {};
      return this;
    }

    mark(label) {
      this.marks[label] = performance.now() - this.startTime;
    }

    elapsed() {
      return performance.now() - this.startTime;
    }

    format(ms) {
      if (ms === undefined) ms = this.elapsed();
      if (ms < 1000) return `${Math.round(ms)}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    }
  }

  /**
   * Clean OCR text — remove garbage characters, normalize spacing
   */
  function cleanPlateText(raw) {
    if (!raw) return '';
    
    // Remove everything except A-Z, 0-9, and spaces
    let cleaned = raw.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
    
    // Collapse multiple spaces into one, trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Remove standalone single characters that are likely noise
    // (except when the plate itself is short)
    if (cleaned.length > 4) {
      cleaned = cleaned.replace(/\b[A-Z0-9]\b/g, '').replace(/\s+/g, ' ').trim();
    }
    
    return cleaned;
  }

  /**
   * Validate plate text against common Indian plate formats
   * Examples: MH12DE1433, KA01AB1234, 22BH6517A
   */
  function validatePlateFormat(text) {
    if (!text || text.length < 4) return { valid: false, confidence: 0 };

    // Common Indian plate patterns
    const patterns = [
      /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/,   // MH12DE1433
      /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}$/,  // KA01AB1234
      /^\d{2}BH\d{4}[A-Z]$/,                // 22BH6517A (BH series)
      /^[A-Z]{2}\d{2}\d{4}$/,               // MH121433
      /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/, // Flexible pattern
    ];

    const noSpaces = text.replace(/\s/g, '');
    
    for (const pattern of patterns) {
      if (pattern.test(noSpaces)) {
        return { valid: true, confidence: 0.95 };
      }
    }

    // Check if it looks plate-like (mix of letters and numbers, reasonable length)
    const hasLetters = /[A-Z]/.test(noSpaces);
    const hasNumbers = /\d/.test(noSpaces);
    const goodLength = noSpaces.length >= 6 && noSpaces.length <= 12;

    if (hasLetters && hasNumbers && goodLength) {
      return { valid: true, confidence: 0.7 };
    }

    return { valid: false, confidence: 0.3 };
  }

  /**
   * Format plate text for display (add spacing)
   */
  function formatPlateDisplay(text) {
    if (!text) return '--';
    const noSpaces = text.replace(/\s/g, '');
    
    // Try to format as: XX 00 XX 0000
    const match = noSpaces.match(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/);
    if (match) {
      return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }

    // BH series: 00 BH 0000 X
    const bhMatch = noSpaces.match(/^(\d{2})(BH)(\d{4})([A-Z])$/);
    if (bhMatch) {
      return `${bhMatch[1]} ${bhMatch[2]} ${bhMatch[3]} ${bhMatch[4]}`;
    }

    return noSpaces;
  }

  /**
   * Get confidence level class
   */
  function getConfidenceClass(confidence) {
    if (confidence >= 70) return 'high';
    if (confidence >= 40) return 'medium';
    return 'low';
  }

  /**
   * Guess plate region from state code
   */
  function guessRegion(text) {
    const stateMap = {
      'AP': 'Andhra Pradesh', 'AR': 'Arunachal Pradesh', 'AS': 'Assam',
      'BR': 'Bihar', 'CG': 'Chhattisgarh', 'GA': 'Goa', 'GJ': 'Gujarat',
      'HR': 'Haryana', 'HP': 'Himachal Pradesh', 'JH': 'Jharkhand',
      'KA': 'Karnataka', 'KL': 'Kerala', 'MP': 'Madhya Pradesh',
      'MH': 'Maharashtra', 'MN': 'Manipur', 'ML': 'Meghalaya',
      'MZ': 'Mizoram', 'NL': 'Nagaland', 'OD': 'Odisha', 'PB': 'Punjab',
      'RJ': 'Rajasthan', 'SK': 'Sikkim', 'TN': 'Tamil Nadu',
      'TS': 'Telangana', 'TR': 'Tripura', 'UK': 'Uttarakhand',
      'UP': 'Uttar Pradesh', 'WB': 'West Bengal', 'DL': 'Delhi',
      'CH': 'Chandigarh', 'DN': 'Dadra & Nagar Haveli',
      'DD': 'Daman & Diu', 'JK': 'Jammu & Kashmir',
      'LA': 'Ladakh', 'LD': 'Lakshadweep', 'PY': 'Puducherry',
    };

    if (!text || text.length < 2) return 'Unknown';
    
    const noSpaces = text.replace(/\s/g, '');
    
    // BH series
    if (/^\d{2}BH/.test(noSpaces)) return 'Bharat (National)';
    
    const prefix = noSpaces.substring(0, 2);
    return stateMap[prefix] || 'Unknown';
  }

  /**
   * Load an image file into a canvas and return it
   */
  function loadImageToCanvas(file, canvas) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Limit max dimensions for performance
          const MAX_DIM = 1200;
          let w = img.width;
          let h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            const scale = MAX_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve({ width: w, height: h });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert canvas to a data URL (for display in pipeline steps)
   */
  function canvasToDataURL(canvas) {
    return canvas.toDataURL('image/png');
  }

  /**
   * Debounce helper
   */
  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  // Public API
  return {
    Timer,
    cleanPlateText,
    validatePlateFormat,
    formatPlateDisplay,
    getConfidenceClass,
    guessRegion,
    loadImageToCanvas,
    canvasToDataURL,
    debounce,
  };
})();
