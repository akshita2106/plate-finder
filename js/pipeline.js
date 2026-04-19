/* ═══════════════════════════════════════════════
   PlateVision — Image Processing Pipeline
   Core ANPR pipeline using OpenCV.js
   ═══════════════════════════════════════════════ */

const Pipeline = (() => {
  'use strict';

  let cvReady = false;

  /**
   * Set OpenCV ready state
   */
  function setReady(state) {
    cvReady = state;
    console.log(`[Pipeline] OpenCV.js ready: ${state}`);
  }

  function isReady() {
    return cvReady;
  }

  /**
   * Run the full ANPR pipeline on a source canvas
   * Returns pipeline step results for visualization
   */
  async function process(sourceCanvas) {
    if (!cvReady) throw new Error('OpenCV.js not ready');

    const steps = [];
    const timer = new Utils.Timer().start();

    // Read source image from canvas
    let src = cv.imread(sourceCanvas);

    try {
      // ── Step 1: Original ──
      steps.push({
        label: 'Original',
        desc: 'Input image',
        canvas: matToCanvas(src),
      });
      timer.mark('original');

      // ── Step 2: Grayscale ──
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      steps.push({
        label: 'Grayscale',
        desc: 'Luminance channel',
        canvas: matToCanvas(gray),
      });
      timer.mark('grayscale');

      // ── Step 3: Bilateral Filter ──
      let filtered = new cv.Mat();
      cv.bilateralFilter(gray, filtered, 11, 17, 17);
      steps.push({
        label: 'Filtered',
        desc: 'Bilateral noise reduction',
        canvas: matToCanvas(filtered),
      });
      timer.mark('bilateral');

      // ── Step 4: Canny Edge Detection ──
      let edges = new cv.Mat();
      cv.Canny(filtered, edges, 30, 200);
      steps.push({
        label: 'Edges',
        desc: 'Canny edge detection',
        canvas: matToCanvas(edges),
      });
      timer.mark('canny');

      // ── Step 5: Contour Detection ──
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

      // Draw all contours on a copy
      let contourVis = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
      for (let i = 0; i < contours.size(); i++) {
        let color = new cv.Scalar(
          Math.random() * 200 + 55,
          Math.random() * 200 + 55,
          Math.random() * 200 + 55
        );
        cv.drawContours(contourVis, contours, i, color, 1);
      }
      steps.push({
        label: 'Contours',
        desc: `${contours.size()} contours found`,
        canvas: matToCanvas(contourVis),
      });
      timer.mark('contours');
      contourVis.delete();

      // ── Step 6: Plate Candidate Filtering ──
      let plateContour = findPlateContour(contours, src.cols, src.rows);

      if (!plateContour) {
        // Clean up
        gray.delete(); filtered.delete(); edges.delete();
        contours.delete(); hierarchy.delete(); src.delete();
        
        return {
          success: false,
          error: 'No plate-like region found. Try a clearer image with a visible license plate.',
          steps,
          time: timer.elapsed(),
          timeFormatted: timer.format(),
        };
      }

      // Draw the detected plate bounding box
      let boxVis = src.clone();
      drawPlateBox(boxVis, plateContour);
      steps.push({
        label: 'Detection',
        desc: 'Plate bounding box',
        canvas: matToCanvas(boxVis),
      });
      timer.mark('detection');
      boxVis.delete();

      // ── Step 7: Crop Plate Region ──
      let plateRegion = extractPlateRegion(src, plateContour);
      steps.push({
        label: 'Cropped',
        desc: 'Plate region extracted',
        canvas: matToCanvas(plateRegion),
      });
      timer.mark('crop');

      // ── Step 8: Enhance for OCR ──
      let enhanced = enhancePlate(plateRegion);
      steps.push({
        label: 'Enhanced',
        desc: 'Threshold + morphology',
        canvas: matToCanvas(enhanced),
      });
      timer.mark('enhance');

      // Get OCR canvas
      let ocrCanvas = matToCanvas(enhanced);

      // Clean up OpenCV mats
      gray.delete(); filtered.delete(); edges.delete();
      contours.delete(); hierarchy.delete();
      plateRegion.delete(); enhanced.delete(); src.delete();

      return {
        success: true,
        ocrCanvas,
        steps,
        time: timer.elapsed(),
        timeFormatted: timer.format(),
        marks: timer.marks,
      };

    } catch (err) {
      // Clean up on error
      try { src.delete(); } catch(_) {}
      console.error('[Pipeline] Error:', err);
      return {
        success: false,
        error: `Processing error: ${err.message}`,
        steps,
        time: timer.elapsed(),
        timeFormatted: timer.format(),
      };
    }
  }

  /**
   * Find the best plate-like contour from all detected contours
   */
  function findPlateContour(contours, imgWidth, imgHeight) {
    const imgArea = imgWidth * imgHeight;
    const minArea = imgArea * 0.001; // Plate must be at least 0.1% of image
    const maxArea = imgArea * 0.95;  // Plate can legitimately be up to 95% of a cropped image

    let candidates = [];

    for (let i = 0; i < contours.size(); i++) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);

      // Skip too small or too large
      if (area < minArea || area > maxArea) continue;

      let rect = cv.minAreaRect(cnt);
      let width = Math.max(rect.size.width, rect.size.height);
      let height = Math.min(rect.size.width, rect.size.height);
      let aspectRatio = width / height;

      // Approximate polygon
      let peri = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      // Plate aspect ratio: typically 1.5:1 to 7:1
      if (aspectRatio >= 1.5 && aspectRatio <= 7 && height > 10) {
        // Calculate rectangularity (area / bounding box area) to allow rounded corners
        let rectArea = width * height;
        let rectangularity = area / rectArea;

        // Valid plates usually have high rectangularity 
        if (rectangularity > 0.45) {
          // Score prioritizes exact quads, strong aspect ratio matches, and size
          let isQuad = approx.rows === 4;
          let score = area * rectangularity 
            * (isQuad ? 1.5 : 1) 
            * (aspectRatio >= 2 && aspectRatio <= 5 ? 1.2 : 1);

          candidates.push({
            contour: cnt,
            approx: approx,
            area: area,
            rect: rect,
            aspectRatio: aspectRatio,
            score: score,
          });
          continue; // approx is kept, so skip approx.delete() below
        }
      }
      
      approx.delete();
    }

    if (candidates.length === 0) {
      let imgAspectRatio = imgWidth / imgHeight;
      // Allow slightly wider ratios for full image fallback
      if (imgAspectRatio >= 1.2 && imgAspectRatio <= 8 && imgHeight > 10) {
        console.log('[Pipeline] Fallback: Using entire image as plate candidate');
        let rectFallback = {
          center: { x: imgWidth/2, y: imgHeight/2 },
          size: { width: imgWidth, height: imgHeight },
          angle: 0
        };
        return {
          contour: null, 
          approx: null, 
          area: imgWidth * imgHeight,
          rect: rectFallback,
          aspectRatio: imgAspectRatio,
          score: 1,
          isFallback: true
        };
      }
      return null;
    }

    // Sort by score (best candidate first)
    candidates.sort((a, b) => b.score - a.score);

    // Clean up non-selected approximations
    for (let i = 1; i < candidates.length; i++) {
      candidates[i].approx.delete();
    }

    console.log(`[Pipeline] Found ${candidates.length} plate candidate(s). Best: area=${Math.round(candidates[0].area)}, ratio=${candidates[0].aspectRatio.toFixed(2)}`);

    return candidates[0];
  }

  /**
   * Draw a glowing bounding box around the detected plate
   */
  function drawPlateBox(mat, plate) {
    if (plate.isFallback) {
      for (let thickness = 6; thickness >= 2; thickness -= 2) {
        let alpha = thickness === 2 ? 255 : 100;
        cv.rectangle(mat, new cv.Point(0, 0), new cv.Point(mat.cols, mat.rows), new cv.Scalar(59, 130, 246, alpha), thickness);
      }
      return;
    }

    let vertices = cv.RotatedRect.points(plate.rect);

    // Draw a thick glow (multiple layers)
    for (let thickness = 6; thickness >= 2; thickness -= 2) {
      let alpha = thickness === 2 ? 255 : 100;
      let pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push(new cv.Point(
          Math.round(vertices[i].x),
          Math.round(vertices[i].y)
        ));
      }
      
      for (let j = 0; j < 4; j++) {
        cv.line(mat, pts[j], pts[(j + 1) % 4],
          new cv.Scalar(59, 130, 246, alpha), thickness, cv.LINE_AA);
      }
    }
  }

  /**
   * Extract and perspective-correct the plate region
   */
  function extractPlateRegion(src, plate) {
    if (plate.isFallback) {
      let gray;
      if (src.channels() > 1) {
        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      } else {
        gray = src.clone();
      }
      return gray;
    }

    let rect = plate.rect;
    let center = rect.center;
    let size = rect.size;
    let angle = rect.angle;

    // Get width/height correctly oriented
    let w = Math.max(size.width, size.height);
    let h = Math.min(size.width, size.height);

    // Add padding (10% each side)
    let padW = Math.round(w * 0.10);
    let padH = Math.round(h * 0.10);

    // Simple crop with padding (using bounding rect)
    let boundRect = cv.boundingRect(plate.contour);
    let x = Math.max(0, boundRect.x - padW);
    let y = Math.max(0, boundRect.y - padH);
    let cropW = Math.min(src.cols - x, boundRect.width + padW * 2);
    let cropH = Math.min(src.rows - y, boundRect.height + padH * 2);

    let roi = new cv.Rect(x, y, cropW, cropH);
    let cropped = src.roi(roi);

    // Convert to grayscale if color
    let gray;
    if (cropped.channels() > 1) {
      gray = new cv.Mat();
      cv.cvtColor(cropped, gray, cv.COLOR_RGBA2GRAY);
      cropped.delete();
    } else {
      gray = cropped;
    }

    return gray;
  }

  /**
   * Enhance the cropped plate for optimal OCR
   */
  function enhancePlate(plateMat) {
    let result = new cv.Mat();
    
    // Resize 3x for better OCR
    let newW = plateMat.cols * 3;
    let newH = plateMat.rows * 3;
    let dsize = new cv.Size(newW, newH);
    cv.resize(plateMat, result, dsize, 0, 0, cv.INTER_CUBIC);

    // Apply Otsu's thresholding instead of adaptive thresholding
    // because adaptive thresholding with a small block size (11)
    // hollows out thick characters in a 3x enlarged image.
    let binary = new cv.Mat();
    cv.threshold(result, binary, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    
    result.delete();

    // Morphological closing to fill gaps in characters
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    let closed = new cv.Mat();
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);

    binary.delete();
    kernel.delete();

    return closed;
  }

  /**
   * Convert an OpenCV Mat to a canvas element
   */
  function matToCanvas(mat) {
    let canvas = document.createElement('canvas');
    cv.imshow(canvas, mat);
    return canvas;
  }

  return {
    setReady,
    isReady,
    process,
  };
})();

/**
 * Global callback when OpenCV.js finishes loading
 */
function onOpenCVReady() {
  Pipeline.setReady(true);
  if (typeof App !== 'undefined' && App.onLibReady) {
    App.onLibReady('opencv');
  }
}
