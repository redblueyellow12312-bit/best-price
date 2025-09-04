// ==================== 設定・色パレット ====================
const JUDGE = { buy_now_ratio:1.00, buy_ok_ratio:1.05, stale_days:60, stale_relax:0.03 };
const PALETTE = ["#ef4444","#f97316","#f59e0b","#84cc16","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#eab308"];

// ==================== データ層（localStorage） ====================
const LS_KEYS = { products:"ynp_products", prices:"ynp_prices", categories:"ynp_categories" };
const load=(k,fb)=>{try{const s=localStorage.getItem(k);return s?JSON.parse(s):fb;}catch{return fb;}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const uuid=()=>`${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

const db = {
  get products(){ return load(LS_KEYS.products, []); },
  set products(v){ save(LS_KEYS.products,v); },
  get prices(){ return load(LS_KEYS.prices, []); },
  set prices(v){ save(LS_KEYS.prices,v); },
  get categories(){ return load(LS_KEYS.categories, {}); },
  set categories(v){ save(LS_KEYS.categories,v); },
};

// ==================== Utils ====================
const qs=(s,e=document)=>e.querySelector(s);
const qsa=(s,e=document)=>[...e.querySelectorAll(s)];
const toNum=v=>(v===""||v==null||isNaN(+v))?null:+v;
const fmtCur=v=>(v==null?"-":`${(+v).toFixed(2)}円`);
const fmtUnit=(v,u)=>(v==null?"-":`${(+v).toFixed(4)}円/${u}`);
const today=()=>new Date().toISOString().slice(0,10);
const eff=(n,s)=>{const N=toNum(n), S=toNum(s); if(S!=null&&S>0) return S; if(N!=null&&N>0) return N; return null;};
const days=(d)=>{ if(!d) return Infinity; const t=new Date(d+"T00:00:00"); return Math.floor((Date.now()-t)/86400000); };
const hex2rgb=h=>{const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h)||[];return {r:parseInt(m[1]||"f1",16),g:parseInt(m[2]||"f5",16),b:parseInt(m[3]||"f9",16)};};
const rgba=(h,a)=>{const {r,g,b}=hex2rgb(h);return `rgba(${r},${g},${b},${a})`;};

const getCatColor=cat=> (db.categories?.[cat]?.color) || "#f1f5f9";
const setCatColor=(cat,color)=>{ const m={...db.categories}; m[cat]={color}; db.categories=m; };

const uniqueCats=()=>[...new Set([...Object.keys(db.categories||{}), ...db.products.map(p=>p.category)])].filter(Boolean).sort();
const uniqueNames=()=>[...new Set(db.products.map(p=>p.product_name))].filter(Boolean).sort();

const prodsByName = name => db.products.filter(p=>p.product_name===name);
const pricesOf = pid => db.prices.filter(pr=>pr.product_id===pid);

// ==================== 集計 ====================
function bottomUnit(name, unit){
  const vars=prodsByName(name).filter(p=>!unit || p.unit_type===unit);
  let best=null;
  for(const p of vars){
    for(const pr of pricesOf(p.product_id)){
      const e=eff(pr.normal_price,pr.sale_price); if(e==null) continue;
      const up=e/p.unit_quantity;
      if(!best || up<best.unit_price) best={unit_price:up, unit:p.unit_type, store:pr.store_name, date:pr.registered_at};
    }
  }
  return best;
}
function bottomTotal(name, qty, unit){
  const vars=prodsByName(name).filter(p=>p.unit_type===unit && +p.unit_quantity===+qty);
  let best=null;
  for(const p of vars){
    for(const pr of pricesOf(p.product_id)){
      const e=eff(pr.normal_price,pr.sale_price); if(e==null) continue;
      if(!best || e<best.price) best={price:e, store:pr.store_name, date:pr.registered_at};
    }
  }
  return best;
}

// ==================== CRUD ====================
function addProduct({category, product_name, unit_quantity, unit_type, color}){
  if(category && color) setCatColor(category,color);
  const p={product_id:uuid(), category, product_name, unit_quantity:+unit_quantity, unit_type};
  db.products=[...db.products,p]; return p;
}
function updateProduct(pid, patch){
  db.products=db.products.map(p=>p.product_id===pid?{...p,...patch}:p);
  const prod=db.products.find(p=>p.product_id===pid);
  if(prod && patch.unit_quantity!=null){
    db.prices=db.prices.map(pr=>{
      if(pr.product_id!==pid) return pr;
      const e=eff(pr.normal_price,pr.sale_price);
      return {...pr, unit_price:(e!=null? e/prod.unit_quantity:null)};
    });
  }
}
function deleteProduct(pid){
  db.products=db.products.filter(p=>p.product_id!==pid);
  db.prices=db.prices.filter(pr=>pr.product_id!==pid);
}
function upsertPrice({product_id, store_name, normal_price, sale_price, registered_at}){
  const priceType=(toNum(sale_price)!=null && toNum(sale_price)>0)?"sale":"normal";
  const key=pr=> pr.product_id===product_id && pr.store_name===store_name &&
                 ((priceType==="sale" && pr.sale_price!=null) || (priceType==="normal" && (pr.sale_price==null)));
  const idx=db.prices.findIndex(key);
  const e=eff(normal_price,sale_price);
  const prod=db.products.find(p=>p.product_id===product_id);
  const up=(e!=null && prod)? e/prod.unit_quantity : null;

  if(idx>=0){
    const prev=db.prices[idx];
    const next={...prev,
      normal_price:(priceType==="normal")?toNum(normal_price):prev.normal_price,
      sale_price:(priceType==="sale")?toNum(sale_price):null,
      registered_at: registered_at || today(),
      unit_price: up
    };
    db.prices=[...db.prices.slice(0,idx), next, ...db.prices.slice(idx+1)];
    return next;
  }else{
    const rec={price_id:uuid(), product_id, store_name,
      normal_price:toNum(normal_price), sale_price:toNum(sale_price),
      registered_at: registered_at || today(), unit_price: up};
    db.prices=[...db.prices, rec]; return rec;
  }
}

// ==================== タブ ====================
function initTabs(){
  qsa(".tab-button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      qsa(".tab-button").forEach(b=>b.classList.remove("active"));
      qsa(".tab-panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      qs(btn.dataset.target).classList.add("active");
    });
  });
}

// ==================== パレット描画 ====================
function drawPalette(container, current, onPick){
  container.innerHTML="";
  PALETTE.forEach(col=>{
    const b=document.createElement("button");
    b.type="button"; b.className="sw"; b.style.background=col;
    if(col.toLowerCase()===current?.toLowerCase()) b.classList.add("selected");
    b.addEventListener("click",()=>{
      [...container.children].forEach(x=>x.classList.remove("selected"));
      b.classList.add("selected");
      onPick?.(col);
    });
    container.appendChild(b);
  });
}

// ==================== 選択肢/絞り込み ====================
function refreshDatalists(){
  qs("#datalist-categories").innerHTML = uniqueCats().map(c=>`<option value="${c}">`).join("");
  qs("#datalist-names").innerHTML      = uniqueNames().map(n=>`<option value="${n}">`).join("");
}
function refreshFilters(){
  const sel=qs("#filter-category");
  sel.innerHTML = ["（すべて）", ...uniqueCats()].map(c=>`<option value="${c}">${c}</option>`).join("");
}
function refreshPriceSelectors(keep={cat:null, pid:null}){
  // カテゴリセレクト
  const catSel=qs("#price-cat-filter");
  const allCats=uniqueCats();
  if(!keep.cat) keep.cat = catSel.value || allCats[0] || "";
  catSel.innerHTML = allCats.map(c=>`<option value="${c}" ${c===keep.cat?"selected":""}>${c}</option>`).join("");

  // 商品セレクト（カテゴリで絞る & 検索文字適用）
  const prodSel=qs("#price-product-select");
  const q=qs("#price-prod-search").value?.trim()||"";
  const list=db.products
    .filter(p=>!keep.cat || p.category===keep.cat)
    .filter(p=>!q || p.product_name.includes(q))
    .sort((a,b)=>(`${a.product_name}_${a.unit_type}_${a.unit_quantity}`).localeCompare(`${b.product_name}_${b.unit_type}_${b.unit_quantity}`,"ja"));

  if(!keep.pid && list.length) keep.pid = list[0].product_id;
  prodSel.innerHTML = list.map(p=>`<option value="${p.product_id}" ${p.product_id===keep.pid?"selected":""}>${p.product_name}｜${p.unit_quantity}${p.unit_type}</option>`).join("");
}

// ==================== 商品登録 ====================
function handleAddProductForm(){
  const form=qs("#form-add-product");
  const pal=qs("#p-color-palette");
  let selected = PALETTE[6];

  drawPalette(pal, selected, c=>{ selected=c; qs("#p-category-color").value=c; });

  // 既存カテゴリに色があれば反映
  qs("#p-category").addEventListener("input",()=>{
    const cat=qs("#p-category").value.trim();
    selected=getCatColor(cat); drawPalette(pal, selected, c=>{ selected=c; qs("#p-category-color").value=c; });
  });

  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const category=qs("#p-category").value.trim();
    const product_name=qs("#p-name").value.trim();
    const unit_quantity=toNum(qs("#p-qty").value);
    const unit_type=qs("#p-unit").value;
    if(!category || !product_name || !unit_quantity){ alert("入力を確認してください。"); return; }
    addProduct({category, product_name, unit_quantity, unit_type, color:selected});
    form.reset();
    refreshDatalists(); refreshFilters(); refreshPriceSelectors({cat:category});
    renderProductsTable(); renderProductsCards();
  });
}

// ==================== 価格登録（選択保持） ====================
let lastPriceSel = {cat:null, pid:null};
function handleAddPriceForm(){
  const form=qs("#form-add-price");
  qs("#registered-at").value=today();

  refreshPriceSelectors(lastPriceSel);

  qs("#price-cat-filter").addEventListener("change",()=>{
    lastPriceSel.cat = qs("#price-cat-filter").value;
    refreshPriceSelectors(lastPriceSel);
  });
  qs("#price-prod-search").addEventListener("input",()=>refreshPriceSelectors({
    cat:qs("#price-cat-filter").value,
    pid:qs("#price-product-select").value
  }));

  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const product_id = qs("#price-product-select").value;
    const store_name = qs("#store-name").value.trim();
    const normal_price = qs("#normal-price").value;
    const sale_price   = qs("#sale-price").value;
    const registered_at= qs("#registered-at").value || today();
    if(!product_id || !store_name || (!normal_price && !sale_price)){ alert("入力を確認（価格はどちらか必須）"); return; }
    upsertPrice({product_id, store_name, normal_price, sale_price, registered_at});

    // 再入力しやすいように：商品選択は保持、店舗/価格だけクリア
    lastPriceSel = {
      cat: qs("#price-cat-filter").value,
      pid: product_id
    };
    qs("#store-name").value="";
    qs("#normal-price").value="";
    qs("#sale-price").value="";
    // 日付は今日のまま
    refreshPriceSelectors(lastPriceSel);

    renderProductsTable(); renderProductsCards();
  });
}

// ==================== 一覧描画 ====================
function labelOf(p){ return `${p.category}｜${p.product_name}｜${p.unit_quantity}${p.unit_type}`; }

function bestFor(p){
  const list=pricesOf(p.product_id);
  let bestTotal=null, bestUnit=null;
  for(const pr of list){
    const e=eff(pr.normal_price,pr.sale_price);
    if(e!=null && (!bestTotal || e<bestTotal.price)) bestTotal={price:e, store:pr.store_name};
    if(pr.unit_price!=null && (!bestUnit || pr.unit_price<bestUnit.unit_price)) bestUnit={unit_price:pr.unit_price, store:pr.store_name};
  }
  return {bestTotal,bestUnit};
}
function tintRow(tr,cat){
  const c=getCatColor(cat); tr.style.background=rgba(c,.10); tr.style.boxShadow=`inset 6px 0 0 0 ${c}`;
}

function renderProductsTable(){
  const tbody=qs("#products-table tbody"); tbody.innerHTML="";
  const fcat=qs("#filter-category").value;
  const fname=qs("#filter-name").value?.trim();
  let list=db.products.slice();
  if(fcat && !["（すべて）","(すべて)","すべて"].includes(fcat)) list=list.filter(p=>p.category===fcat);
  if(fname) list=list.filter(p=>p.product_name.includes(fname));
  list.sort((a,b)=>labelOf(a).localeCompare(labelOf(b),"ja"));

  for(const p of list){
    const {bestTotal,bestUnit}=bestFor(p);
    const tr=document.createElement("tr");
    tr.dataset.pid=p.product_id;
    tr.innerHTML=`
      <td class="col-cat"><span class="badge">${p.category}</span></td>
      <td class="col-name">${p.product_name}</td>
      <td class="col-qty">${p.unit_quantity}</td>
      <td class="col-unit">${p.unit_type}</td>
      <td>${bestTotal?fmtCur(bestTotal.price):"-"}</td>
      <td>${bestUnit?fmtUnit(bestUnit.unit_price,p.unit_type):"-"}</td>
      <td>${bestTotal?bestTotal.store:(bestUnit?bestUnit.store:"-")}</td>
      <td><button class="secondary btn-detail">詳細</button></td>
      <td class="col-actions">
        <div class="inline-actions">
          <button class="action-btn btn-edit">編集</button>
          <button class="action-btn btn-del">削除</button>
        </div>
      </td>`;
    tintRow(tr, p.category);
    tbody.appendChild(tr);

    tr.querySelector(".btn-detail").addEventListener("click",()=>showDetail(p.product_id));
    tr.querySelector(".btn-del").addEventListener("click",()=>{
      if(!confirm("この商品と関連する価格データを削除します。よろしいですか？")) return;
      deleteProduct(p.product_id); renderProductsTable(); renderProductsCards(); qs("#detail-panel").hidden=true;
    });
    tr.querySelector(".btn-edit").addEventListener("click",()=>startInlineEdit(tr,p));
  }
}

function startInlineEdit(tr,p){
  // 編集フォームは「編集時にのみ」出現（初期は存在しない）
  tr.innerHTML=`
    <td colspan="9">
      <div class="form-grid">
        <label>カテゴリ<input class="table-input ip-cat" value="${p.category}"></label>
        <div class="palette-row ip-pal"></div>
        <label>商品名<input class="table-input ip-name" value="${p.product_name}"></label>
        <label>容量<input class="table-input ip-qty" type="number" step="0.01" min="0" value="${p.unit_quantity}"></label>
        <label>単位
          <select class="table-select ip-unit">
            ${["ml","g","個","枚"].map(u=>`<option value="${u}" ${u===p.unit_type?"selected":""}>${u}</option>`).join("")}
          </select>
        </label>
        <div class="inline-actions">
          <button class="action-btn btn-save">保存</button>
          <button class="action-btn btn-cancel">キャンセル</button>
        </div>
      </div>
    </td>`;
  drawPalette(tr.querySelector(".ip-pal"), getCatColor(p.category), col=>{
    const cat=tr.querySelector(".ip-cat").value.trim()||p.category; setCatColor(cat,col); renderProductsTable(); renderProductsCards();
  });
  tr.querySelector(".btn-save").addEventListener("click",()=>{
    const cat=tr.querySelector(".ip-cat").value.trim()||p.category;
    const name=tr.querySelector(".ip-name").value.trim();
    const qty =toNum(tr.querySelector(".ip-qty").value);
    const unit=tr.querySelector(".ip-unit").value;
    if(!cat || !name || !qty){ alert("入力を確認してください。"); return; }
    updateProduct(p.product_id,{category:cat, product_name:name, unit_quantity:qty, unit_type:unit});
    renderProductsTable(); renderProductsCards();
  });
  tr.querySelector(".btn-cancel").addEventListener("click",()=>renderProductsTable());
}

function renderProductsCards(){
  const wrap=qs("#products-cards"); wrap.innerHTML="";
  const fcat=qs("#filter-category").value;
  const fname=qs("#filter-name").value?.trim();
  let list=db.products.slice();
  if(fcat && !["（すべて）","(すべて)","すべて"].includes(fcat)) list=list.filter(p=>p.category===fcat);
  if(fname) list=list.filter(p=>p.product_name.includes(fname));
  list.sort((a,b)=>labelOf(a).localeCompare(labelOf(b),"ja"));

  for(const p of list){
    const {bestTotal,bestUnit}=bestFor(p);
    const c=getCatColor(p.category);
    const card=document.createElement("div");
    card.className="p-card"; card.style.background=rgba(c,.10); card.style.boxShadow=`inset 6px 0 0 0 ${c}`;
    card.innerHTML=`
      <div class="p-head">
        <span class="p-badge">${p.category}</span>
        <span class="p-title">${p.product_name}</span>
        <span class="p-size">${p.unit_quantity}${p.unit_type}</span>
      </div>
      <div class="p-metrics">
        <div>底値: ${bestTotal?fmtCur(bestTotal.price):"-"}</div>
        <div>最安値(単価): ${bestUnit?fmtUnit(bestUnit.unit_price,p.unit_type):"-"}</div>
        <div class="full">最安店舗: ${bestTotal?bestTotal.store:(bestUnit?bestUnit.store:"-")}</div>
      </div>
      <div class="p-actions">
        <button class="action-btn btn-detail">詳細</button>
        <button class="action-btn btn-edit">編集</button>
        <button class="action-btn btn-del p-danger">削除</button>
      </div>
      <form class="p-edit"><!-- 初期はCSSでdisplay:none --></form>
    `;
    // 詳細
    card.querySelector(".btn-detail").addEventListener("click",()=>{ showDetail(p.product_id); qs("#detail-panel").scrollIntoView({behavior:"smooth"}); });
    // 編集（押した時にだけフォームを描画して表示）
    card.querySelector(".btn-edit").addEventListener("click",()=>{
      const frm=card.querySelector(".p-edit");
      frm.style.display="grid";
      frm.innerHTML=`
        <label>カテゴリ<input class="table-input ip-cat" value="${p.category}"></label>
        <div class="palette-row ip-pal"></div>
        <label>商品名<input class="table-input ip-name" value="${p.product_name}"></label>
        <label>容量<input class="table-input ip-qty" type="number" step="0.01" min="0" value="${p.unit_quantity}"></label>
        <label>単位
          <select class="table-select ip-unit">
            ${["ml","g","個","枚"].map(u=>`<option value="${u}" ${u===p.unit_type?"selected":""}>${u}</option>`).join("")}
          </select>
        </label>
        <div class="full p-actions">
          <button class="action-btn btn-save">保存</button>
          <button class="action-btn btn-cancel">キャンセル</button>
        </div>`;
      drawPalette(frm.querySelector(".ip-pal"), getCatColor(p.category), col=>{
        const cat=frm.querySelector(".ip-cat").value.trim()||p.category; setCatColor(cat,col); renderProductsTable(); renderProductsCards();
      });
      frm.querySelector(".btn-cancel").addEventListener("click",(e)=>{ e.preventDefault(); frm.style.display="none"; });
      frm.querySelector(".btn-save").addEventListener("click",(e)=>{
        e.preventDefault();
        const cat=frm.querySelector(".ip-cat").value.trim()||p.category;
        const name=frm.querySelector(".ip-name").value.trim();
        const qty =toNum(frm.querySelector(".ip-qty").value);
        const unit=frm.querySelector(".ip-unit").value;
        if(!cat || !name || !qty){ alert("入力を確認してください。"); return; }
        updateProduct(p.product_id,{category:cat, product_name:name, unit_quantity:qty, unit_type:unit});
        renderProductsTable(); renderProductsCards();
      });
    });
    // 削除
    card.querySelector(".btn-del").addEventListener("click",()=>{
      if(!confirm("この商品と関連する価格データを削除します。よろしいですか？")) return;
      deleteProduct(p.product_id); renderProductsTable(); renderProductsCards(); qs("#detail-panel").hidden=true;
    });
    wrap.appendChild(card);
  }
}

// ==================== 詳細（価格一覧＋編集） ====================
function showDetail(pid){
  const panel=qs("#detail-panel"), ttl=qs("#detail-title"), tbody=qs("#prices-table tbody");
  panel.hidden=false;
  const p=db.products.find(x=>x.product_id===pid); if(!p) return;
  ttl.textContent=`詳細：${p.category}｜${p.product_name}｜${p.unit_quantity}${p.unit_type}`;

  // 店舗×価格種別で最新のみ
  const map=new Map();
  for(const pr of pricesOf(pid)){
    const type=(pr.sale_price!=null)?"sale":"normal";
    const key=`${pr.store_name}__${type}`;
    const cur=map.get(key);
    if(!cur || (pr.registered_at||"") > (cur.registered_at||"")) map.set(key, pr);
  }
  const list=[...map.values()].sort((a,b)=>(b.registered_at||"").localeCompare(a.registered_at||""));
  tbody.innerHTML=list.map(pr=>`
    <tr data-id="${pr.price_id}">
      <td class="col-store">${pr.store_name}</td>
      <td class="col-n">${pr.normal_price??""}</td>
      <td class="col-s">${pr.sale_price??""}</td>
      <td>${pr.unit_price!=null?pr.unit_price.toFixed(4)+`円/${p.unit_type}`:"-"}</td>
      <td class="col-date">${pr.registered_at||"-"}</td>
      <td class="col-actions">
        <div class="inline-actions">
          <button class="action-btn btn-edit-price">編集</button>
          <button class="action-btn btn-del-price">削除</button>
        </div>
      </td>
    </tr>`).join("");

  // 価格削除
  qsa(".btn-del-price",tbody).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.closest("tr").dataset.id;
      if(confirm("この価格レコードを削除します。よろしいですか？")){
        db.prices=db.prices.filter(x=>x.price_id!==id);
        renderProductsTable(); renderProductsCards(); showDetail(pid);
      }
    });
  });
  // 価格編集
  qsa(".btn-edit-price",tbody).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const tr=btn.closest("tr");
      startPriceInlineEdit(tr,pid);
    });
  });
}
function startPriceInlineEdit(tr,pid){
  const id=tr.dataset.id;
  const pr=db.prices.find(x=>x.price_id===id); if(!pr) return;
  tr.querySelector(".col-store").innerHTML=`<input class="table-input ip-store" value="${pr.store_name}">`;
  tr.querySelector(".col-n").innerHTML    =`<input class="table-input ip-n" type="number" step="0.01" min="0" value="${pr.normal_price??""}">`;
  tr.querySelector(".col-s").innerHTML    =`<input class="table-input ip-s" type="number" step="0.01" min="0" value="${pr.sale_price??""}">`;
  tr.querySelector(".col-date").innerHTML =`<input class="table-input ip-date" type="date" value="${pr.registered_at||today()}">`;
  tr.querySelector(".col-actions").innerHTML=`
    <div class="inline-actions">
      <button class="action-btn btn-save-price">保存</button>
      <button class="action-btn btn-cancel-price">キャンセル</button>
    </div>`;
  tr.querySelector(".btn-save-price").addEventListener("click",()=>{
    const store=tr.querySelector(".ip-store").value.trim();
    const n=toNum(tr.querySelector(".ip-n").value);
    const s=toNum(tr.querySelector(".ip-s").value);
    const d=tr.querySelector(".ip-date").value || today();
    if(!store || (n==null && s==null)){ alert("入力を確認（価格はどちらか必須）"); return; }
    const rec=db.prices.find(x=>x.price_id===id);
    Object.assign(rec,{store_name:store,normal_price:n,sale_price:s,registered_at:d});
    const prod=db.products.find(pp=>pp.product_id===rec.product_id);
    const e=eff(rec.normal_price,rec.sale_price); rec.unit_price=(e!=null&&prod)? e/prod.unit_quantity:null;
    save(LS_KEYS.prices, db.prices);
    renderProductsTable(); renderProductsCards(); showDetail(pid);
  });
  tr.querySelector(".btn-cancel-price").addEventListener("click",()=>showDetail(pid));
}

// ==================== 購入チェック ====================
function handleCheckForm(){
  const form=qs("#form-check"); const panel=qs("#check-result"); const btn=qs("#btn-register-best");
  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const cat=qs("#c-category").value.trim()||"未分類";
    const name=qs("#c-name").value.trim();
    const qty =toNum(qs("#c-qty").value);
    const unit=qs("#c-unit").value;
    const store=qs("#c-store").value.trim()||"不明店舗";
    const price=toNum(qs("#c-price").value);
    const type =qs("#c-price-type").value;
    if(!name || !qty || !unit || !price){ alert("商品名・容量・単位・価格は必須です"); return; }

    const currentUnit=price/qty;
    qs("#r-current-total").textContent=fmtCur(price);
    qs("#r-current-unit").textContent =fmtUnit(currentUnit,unit);

    const bT=bottomTotal(name,qty,unit);
    const bU=bottomUnit(name,unit);
    if(bT){ qs("#r-bottom-total").textContent=fmtCur(bT.price); qs("#r-bottom-total-note").textContent=`${bT.store||""}｜${bT.date||""}`; }
    else  { qs("#r-bottom-total").textContent="未登録"; qs("#r-bottom-total-note").textContent=""; }
    if(bU){ qs("#r-bottom-unit").textContent=fmtUnit(bU.unit_price,unit); qs("#r-bottom-unit-note").textContent=`${bU.store||""}｜${bU.date||""}`; }
    else  { qs("#r-bottom-unit").textContent="未登録"; qs("#r-bottom-unit-note").textContent=""; }

    let ratios=[]; if(bT) ratios.push(price/(bT.price)); if(bU) ratios.push(currentUnit/(bU.unit_price));
    const jr=qs("#r-judge");
    if(ratios.length===0){ jr.textContent="△ データ不足：登録して比較基準を増やしましょう。"; jr.className="judge warn"; btn.hidden=false; }
    else{
      const best=Math.min(...ratios);
      const latest=[bT?.date,bU?.date].filter(Boolean).sort().slice(-1)[0];
      let ok=JUDGE.buy_ok_ratio; if(latest && days(latest)>JUDGE.stale_days) ok+=JUDGE.stale_relax;
      if(best<=JUDGE.buy_now_ratio){ jr.textContent="✔ 買うべき（底値更新/同等）"; jr.className="judge ok"; btn.hidden=false; }
      else if(best<=ok){ jr.textContent="◯ 買ってもいい（底値に近い）"; jr.className="judge ok"; btn.hidden=false; }
      else{ jr.textContent="✖ 見送り（底値を上回り）"; jr.className="judge ng"; btn.hidden=true; }
    }
    panel.hidden=false;

    btn.onclick=()=>{
      // 商品（無ければ新規作成）
      let product=db.products.find(p=>p.product_name===name && p.unit_type===unit && +p.unit_quantity===+qty);
      if(!product){
        const col=getCatColor(cat) || PALETTE[6];
        product=addProduct({category:cat, product_name:name, unit_quantity:qty, unit_type:unit, color:col});
      }else if(product.category!==cat){ setCatColor(cat, getCatColor(cat)); updateProduct(product.product_id,{category:cat}); }

      const normal=(type==="normal")?price:null;
      const sale  =(type==="sale")?price:null;
      upsertPrice({product_id:product.product_id, store_name:store, normal_price:normal, sale_price:sale, registered_at:today()});
      renderProductsTable(); renderProductsCards();
      alert("DBに登録（上書き）しました。");
      btn.hidden=true;
    };
  });
}

// ==================== バックアップ ====================
function exportJSON(){
  const data={version:1, exported_at:new Date().toISOString(), products:db.products, prices:db.prices, categories:db.categories};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=`minprice_${today()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importJSON(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const j=JSON.parse(r.result);
      if(!j.products || !j.prices) throw new Error("形式不正");
      db.products=j.products; db.prices=j.prices; db.categories=j.categories||{};
      refreshDatalists(); refreshFilters(); refreshPriceSelectors({});
      renderProductsTable(); renderProductsCards();
      alert("読み込み完了");
    }catch(e){ alert("読み込みエラー: "+e.message); }
  };
  r.readAsText(file);
}

// ==================== 初期化 ====================
function init(){
  initTabs();
  refreshDatalists();
  refreshFilters();
  refreshPriceSelectors({});
  handleAddProductForm();
  handleAddPriceForm();
  handleCheckForm();
  renderProductsTable();
  renderProductsCards();

  // フィルタ即時反映
  qs("#filter-category").addEventListener("change",()=>{ renderProductsTable(); renderProductsCards(); });
  qs("#filter-name").addEventListener("input", ()=>{ renderProductsTable(); renderProductsCards(); });

  // バックアップ
  qs("#btn-export").addEventListener("click", exportJSON);
  qs("#file-import").addEventListener("change",(e)=>{ if(e.target.files?.[0]) importJSON(e.target.files[0]); });
}
document.addEventListener("DOMContentLoaded", init);
