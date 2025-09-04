// ======================== 設定（判定＆カラーパレット） ======================
const JUDGE = {
  buy_now_ratio: 1.00,  // <=100% → 買うべき
  buy_ok_ratio: 1.05,   // <=105% → 買ってもいい
  stale_days: 60,       // 古いデータなら
  stale_relax: 0.03     // 判定を緩める(+3%)
};
const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#22c55e",
  "#06b6d4","#3b82f6","#8b5cf6","#ec4899","#eab308"
];

// ============================== データ層（LS） ===============================
const LS_KEYS = { products: "yn4_products", prices: "yn4_prices", categories: "yn4_categories" };
const loadJSON=(k,fb)=>{ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };
const saveJSON=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const uuid=()=>`${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

const db = {
  get products(){ return loadJSON(LS_KEYS.products, []); },
  set products(v){ saveJSON(LS_KEYS.products, v); },
  get prices(){ return loadJSON(LS_KEYS.prices, []); },
  set prices(v){ saveJSON(LS_KEYS.prices, v); },
  get categories(){ return loadJSON(LS_KEYS.categories, {}); },
  set categories(v){ saveJSON(LS_KEYS.categories, v); }
};

// ================================ Utils =====================================
const qs=(s,el=document)=>el.querySelector(s);
const qsa=(s,el=document)=>[...el.querySelectorAll(s)];
const toNumber=v=>(v===""||v==null||isNaN(+v))?null:+v;
const fmtCurrency=v=>(v==null?"-":`${(+v).toFixed(2)}円`);
const fmtUnitPrice=(v,u)=>(v==null?"-":`${(+v).toFixed(4)}円/${u}`);
const todayStr=()=>new Date().toISOString().slice(0,10);
const effPrice=(n,s)=>{ const N=toNumber(n), S=toNumber(s); if(S!=null&&S>0) return S; if(N!=null&&N>0) return N; return null; };
const daysBetween=(d)=>{ if(!d) return Infinity; const t=new Date(d+"T00:00:00"); return Math.floor((Date.now()-t.getTime())/(1000*60*60*24)); };
const rgba=(hex,a)=>{ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); const r=parseInt(m[1],16),g=parseInt(m[2],16),b=parseInt(m[3],16); return `rgba(${r},${g},${b},${a})`; };

// カテゴリ色
const getCategoryColor=(cat)=> (db.categories?.[cat]?.color) || "#f1f5f9";
function setCategoryColor(cat,color){ const m={...db.categories}; m[cat]={color}; db.categories=m; }

// 集合
const uniqueNames=()=>[...new Set(db.products.map(p=>p.product_name))];
const uniqueCategories=()=>[...new Set([...Object.keys(db.categories||{}), ...db.products.map(p=>p.category)])];
const pricesOfProduct=(pid)=>db.prices.filter(pr=>pr.product_id===pid);
const productsByName=(name)=>db.products.filter(p=>p.product_name===name);

// =============================== 集計（最安/底値） ===========================
function calcBottomUnitForName(name, unit){
  const vars = productsByName(name).filter(p=>!unit || p.unit_type===unit);
  let best=null;
  for(const p of vars){
    for(const pr of pricesOfProduct(p.product_id)){
      const e=effPrice(pr.normal_price, pr.sale_price); if(e==null) continue;
      const up=e/p.unit_quantity;
      if(!best || up<best.unit_price) best={unit_price:up, unit:p.unit_type, store:pr.store_name, date:pr.registered_at};
    }
  }
  return best;
}
function calcBottomTotalForExact(name, qty, unit){
  const vars = productsByName(name).filter(p=>p.unit_type===unit && +p.unit_quantity===+qty);
  let best=null;
  for(const p of vars){
    for(const pr of pricesOfProduct(p.product_id)){
      const e=effPrice(pr.normal_price, pr.sale_price); if(e==null) continue;
      if(!best || e<best.price) best={price:e, store:pr.store_name, date:pr.registered_at};
    }
  }
  return best;
}

// ================================ CRUD ======================================
function addProduct({category, product_name, unit_quantity, unit_type, category_color}){
  if(category && category_color) setCategoryColor(category, category_color);
  const p={ product_id:uuid(), category, product_name, unit_quantity:+unit_quantity, unit_type };
  db.products=[...db.products,p]; return p;
}
function updateProduct(product_id, patch){
  db.products=db.products.map(p=>p.product_id===product_id?{...p,...patch}:p);
  const prod=db.products.find(p=>p.product_id===product_id);
  if(prod && patch.unit_quantity!=null){
    db.prices=db.prices.map(pr=>{
      if(pr.product_id!==product_id) return pr;
      const e=effPrice(pr.normal_price, pr.sale_price);
      return {...pr, unit_price:(e!=null? e/(+prod.unit_quantity):null)};
    });
  }
}
function deleteProduct(product_id){
  db.products=db.products.filter(p=>p.product_id!==product_id);
  db.prices=db.prices.filter(pr=>pr.product_id!==product_id);
}
const productLabel=(p)=>`${p.category}｜${p.product_name}｜${p.unit_quantity}${p.unit_type}`;

// 上書き更新キー：product_id + store_name + price_type
function upsertPrice({product_id, store_name, normal_price, sale_price, registered_at}){
  const priceType = (toNumber(sale_price)!=null && toNumber(sale_price)>0) ? "sale" : "normal";
  const key = (pr)=> pr.product_id===product_id && pr.store_name===store_name &&
                    ((priceType==="sale" && pr.sale_price!=null) ||
                     (priceType==="normal" && (pr.sale_price==null)));

  const idx=db.prices.findIndex(key);
  const e=effPrice(normal_price, sale_price);
  const prod=db.products.find(p=>p.product_id===product_id);
  const up=(e!=null && prod)? e/prod.unit_quantity : null;

  if(idx>=0){
    const prev=db.prices[idx];
    const next={ ...prev,
      normal_price: (priceType==="normal") ? toNumber(normal_price) : prev.normal_price,
      sale_price:   (priceType==="sale")   ? toNumber(sale_price)   : null,
      registered_at: registered_at || todayStr(),
      unit_price: up
    };
    db.prices=[...db.prices.slice(0,idx), next, ...db.prices.slice(idx+1)];
    return next;
  }else{
    const rec={ price_id:uuid(), product_id, store_name,
      normal_price: toNumber(normal_price),
      sale_price: toNumber(sale_price),
      registered_at: registered_at || todayStr(),
      unit_price: up
    };
    db.prices=[...db.prices, rec]; return rec;
  }
}
function updatePrice(price_id, patch){
  db.prices=db.prices.map(pr=>pr.price_id===price_id?{...pr,...patch}:pr);
  const rec=db.prices.find(pr=>pr.price_id===price_id);
  if(rec){
    const p=db.products.find(pp=>pp.product_id===rec.product_id);
    const e=effPrice(rec.normal_price, rec.sale_price);
    rec.unit_price=(e!=null && p)? e/p.unit_quantity : null;
  }
  saveJSON(LS_KEYS.prices, db.prices);
}
function deletePrice(price_id){ db.prices=db.prices.filter(pr=>pr.price_id!==price_id); }

// ================================ タブ操作 ===================================
function initTabs(){
  qsa(".tab-button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      qsa(".tab-button").forEach(b=>b.classList.remove("active"));
      qsa(".tab-panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      qs(btn.dataset.target).classList.add("active");
    });
  });
}

// =========================== パレット描画（10色） ============================
function renderPalette(container, current, onPick){
  container.innerHTML="";
  PALETTE.forEach(col=>{
    const b=document.createElement("button");
    b.type="button"; b.className="sw";
    b.style.background=col;
    if(col.toLowerCase()===current?.toLowerCase()) b.classList.add("selected");
    b.addEventListener("click", ()=>{
      [...container.children].forEach(x=>x.classList.remove("selected"));
      b.classList.add("selected");
      onPick?.(col);
    });
    container.appendChild(b);
  });
}

// ================================ 選択肢更新 =================================
function refreshDatalists(){
  const dlN=qs("#datalist-names");
  const dlC=qs("#datalist-categories");
  if (dlN) dlN.innerHTML=uniqueNames().sort().map(n=>`<option value="${n}">`).join("");
  if (dlC) dlC.innerHTML=uniqueCategories().sort().map(c=>`<option value="${c}">`).join("");
}
function refreshPriceProductSelect(){
  const sel=qs("#price-product-select"); if(!sel) return;
  const list=db.products.slice().sort((a,b)=>productLabel(a).localeCompare(productLabel(b),"ja"));
  sel.innerHTML=list.map(p=>`<option value="${p.product_id}">${productLabel(p)}</option>`).join("");
}
function refreshFilters(){
  const sel=qs("#filter-category"); if(!sel) return;
  const cats=["（すべて）", ...uniqueCategories().sort()];
  sel.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join("");
}

// ================================ 商品登録 ==================================
function handleAddProductForm(){
  const form=qs("#form-add-product"); if(!form) return;
  const pal=qs("#p-color-palette"); const colorInput=qs("#p-category-color");
  let selected=colorInput.value || PALETTE[6]; // 初期色
  renderPalette(pal, selected, c=>{selected=c; colorInput.value=c;});

  // カテゴリ入力で既存色を反映
  qs("#p-category").addEventListener("input", ()=>{
    const cat=qs("#p-category").value.trim();
    selected=getCategoryColor(cat);
    renderPalette(pal, selected, c=>{selected=c; colorInput.value=c;});
  });

  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const category=qs("#p-category").value.trim();
    const product_name=qs("#p-name").value.trim();
    const unit_quantity=toNumber(qs("#p-qty").value);
    const unit_type=qs("#p-unit").value;
    if(!category || !product_name || !unit_quantity){ alert("入力を確認してください。"); return; }
    addProduct({category, product_name, unit_quantity, unit_type, category_color:selected});
    form.reset();
    refreshDatalists(); refreshPriceProductSelect(); refreshFilters();
    renderProductsTable(); renderProductsCards();
  });
}

// ================================ 価格登録 ===================================
function handleAddPriceForm(){
  const form=qs("#form-add-price"); if(!form) return;
  const reg=qs("#registered-at"); reg.value=todayStr();
  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const product_id=qs("#price-product-select").value;
    const store_name=qs("#store-name").value.trim();
    const normal_price=qs("#normal-price").value;
    const sale_price=qs("#sale-price").value;
    const registered_at=reg.value || todayStr();
    if(!product_id || !store_name || (!normal_price && !sale_price)){
      alert("入力を確認（価格はどちらか必須）"); return;
    }
    upsertPrice({product_id, store_name, normal_price, sale_price, registered_at});
    form.reset(); reg.value=todayStr();
    renderProductsTable(); renderProductsCards();
  });
}

// ============================== 一覧（描画） =================================
function bestStoreForProduct(p){
  const list=pricesOfProduct(p.product_id);
  let bestTotal=null, bestUnit=null;
  for(const pr of list){
    const e=effPrice(pr.normal_price, pr.sale_price);
    if(e!=null && (!bestTotal || e<bestTotal.price)) bestTotal={price:e, store:pr.store_name};
    if(pr.unit_price!=null && (!bestUnit || pr.unit_price<bestUnit.unit_price)) bestUnit={unit_price:pr.unit_price, store:pr.store_name};
  }
  return {bestTotal, bestUnit};
}
function tintRow(tr, category){
  const c=getCategoryColor(category);
  tr.style.background=rgba(c, .10);
  tr.style.boxShadow=`inset 6px 0 0 0 ${c}`;
}

function renderProductsTable(){
  const tbody=qs("#products-table tbody"); if(!tbody) return;
  tbody.innerHTML="";
  const fcat=qs("#filter-category").value;
  const fname=qs("#filter-name").value?.trim();
  let list=db.products.slice();
  if(fcat && !["（すべて）","(すべて)","すべて"].includes(fcat)) list=list.filter(p=>p.category===fcat);
  if(fname) list=list.filter(p=>p.product_name.includes(fname));
  list.sort((a,b)=>`${a.category}_${a.product_name}_${a.unit_type}_${a.unit_quantity}`.localeCompare(`${b.category}_${b.product_name}_${b.unit_type}_${b.unit_quantity}`,"ja"));

  for(const p of list){
    const {bestTotal,bestUnit}=bestStoreForProduct(p);
    const tr=document.createElement("tr");
    tr.dataset.pid=p.product_id;
    tr.innerHTML=`
      <td class="col-cat"><span class="badge">${p.category}</span></td>
      <td class="col-name">${p.product_name}</td>
      <td class="col-qty">${p.unit_quantity}</td>
      <td class="col-unit">${p.unit_type}</td>
      <td>${bestTotal?fmtCurrency(bestTotal.price):"-"}</td>
      <td>${bestUnit?fmtUnitPrice(bestUnit.unit_price,p.unit_type):"-"}</td>
      <td>${bestTotal?bestTotal.store:(bestUnit?bestUnit.store:"-")}</td>
      <td><button class="secondary btn-detail" data-pid="${p.product_id}">詳細</button></td>
      <td class="col-actions">
        <div class="inline-actions">
          <button class="action-btn btn-edit-product">編集</button>
          <button class="action-btn btn-del-product">削除</button>
        </div>
      </td>`;
    tintRow(tr, p.category);
    tbody.appendChild(tr);
  }

  // events
  qsa(".btn-detail",tbody).forEach(b=>b.addEventListener("click",()=>showDetail(b.dataset.pid)));
  qsa(".btn-del-product",tbody).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const pid=btn.closest("tr").dataset.pid;
      if(confirm("この商品と関連する価格データを削除します。よろしいですか？")){
        deleteProduct(pid); renderProductsTable(); renderProductsCards(); qs("#detail-panel").hidden=true;
      }
    });
  });
  qsa(".btn-edit-product",tbody).forEach(btn=>btn.addEventListener("click",()=>{
    const tr=btn.closest("tr"); startProductInlineEdit(tr);
  }));
}

function renderProductsCards(){
  const wrap=qs("#products-cards"); if(!wrap) return;
  wrap.innerHTML="";
  const fcat=qs("#filter-category").value;
  const fname=qs("#filter-name").value?.trim();
  let list=db.products.slice();
  if(fcat && !["（すべて）","(すべて)","すべて"].includes(fcat)) list=list.filter(p=>p.category===fcat);
  if(fname) list=list.filter(p=>p.product_name.includes(fname));
  list.sort((a,b)=>`${a.category}_${a.product_name}_${a.unit_type}_${a.unit_quantity}`.localeCompare(`${b.category}_${b.product_name}_${b.unit_type}_${b.unit_quantity}`,"ja"));

  for(const p of list){
    const {bestTotal,bestUnit}=bestStoreForProduct(p);
    const c=getCategoryColor(p.category);
    const card=document.createElement("div");
    card.className="p-card"; card.dataset.pid=p.product_id;
    card.style.background=rgba(c,.10); card.style.boxShadow=`inset 6px 0 0 0 ${c}`;
    card.innerHTML=`
      <div class="p-head">
        <span class="p-badge">${p.category}</span>
        <span class="p-title">${p.product_name}</span>
        <span class="p-size">${p.unit_quantity}${p.unit_type}</span>
      </div>
      <div class="p-metrics">
        <div>底値: ${bestTotal?fmtCurrency(bestTotal.price):"-"}</div>
        <div>最安値(単価): ${bestUnit?fmtUnitPrice(bestUnit.unit_price,p.unit_type):"-"}</div>
        <div class="full">最安店舗: ${bestTotal?bestTotal.store:(bestUnit?bestUnit.store:"-")}</div>
      </div>
      <div class="p-actions">
        <button class="action-btn btn-detail">詳細</button>
        <button class="action-btn btn-edit">編集</button>
        <button class="action-btn btn-del p-danger">削除</button>
      </div>
      <form class="p-edit" hidden>
        <label>カテゴリ<input class="table-input ip-cat" value="${p.category}"></label>
        <div class="full palette-row ip-pal"></div>
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
        </div>
      </form>`;
    card.querySelector(".btn-detail").addEventListener("click",()=>{ showDetail(p.product_id); qs("#detail-panel").scrollIntoView({behavior:"smooth"}); });
    card.querySelector(".btn-edit").addEventListener("click",()=>{
      card.querySelector(".p-edit").hidden=false;
      renderPalette(card.querySelector(".ip-pal"), getCategoryColor(p.category), col=>{
        const cat=card.querySelector(".ip-cat").value.trim()||p.category; setCategoryColor(cat,col); renderProductsTable(); renderProductsCards();
      });
    });
    card.querySelector(".btn-cancel").addEventListener("click",(e)=>{ e.preventDefault(); card.querySelector(".p-edit").hidden=true; });
    card.querySelector(".btn-save").addEventListener("click",(e)=>{
      e.preventDefault();
      const cat=card.querySelector(".ip-cat").value.trim()||p.category;
      const name=card.querySelector(".ip-name").value.trim();
      const qty=toNumber(card.querySelector(".ip-qty").value);
      const unit=card.querySelector(".ip-unit").value;
      if(!cat || !name || !qty){ alert("入力を確認してください。"); return; }
      updateProduct(p.product_id,{category:cat, product_name:name, unit_quantity:qty, unit_type:unit});
      renderProductsTable(); renderProductsCards();
    });
    card.querySelector(".btn-del").addEventListener("click",()=>{
      if(!confirm("この商品と関連する価格データを削除します。よろしいですか？")) return;
      deleteProduct(p.product_id); renderProductsTable(); renderProductsCards(); qs("#detail-panel").hidden=true;
    });
    wrap.appendChild(card);
  }
}

// =========================== 商品インライン編集（表） ========================
function startProductInlineEdit(tr){
  const pid=tr.dataset.pid;
  const p=db.products.find(x=>x.product_id===pid); if(!p) return;
  tr.querySelector(".col-cat").innerHTML=`<input class="table-input ip-cat" value="${p.category}"><div class="palette-row ip-pal"></div>`;
  tr.querySelector(".col-name").innerHTML=`<input class="table-input ip-name" value="${p.product_name}">`;
  tr.querySelector(".col-qty").innerHTML =`<input class="table-input ip-qty" type="number" step="0.01" min="0" value="${p.unit_quantity}">`;
  tr.querySelector(".col-unit").innerHTML=`<select class="table-select ip-unit">${["ml","g","個","枚"].map(u=>`<option value="${u}" ${u===p.unit_type?"selected":""}>${u}</option>`).join("")}</select>`;
  const actions=tr.querySelector(".col-actions");
  actions.innerHTML=`<div class="inline-actions"><button class="action-btn btn-save-product">保存</button><button class="action-btn btn-cancel-product">キャンセル</button></div>`;

  renderPalette(tr.querySelector(".ip-pal"), getCategoryColor(p.category), col=>{
    const cat=tr.querySelector(".ip-cat").value.trim()||p.category; setCategoryColor(cat,col); renderProductsTable(); renderProductsCards();
  });

  actions.querySelector(".btn-save-product").addEventListener("click",()=>{
    const cat=tr.querySelector(".ip-cat").value.trim()||p.category;
    const name=tr.querySelector(".ip-name").value.trim();
    const qty=toNumber(tr.querySelector(".ip-qty").value);
    const unit=tr.querySelector(".ip-unit").value;
    if(!cat || !name || !qty){ alert("入力を確認してください。"); return; }
    updateProduct(pid,{category:cat, product_name:name, unit_quantity:qty, unit_type:unit});
    renderProductsTable(); renderProductsCards();
  });
  actions.querySelector(".btn-cancel-product").addEventListener("click",()=>{ renderProductsTable(); renderProductsCards(); });
}

// ================================ 詳細（価格） ===============================
function showDetail(product_id){
  const panel=qs("#detail-panel"), ttl=qs("#detail-title"), tbody=qs("#prices-table tbody");
  panel.hidden=false;
  const p=db.products.find(x=>x.product_id===product_id); if(!p) return;
  ttl.textContent=`詳細：${p.category}｜${p.product_name}｜${p.unit_quantity}${p.unit_type}`;

  // 店舗×「価格種別（通常/セール）」で最新一行になるよう、内部データのキー基準に合わせて整列
  const map=new Map();
  for(const pr of pricesOfProduct(product_id)){
    const type = (pr.sale_price!=null) ? "sale" : "normal";
    const key=`${pr.store_name}__${type}`;
    const prev=map.get(key);
    if(!prev){ map.set(key, pr); }
    else{
      // 日付が新しい方を優先
      const a=(prev.registered_at||""); const b=(pr.registered_at||"");
      if (b > a) map.set(key, pr);
    }
  }
  const list=[...map.values()].sort((a,b)=>(b.registered_at||"").localeCompare(a.registered_at||""));
  tbody.innerHTML=list.map(pr=>{
    const e=effPrice(pr.normal_price, pr.sale_price);
    return `
      <tr data-id="${pr.price_id}">
        <td class="col-store">${pr.store_name}</td>
        <td class="col-n">${pr.normal_price??""}</td>
        <td class="col-s">${pr.sale_price??""}</td>
        <td>${e!=null?e:"-"}</td>
        <td>${pr.unit_price!=null?pr.unit_price.toFixed(4)+`円/${p.unit_type}`:"-"}</td>
        <td class="col-date">${pr.registered_at||"-"}</td>
        <td class="col-actions">
          <div class="inline-actions">
            <button class="action-btn btn-edit-price">編集</button>
            <button class="action-btn btn-del-price">削除</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  // 削除
  qsa(".btn-del-price",tbody).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.closest("tr").dataset.id;
      if(confirm("この価格レコードを削除します。よろしいですか？")){
        deletePrice(id); renderProductsTable(); renderProductsCards(); showDetail(product_id);
      }
    });
  });
  // 編集（インライン）
  qsa(".btn-edit-price",tbody).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const tr=btn.closest("tr");
      startPriceInlineEdit(tr, product_id);
    });
  });
}
function startPriceInlineEdit(tr, product_id){
  const id=tr.dataset.id;
  const pr=db.prices.find(x=>x.price_id===id); if(!pr) return;
  tr.querySelector(".col-store").innerHTML=`<input class="table-input ip-store" value="${pr.store_name}">`;
  tr.querySelector(".col-n").innerHTML    =`<input class="table-input ip-n" type="number" step="0.01" min="0" value="${pr.normal_price??""}">`;
  tr.querySelector(".col-s").innerHTML    =`<input class="table-input ip-s" type="number" step="0.01" min="0" value="${pr.sale_price??""}">`;
  tr.querySelector(".col-date").innerHTML =`<input class="table-input ip-date" type="date" value="${pr.registered_at||todayStr()}">`;
  tr.querySelector(".col-actions").innerHTML=`
    <div class="inline-actions">
      <button class="action-btn btn-save-price">保存</button>
      <button class="action-btn btn-cancel-price">キャンセル</button>
    </div>`;

  tr.querySelector(".btn-save-price").addEventListener("click",()=>{
    const store=tr.querySelector(".ip-store").value.trim();
    const n=toNumber(tr.querySelector(".ip-n").value);
    const s=toNumber(tr.querySelector(".ip-s").value);
    const d=tr.querySelector(".ip-date").value || todayStr();
    if(!store || (n==null && s==null)){ alert("入力を確認（価格はどちらか必須）"); return; }
    updatePrice(id,{store_name:store, normal_price:n, sale_price:s, registered_at:d});
    renderProductsTable(); renderProductsCards(); showDetail(product_id);
  });
  tr.querySelector(".btn-cancel-price").addEventListener("click",()=>showDetail(product_id));
}

