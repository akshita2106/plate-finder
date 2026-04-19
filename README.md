# PlateVision (plate-finder) — Automatic Number Plate Recognition

A modern, client-side ANPR web application built with **OpenCV.js** and **Tesseract.js**. All image processing runs entirely in the browser — no server required.

## Features

- 🔍 **Full Plate Detection** — Detects complete vehicle license plates using contour analysis. Now robust against tightly cropped inputs!
- 📝 **Accurate OCR** — Extracts plate text using Tesseract.js with optimized settings and Otsu's Thresholding.
- 🎯 **Smart Confidence Scoring** — Intelligently blends OCR confidence with Indian Format Pattern recognition guarantees.
- 📊 **Pipeline Visualization** — See every step: grayscale → edges → contours → detection → OCR.
- 🖼️ **Simulated Sample Plates** — Includes built-in simulated SVGs (Private, Commercial, BH) for instant demo testing straight from the dashboard.
- 🎨 **Modern UI** — Clean, light-themed design with smooth animations.
- 📱 **Responsive** — Works on desktop and mobile.
- 🚀 **Vercel Ready** — Deploy as a static site with zero config.

## Quick Start

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

## Tech Stack

| Technology | Purpose |
|------------|---------|
| OpenCV.js 4.x | Image processing, contour detection |
| Tesseract.js 5.x | Optical Character Recognition |
| Vanilla JS | Application logic |
| CSS3 | Modern styling with animations |

## Deployment

### Vercel (Recommended)
```bash
npx vercel --prod
```

### Any Static Host
Simply upload all files — no build step required.

## License

MIT
