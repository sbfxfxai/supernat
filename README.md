# New Super Natural Nail & Spa

Enterprise-level single-page website for **New Super Natural Nail & Spa** — Elizabeth, NJ.

## 🌐 Live Site

Open `index.html` in any browser, or host on any static file server / GitHub Pages.

## 📍 Business Info

- **Address:** 1172 Dickinson St, Elizabeth, NJ 07201
- **Phone:** (908) 344-6220
- **Hours:** Mon–Sat 9:00 AM – 7:00 PM · Sun 10:00 AM – 6:00 PM
- **Google Rating:** 4.5 ★

## ✨ Features

- Sticky top bar with **live Open/Closed status** (NJ timezone)
- Fully responsive — mobile hamburger nav, fluid layouts
- Six service sections: Manicures, Pedicures, Enhancements, Nail Design, Eyelash Extensions, Waxing
- Real Google review quotes
- Embedded Google Map + tap-to-call buttons throughout
- Today's hours auto-highlighted in the schedule table
- Zero dependencies — pure HTML + CSS + vanilla JS

## 🛠 Tech Stack

- Pure HTML5 / CSS3 (no framework)
- `oklch()` color functions, `clamp()` fluid sizing
- Google Fonts: Playfair Display + DM Sans
- Vanilla JS for hours logic & mobile nav

## 🚀 Deployment

### GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source: main / root**
3. Site will be live at `https://<username>.github.io/<repo>/`

### Any Static Host (Netlify, Vercel, etc.)

Drop the repo root — `index.html` is the entry point.

## 📸 Adding Real Photos

Replace the SVG placeholder blocks in `index.html` with:

```html
<img src="your-photo.jpg" alt="Salon interior" style="width:100%;height:100%;object-fit:cover;" />
```

Look for the `<svg class="nail-art-svg">` and `<svg viewBox="0 0 560 500">` tags in the hero and about sections.

---

&copy; New Super Natural Nail & Spa · Elizabeth, NJ
