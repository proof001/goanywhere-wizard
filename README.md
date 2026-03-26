# GoAnywhere CSV → Snowflake Project Wizard

A step-by-step wizard that generates GoAnywhere MFT project XML for CSV-to-Snowflake data loads. Output matches real GoAnywhere Project Designer XML syntax and can be imported directly.

## Features

- **6-step wizard**: Project → Source → Snowflake → Columns → Options → Review
- **Snowflake column import**: Upload or paste `COLUMN_NAME|DATA_TYPE` CSV, preview and exclude columns before importing
- **Drag-to-reorder**: Reorder column mappings by dragging
- **Type mapping**: Snowflake types (TEXT, TIMESTAMP_NTZ, NUMBER(38,0), etc.) auto-mapped
- **TRUNCATE + INSERT mode**: Optionally generates a Clear Table module
- **Filename column**: Optional modifyRowSet to prepend source filename
- **Download or copy**: Get the XML as a file or clipboard

## Quick Start (Local Dev)

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## Deploy to Vercel (Recommended — Easiest)

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts. It auto-detects Vite and deploys. Done.

### Option B: GitHub + Vercel Dashboard

1. Push this folder to a GitHub repo
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repo
4. Vercel auto-detects Vite — click Deploy
5. Get your URL (e.g. `goanywhere-wizard.vercel.app`)

Every push to `main` auto-deploys.

## Deploy to Netlify

### Option A: Netlify CLI

```bash
npm i -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

### Option B: Drag & Drop

1. Run `npm run build`
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `dist` folder onto the page
4. Get your URL instantly

## Deploy to GitHub Pages

1. Install the plugin:
   ```bash
   npm install -D vite-plugin-static-copy
   ```

2. Update `vite.config.js` — add base path:
   ```js
   export default defineConfig({
     plugins: [react()],
     base: '/your-repo-name/',
   })
   ```

3. Build and deploy:
   ```bash
   npm run build
   git add dist -f
   git commit -m "deploy"
   git subtree push --prefix dist origin gh-pages
   ```

   Or use the `gh-pages` npm package:
   ```bash
   npm i -D gh-pages
   npx gh-pages -d dist
   ```

4. Enable GitHub Pages in repo Settings → Pages → Source: `gh-pages` branch

## Project Structure

```
goanywhere-wizard/
├── index.html          # Entry HTML
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx        # React mount
    └── App.jsx         # Wizard (all-in-one component)
```

## Snowflake Column Query

To export column definitions for import into the wizard:

```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'YOUR_TABLE'
ORDER BY ORDINAL_POSITION;
```

Export as CSV with pipe delimiter, or copy-paste directly.
