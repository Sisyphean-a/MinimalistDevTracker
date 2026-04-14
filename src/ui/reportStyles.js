const REPORT_PAGE_STYLES = [
  ':root{--panel:#ffffff;--line:#d7ddd4;--text:#1d3430;--muted:#5a6f69;--accent:#0f7b62;}',
  'body{margin:0;background:linear-gradient(180deg,#e8f3ef,#f6f7f3);font-family:"Segoe UI",Arial,sans-serif;color:var(--text);padding:16px;}',
  '.header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;}',
  '.title{font-size:30px;font-weight:700;margin:0;}',
  '.range-picker{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);}',
  '.range-picker select{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 10px;color:var(--text);font:inherit;}',
  '.muted{color:var(--muted);font-size:12px;}',
  '.btn{border:0;background:var(--accent);color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:600;}',
  '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px;}',
  '.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;}',
  '.card h4{margin:0 0 6px 0;color:var(--muted);font-size:12px;}',
  '.card p{margin:0;font-size:20px;font-weight:700;}',
  '.note{margin:0 0 12px 0;}',
  '.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:12px;}',
  'h3{margin:0 0 8px 0;font-size:20px;}',
  'table{width:100%;border-collapse:collapse;}',
  'th,td{border:1px solid var(--line);padding:8px;text-align:left;font-size:13px;}',
  'th{background:#eef3f2;}',
  '.heatline-labels{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted);margin-bottom:10px;}',
  '.heatline-track{border-radius:999px;border:1px solid rgba(15,123,98,0.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.25);padding:4px;background:#f4f8f6;overflow:hidden;}',
  '.heatline-grid{display:grid;gap:1px;}',
  '.heatline-cell{display:block;height:20px;min-width:0;}'
].join('');

module.exports = {
  REPORT_PAGE_STYLES
};