// ================================ 購入チェック ===============================
function handleCheckForm(){
  const form=qs("#form-check"); if(!form) return;
  const panel=qs("#check-result"), btnReg=qs("#btn-register-best");

  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const cat = (qs("#c-category").value.trim() || "未分類");
    const name=qs("#c-name").value.trim();
    const qty =toNumber(qs("#c-qty").value);
    const unit=qs("#c-unit").value;
    const store=qs("#c-store").value.trim();
    const price=toNumber(qs("#c-price").value);
    const ptype=qs("#c-price-type").value; // sale/normal
    if(!name || !qty || !unit || !price){ alert("商品名・容量・単位・価格は必須です"); return; }

    const currentUnit=price/qty;
    qs("#r-current-total").textContent=fmtCurrency(price);
    qs("#r-current-unit").textContent =fmtUnitPrice(currentUnit, unit);

    const bottomTotal=calcBottomTotalForExact(name, qty, unit);
    const bottomUnit =calcBottomUnitForName(name, unit);

    if(bottomTotal){
      qs("#r-bottom-total").textContent=fmtCurrency(bottomTotal.price);
      qs("#r-bottom-total-note").textContent=`${bottomTotal.store||""}｜${bottomTotal.date||""}`;
    }else{ qs("#r-bottom-total").textContent="未登録"; qs("#r-bottom-total-note").textContent=""; }
    if(bottomUnit){
      qs("#r-bottom-unit").textContent=fmtUnitPrice(bottomUnit.unit_price, unit);
      qs("#r-bottom-unit-note").textContent=`${bottomUnit.store||""}｜${bottomUnit.date||""}`;
    }else{ qs("#r-bottom-unit").textContent="未登録"; qs("#r-bottom-unit-note").textContent=""; }

    // 判定（底値・単価の双方で比較）
    let ratios=[];
    if(bottomTotal) ratios.push(price / bottomTotal.price);
    if(bottomUnit)  ratios.push(currentUnit / bottomUnit.unit_price);

    const jr=qs("#r-judge");
    if(ratios.length===0){
      jr.textContent="△ データ不足：登録して基準を増やしましょう。";
      jr.className="judge warn";
      panel.hidden=false; btnReg.hidden=false;
    }else{
      const best=Math.min(...ratios);
      const latestDate=[bottomTotal?.date,bottomUnit?.date].filter(Boolean).sort().slice(-1)[0];
      let ok=JUDGE.buy_ok_ratio;
      if(latestDate && daysBetween(latestDate)>JUDGE.stale_days) ok += JUDGE.stale_relax;

      if(best<=JUDGE.buy_now_ratio){ jr.textContent="✔ 買うべき（底値更新/同等）"; jr.className="judge ok"; btnReg.hidden=false; }
      else if(best<=ok){ jr.textContent="◯ 買ってもいい（底値に近い）"; jr.className="judge ok"; btnReg.hidden=false; }
      else { jr.textContent="✖ 見送り（底値を上回り）"; jr.className="judge ng"; btnReg.hidden=true; }
      panel.hidden=false;
    }

    // DB登録（上書き）
    btnReg.onclick=()=>{
      // 商品（なければ作成）
      let product=db.products.find(p=>p.product_name===name && p.unit_type===unit && +p.unit_quantity===+qty);
      if(!product){
        // カテゴリ色：既存があれば流用、なければパレット先頭
        const col = getCategoryColor(cat) || PALETTE[6];
        product=addProduct({category:cat, product_name:name, unit_quantity:qty, unit_type:unit, category_color:col});
      }else{
        // 既存商品でもカテゴリ変更があれば反映（購入チェックからカテゴリ確定させたいケース）
        if(product.category!==cat){ setCategoryColor(cat, getCategoryColor(cat) || PALETTE[6]); updateProduct(product.product_id,{category:cat}); }
      }

      const normal = (ptype==="normal") ? price : null;
      const sale   = (ptype==="sale")   ? price : null;
      upsertPrice({product_id:product.product_id, store_name:(store||"不明店舗"), normal_price:normal, sale_price:sale, registered_at:todayStr()});

      // 一覧へ即時反映
      renderProductsTable(); renderProductsCards();
      alert("DBに登録（上書き）しました。");
      btnReg.hidden=true;
    };
  });
}

