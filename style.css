:root{
  --bg:#f6f7fb; --card:#fff; --text:#222; --muted:#666;
  --primary:#2563eb; --primary-600:#1d4ed8; --accent:#10b981;
  --danger:#ef4444; --warn:#f59e0b; --border:#e5e7eb;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;color:var(--text);background:var(--bg)}
h1,h2,h3{margin:0 0 12px}

/* iOSズーム抑止 */
input,select,textarea,button{font-size:16px}

.app-header{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--border);padding:12px 16px;z-index:5}
.app-header h1{font-size:20px;margin-bottom:8px}
.tabs{display:flex;gap:8px;flex-wrap:wrap}
.tab-button{padding:8px 12px;background:#eef2ff;color:#334155;border:1px solid #c7d2fe;border-radius:8px;cursor:pointer}
.tab-button.active{background:var(--primary);color:#fff;border-color:var(--primary)}

.tab-panel{display:none;padding:16px;max-width:1100px;margin:0 auto}
.tab-panel.active{display:block}

.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 2px 6px rgba(0,0,0,.04)}

.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end}
label{display:flex;flex-direction:column;gap:6px}
.row-compact{display:flex;gap:8px;align-items:center}
.cat-row{display:flex;gap:10px;align-items:center;flex-wrap:nowrap} /* ←横一列を維持 */
button{padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer}
button.primary{background:var(--primary);color:#fff;border-color:var(--primary)}
button.primary:hover{background:var(--primary-600)}
button:disabled{opacity:.6;cursor:not-allowed}
.hint{color:var(--muted);font-size:13px;margin-top:6px}

table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid var(--border);padding:10px;text-align:left;vertical-align:middle}
th{background:#f8fafc;font-weight:600}
#products-table-wrap{overflow-x:auto}
.muted{color:var(--muted)} .small{font-size:12px}

.result-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.result-num{font-size:20px;font-weight:700;margin-top:4px}
.judge{margin-top:12px;font-size:18px;font-weight:700}
.judge.ok{color:var(--accent)} .judge.warn{color:var(--warn)} .judge.ng{color:var(--danger)}
.actions{margin-top:12px;display:flex;gap:8px}
.app-footer{padding:12px 16px;border-top:1px solid var(--border);color:var(--muted)}
.action-btn{margin-right:6px}

/* インライン編集用 */
.table-input{width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:#fff}
.table-select{width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:#fff}
.inline-actions{display:flex;gap:6px}
.badge{display:inline-block;padding:2px 6px;border-radius:6px;font-size:12px;background:#f1f5f9;border:1px solid var(--border);color:#334155}

/* カラーパレット（10色・横並び固定） */
/* カラーパレット */
.palette-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.palette-row .sw{width:24px;height:24px;border-radius:999px;border:1px solid #ddd;cursor:pointer}
.palette-row .sw.selected{border:2px solid #111}

/* === cards (mobile first) === */
.cards-grid{display:none;gap:12px}
.p-card{border:1px solid var(--border);border-radius:12px;padding:12px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.04)}
.p-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.p-title{font-weight:700}
.p-size{color:var(--muted);font-size:12px}
.p-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0}
.p-metrics div{font-size:13px}
.p-actions{display:flex;gap:6px;flex-wrap:wrap}
.p-edit{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px} /* ←最初は非表示 */
.p-edit .full{grid-column:1/-1}
.p-badge{display:inline-block;padding:2px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#f1f5f9}
.p-danger{color:#b91c1c}

/* 画面幅が狭いときはカード表示、テーブル非表示 */
@media (max-width: 768px){
  #products-table-wrap{display:none;}
  #products-cards{display:grid;}
}