// =============================== JSON入出力 =================================
function exportJSON(){
  const payload={version:1, exported_at:new Date().toISOString(), products:db.products, prices:db.prices, categories:db.categories};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=`minprice_backup_${todayStr()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importJSON(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data.products || !data.prices) throw new Error("フォーマット不正");
      db.products=data.products; db.prices=data.prices; db.categories=data.categories||{};
      refreshDatalists(); refreshPriceProductSelect(); refreshFilters();
      renderProductsTable(); renderProductsCards();
      alert("インポート完了");
    }catch(e){ alert("読み込みエラー: "+e.message); }
  };
  reader.readAsText(file);
}

// ================================ 初期化 =====================================
function init(){
  initTabs();
  refreshDatalists();
  refreshPriceProductSelect();
  refreshFilters();

  handleAddProductForm();
  handleAddPriceForm();
  handleCheckForm();

  renderProductsTable();
  renderProductsCards();

  // フィルタは即時反映（更新ボタン不要）
  qs("#filter-category")?.addEventListener("change", ()=>{ renderProductsTable(); renderProductsCards(); });
  qs("#filter-name")?.addEventListener("input", ()=>{ renderProductsTable(); renderProductsCards(); });

  // バックアップ
  qs("#btn-export")?.addEventListener("click", exportJSON);
  qs("#file-import")?.addEventListener("change",(e)=>{ if(e.target.files?.[0]) importJSON(e.target.files[0]); });
}
document.addEventListener("DOMContentLoaded", init);
