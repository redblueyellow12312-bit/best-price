// ====== 設定・閾値（判定基準） =============================================
const JUDGE = {
  buy_now_ratio: 1.00, // <=100% なら「買うべき」
  buy_ok_ratio: 1.05,  // <=105% なら「買ってもいい」
  stale_days: 60,      // 参照データが古いと
  stale_relax: 0.03    // 「買ってもいい」を +3% 緩和
};

// ====== データ層（localStorage） ==========================================
const LS_KEYS = { products: "yn_products", prices: "yn_prices" };
const loadJSON = (k, fb) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };
const saveJSON = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const uuid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const db = {
  get products(){ return loadJSON(LS_KEYS.products, []); },
  set products(v){ saveJSON(LS_KEYS.products, v); },
  get prices(){ return loadJSON(LS_KEYS.prices, []); },
  set prices(v){ saveJSON(LS_KEYS.prices, v); },
};

// ====== ユーティリティ ======================================================
const toNumber = v => (v===""||v==null||isNaN(+v))? null : +v;
const fmtCurrency = v => (v==null? "-" : `${(+v).toFixed(2)}円`);
const fmtUnitPrice = (v,u)=> (v==null? "-" : `${(+v).toFixed(4)}円/${u}`);
const todayStr = () => new Date().toISOString().slice(0,10);
const effPrice = (normal, sale) => {
  const n = toNumber(normal); const s = toNumber(sale);
  if (s != null && s > 0) return s;
  if (n != null && n > 0) return n;
  return null;
};
const daysBetween = (dateStr) => {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr+"T00:00:00");
  return Math.floor((Date.now()-d.getTime())/(1000*60*60*24));
};

// セット系
const uniqueNames = () => [...new Set(db.products.map(p=>p.product_name))];
const uniqueCategories = () => [...new Set(db.products.map(p=>p.category))];
const pricesOfProduct = (pid) => db.prices.filter(pr=>pr.product_id===pid);
const productsByName = (name) => db.products.filter(p=>p.product_name===name);

// ====== 集計：単価最安／底値 ===============================================
function calcBottomUnitForName(name, unitFilter) {
  const variants = productsByName(name).filter(p=>!unitFilter || p.unit_type===unitFilter);
  let best = null;
  for (const p of variants) {
    for (const pr of pricesOfProduct(p.product_id)) {
      const e = effPrice(pr.normal_price, pr.sale_price); if (e==null) continue;
      const up = e / p.unit_quantity;
      if (!best || up < best.unit_price) best = { unit_price: up, unit: p.unit_type, eprice: e, store: pr.store_name, product: p, date: pr.registered_at };
    }
  }
  return best;
}
function calcBottomTotalForExact(name, qty, unit) {
  const variants = productsByName(name).filter(p => p.unit_type===unit && +p.unit_quantity===+qty);
  let best = null;
  for (const p of variants) {
    for (const pr of pricesOfProduct(p.product_id)) {
      const e = effPrice(pr.normal_price, pr.sale_price); if (e==null) continue;
      if (!best || e < best.price) best = { price: e, store: pr.store_name, product: p, date: pr.registered_at };
    }
  }
  return best;
}

// ====== 変更API：商品・価格 CRUD ===========================================
function addProduct({category, product_name, unit_quantity, unit_type}) {
  const p = { product_id: uuid(), category, product_name, unit_quantity:+unit_quantity, unit_type };
  const all = db.products; all.push(p); db.products = all; return p;
}
function updateProduct(product_id, patch) {
  db.products = db.products.map(p => p.product_id===product_id ? {...p, ...patch} : p);
  // 容量が変わったら関連単価も再計算
  const prod = db.products.find(p=>p.product_id===product_id);
  if (prod && patch.unit_quantity!=null) {
    db.prices = db.prices.map(pr => {
      if (pr.product_id!==product_id) return pr;
      const e = effPrice(pr.normal_price, pr.sale_price);
      return {...pr, unit_price: (e!=null ? e/(+prod.unit_quantity) : null)};
    });
  }
}
function deleteProduct(product_id) {
  db.products = db.products.filter(p=>p.product_id!==product_id);
  db.prices = db.prices.filter(pr=>pr.product_id!==product_id);
}

function addPrice({product_id, store_name, normal_price, sale_price, registered_at}) {
  const product = db.products.find(p=>p.product_id===product_id);
  if (!product) throw new Error("商品が見つかりません");
  const e = effPrice(normal_price, sale_price);
  const up = e!=null ? e/product.unit_quantity : null;
  const rec = { price_id: uuid(), product_id, store_name, normal_price: toNumber(normal_price), sale_price: toNumber(sale_price), unit_price: up, registered_at: registered_at || todayStr() };
  const all = db.prices; all.push(rec); db.prices = all; return rec;
}
function updatePrice(price_id, patch) {
  db.prices = db.prices.map(pr => pr.price_id===price_id ? {...pr, ...patch} : pr);
  const rec = db.prices.find(pr=>pr.price_id===price_id);
  if (rec) {
    const product = db.products.find(p=>p.product_id===rec.product_id);
    const e = effPrice(rec.normal_price, rec.sale_price);
    rec.unit_price = (e!=null && product) ? e/product.unit_quantity : null;
  }
  saveJSON(LS_KEYS.prices, db.prices);
}
function deletePrice(price_id) { db.prices = db.prices.filter(pr=>pr.price_id!==price_id); }

// ====== DOMユーティリティ／タブ切替 ========================================
const qs = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>[...el.querySelectorAll(s)];
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

// ====== 商品登録フォーム ====================================================
function refreshDatalists(){
  qs("#datalist-names").innerHTML = uniqueNames().sort().map(n=>`<option value="${n}">`).join("");
  qs("#datalist-categories").innerHTML = uniqueCategories().sort().map(c=>`<option value="${c}">`).join("");
}
function handleAddProductForm(){
  const form = qs("#form-add-product");
  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const category = qs("#p-category").value.trim();
    const product_name = qs("#p-name").value.trim();
    const unit_quantity = toNumber(qs("#p-qty").value);
    const unit_type = qs("#p-unit").value;
    if (!category || !product_name || !unit_quantity){ alert("入力を確認してください。"); return; }
    addProduct({category, product_name, unit_quantity, unit_type});
    form.reset(); refreshDatalists(); refreshPriceProductSelect(); refreshFilters(); renderProductsTable();renderProductsCards();
    alert("商品を登録しました。");
  });
}

// ====== 価格登録フォーム ====================================================
function productLabel(p){ return `${p.category}｜${p.product_name}｜${p.unit_quantity}${p.unit_type}`; }
function refreshPriceProductSelect(){
  const sel = qs("#price-product-select");
  const prods = db.products.slice().sort((a,b)=>productLabel(a).localeCompare(productLabel(b),"ja"));
  sel.innerHTML = prods.map(p=>`<option value="${p.product_id}">${productLabel(p)}</option>`).join("");
}
function handleAddPriceForm(){
  const form = qs("#form-add-price");
  const regDate = qs("#registered-at"); regDate.value = todayStr();
  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const product_id = qs("#price-product-select").value;
    const store_name = qs("#store-name").value.trim();
    const normal_price = qs("#normal-price").value;
    const sale_price = qs("#sale-price").value;
    const registered_at = regDate.value;
    if (!product_id || !store_name || (!normal_price && !sale_price)){ alert("入力を確認（価格はどちらか必須）"); return; }
    addPrice({product_id, store_name, normal_price, sale_price, registered_at});
    form.reset(); regDate.value = todayStr(); renderProductsTable();renderProductsCards();
    alert("価格を登録しました。");
  });
}

// ====== 一覧（集計・表示） ==================================================
function refreshFilters(){
  const sel = qs("#filter-category");
  const cats = ["（すべて）", ...uniqueCategories().sort()];
  sel.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join("");
}
function bestStoreForProduct(p){
  const list = pricesOfProduct(p.product_id);
  let bestTotal=null, bestUnit=null;
  for (const pr of list){
    const e = effPrice(pr.normal_price, pr.sale_price);
    if (e!=null && (!bestTotal || e<bestTotal.price)) bestTotal={price:e, store:pr.store_name};
    if (pr.unit_price!=null && (!bestUnit || pr.unit_price<bestUnit.unit_price)) bestUnit={unit_price:pr.unit_price, store:pr.store_name};
  }
  return {bestTotal, bestUnit};
}
function renderProductsTable(){
  const tbody = qs("#products-table tbody"); tbody.innerHTML = "";
  const fcat = qs("#filter-category").value; const fname = qs("#filter-name").value.trim();
  let prods = db.products.slice();
  if (fcat && fcat!=="（すべて）") prods = prods.filter(p=>p.category===fcat);
  if (fname) prods = prods.filter(p=>p.product_name.includes(fname));
  prods.sort((a,b)=>`${a.category}_${a.product_name}_${a.unit_type}_${a.unit_quantity}`.localeCompare(`${b.category}_${b.product_name}_${b.unit_type}_${b.unit_quantity}`,"ja"));
  for (const p of prods){
    const {bestTotal, bestUnit} = bestStoreForProduct(p);
    const tr = document.createElement("tr");
    tr.dataset.pid = p.product_id;
    tr.innerHTML = `
      <td class="col-cat">${p.category}</td>
      <td class="col-name">${p.product_name}</td>
      <td class="col-qty">${p.unit_quantity}</td>
      <td class="col-unit">${p.unit_type}</td>
      <td>${bestTotal ? fmtCurrency(bestTotal.price) : "-"}</td>
      <td>${bestUnit ? fmtUnitPrice(bestUnit.unit_price, p.unit_type) : "-"}</td>
      <td>${bestTotal ? bestTotal.store : (bestUnit ? bestUnit.store : "-")}</td>
      <td><button class="secondary btn-detail" data-pid="${p.product_id}" data-name="${p.product_name}">詳細</button></td>
      <td class="col-actions">
        <div class="inline-actions">
          <button class="action-btn btn-edit-product">編集</button>
          <button class="action-btn btn-del-product">削除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
  // イベント
  qsa(".btn-detail").forEach(b=>b.addEventListener("click",()=>showDetail(b.dataset.pid, b.dataset.name)));
  qsa(".btn-del-product").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const pid = btn.closest("tr").dataset.pid;
      if (confirm("この商品と関連する価格データを削除します。よろしいですか？")){
        deleteProduct(pid); renderProductsTable(); renderProductsCards();qs("#detail-panel").hidden = true;
      }
    });
  });
  qsa(".btn-edit-product").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tr = btn.closest("tr");
      startProductInlineEdit(tr);
    });
  });
}

function renderProductsCards(){
  const wrap = document.getElementById("products-cards");
  if (!wrap) return;

  const fcat = document.getElementById("filter-category").value;
  const fname = document.getElementById("filter-name").value.trim();

  let prods = db.products.slice();
  if (fcat && fcat !== "（すべて）") prods = prods.filter(p => p.category === fcat);
  if (fname) prods = prods.filter(p => p.product_name.includes(fname));
  prods.sort((a,b)=>`${a.category}_${a.product_name}_${a.unit_type}_${a.unit_quantity}`
    .localeCompare(`${b.category}_${b.product_name}_${b.unit_type}_${b.unit_quantity}`,"ja"));

  wrap.innerHTML = "";
  for (const p of prods){
    const {bestTotal, bestUnit} = bestStoreForProduct(p);
    const card = document.createElement("div");
    card.className = "p-card";
    card.dataset.pid = p.product_id;

    card.innerHTML = `
      <div class="p-head">
        <span class="p-badge">${p.category}</span>
        <span class="p-title">${p.product_name}</span>
        <span class="p-size">${p.unit_quantity}${p.unit_type}</span>
      </div>

      <div class="p-metrics">
        <div>底値: ${bestTotal ? fmtCurrency(bestTotal.price) : "-"}</div>
        <div>単価最安: ${bestUnit ? fmtUnitPrice(bestUnit.unit_price, p.unit_type) : "-"}</div>
        <div class="full">最安店舗: ${bestTotal ? bestTotal.store : (bestUnit ? bestUnit.store : "-")}</div>
      </div>

      <div class="p-actions">
        <button class="action-btn btn-detail">詳細</button>
        <button class="action-btn btn-edit">編集</button>
        <button class="action-btn btn-del p-danger">削除</button>
      </div>

      <form class="p-edit" hidden>
        <label>カテゴリ<input class="table-input ip-cat" value="${p.category}"></label>
        <label>商品名<input class="table-input ip-name" value="${p.product_name}"></label>
        <label>容量<input class="table-input ip-qty" type="number" step="0.01" min="0" value="${p.unit_quantity}"></label>
        <label>単位
          <select class="table-select ip-unit">
            ${["ml","g","枚","個"].map(u=>`<option value="${u}" ${u===p.unit_type?"selected":""}>${u}</option>`).join("")}
          </select>
        </label>
        <div class="full p-actions">
          <button class="action-btn btn-save">保存</button>
          <button class="action-btn btn-cancel">キャンセル</button>
        </div>
      </form>
    `;

    // 詳細
    card.querySelector(".btn-detail").addEventListener("click", ()=>{
      showDetail(p.product_id, p.product_name);
      // 一覧下の詳細パネルへスクロール
      document.getElementById("detail-panel").scrollIntoView({behavior:"smooth", block:"start"});
    });

    // 編集開始
    card.querySelector(".btn-edit").addEventListener("click", ()=>{
      card.querySelector(".p-edit").hidden = false;
    });

    // キャンセル
    card.querySelector(".btn-cancel").addEventListener("click", (e)=>{
      e.preventDefault();
      card.querySelector(".p-edit").hidden = true;
    });

    // 保存
    card.querySelector(".btn-save").addEventListener("click", (e)=>{
      e.preventDefault();
      const category = card.querySelector(".ip-cat").value.trim();
      const name = card.querySelector(".ip-name").value.trim();
      const qty  = +card.querySelector(".ip-qty").value;
      const unit = card.querySelector(".ip-unit").value;
      if (!category || !name || !qty){ alert("入力を確認してください。"); return; }
      updateProduct(p.product_id, {category, product_name:name, unit_quantity:qty, unit_type:unit});
      // 容量変更時の単価再計算
      db.prices = db.prices.map(pr=>{
        if (pr.product_id!==p.product_id) return pr;
        const e = effPrice(pr.normal_price, pr.sale_price);
        return {...pr, unit_price: (e!=null ? e/qty : null)};
      });
      saveJSON(LS_KEYS.prices, db.prices);
      renderProductsTable(); // 集計を更新（PC表示用）
      renderProductsCards(); // カード再描画（スマホ表示用）
    });

    // 削除
    card.querySelector(".btn-del").addEventListener("click", ()=>{
      if (!confirm("この商品と関連する価格データを削除します。よろしいですか？")) return;
      deleteProduct(p.product_id);
      renderProductsTable();renderProductsCards();
      renderProductsCards();
      document.getElementById("detail-panel").hidden = true;
    });

    wrap.appendChild(card);
  }
}


// ====== 商品：インライン編集 ===============================================
function startProductInlineEdit(tr){
  const pid = tr.dataset.pid;
  const p = db.products.find(x=>x.product_id===pid); if (!p) return;

  // 既存セルを入力欄に差し替え
  tr.querySelector(".col-cat").innerHTML  = `<input class="table-input ip-cat" value="${p.category}">`;
  tr.querySelector(".col-name").innerHTML = `<input class="table-input ip-name" value="${p.product_name}">`;
  tr.querySelector(".col-qty").innerHTML  = `<input class="table-input ip-qty" type="number" step="0.01" min="0" value="${p.unit_quantity}">`;
  tr.querySelector(".col-unit").innerHTML = `
    <select class="table-select ip-unit">
      ${["ml","g","枚","個"].map(u=>`<option value="${u}" ${u===p.unit_type?"selected":""}>${u}</option>`).join("")}
    </select>`;

  // 操作ボタンを保存/キャンセルへ
  const actions = tr.querySelector(".col-actions");
  actions.innerHTML = `
    <div class="inline-actions">
      <button class="action-btn btn-save-product">保存</button>
      <button class="action-btn btn-cancel-product">キャンセル</button>
    </div>`;

  // イベント
  actions.querySelector(".btn-save-product").addEventListener("click", ()=>{
    const category = tr.querySelector(".ip-cat").value.trim();
    const name = tr.querySelector(".ip-name").value.trim();
    const qty  = toNumber(tr.querySelector(".ip-qty").value);
    const unit = tr.querySelector(".ip-unit").value;
    if (!category || !name || !qty){ alert("入力を確認してください。"); return; }
    updateProduct(pid, {category, product_name:name, unit_quantity:qty, unit_type:unit});
    refreshDatalists(); refreshPriceProductSelect(); renderProductsTable();renderProductsCards();
  });
  actions.querySelector(".btn-cancel-product").addEventListener("click", renderProductsTable);
}

// ====== 詳細（価格一覧＋インライン編集） ===================================
function showDetail(product_id){
  const panel = qs("#detail-panel"); const ttl = qs("#detail-title"); const tbody = qs("#prices-table tbody");
  panel.hidden=false;
  const p = db.products.find(x=>x.product_id===product_id); if (!p) return;
  ttl.textContent = `詳細：${p.category}｜${p.product_name}｜${p.unit_quantity}${p.unit_type}`;

  const list = pricesOfProduct(product_id).slice().sort((a,b)=>(b.registered_at||"").localeCompare(a.registered_at||""));
  tbody.innerHTML = list.map(pr=>{
    const e = effPrice(pr.normal_price, pr.sale_price);
    const unit = p.unit_type;
    return `
      <tr data-id="${pr.price_id}">
        <td class="col-store">${pr.store_name}</td>
        <td class="col-n">${pr.normal_price!=null ? pr.normal_price : ""}</td>
        <td class="col-s">${pr.sale_price!=null ? pr.sale_price : ""}</td>
        <td>${e!=null ? e : "-"}</td>
        <td>${pr.unit_price!=null ? pr.unit_price.toFixed(4)+`円/${unit}` : "-"}</td>
        <td class="col-date">${pr.registered_at || "-"}</td>
        <td class="col-actions">
          <div class="inline-actions">
            <button class="action-btn btn-edit-price">編集</button>
            <button class="action-btn btn-del-price">削除</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // 価格：削除
  qsa(".btn-del-price", tbody).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.closest("tr").dataset.id;
      if (confirm("この価格レコードを削除します。よろしいですか？")){
        deletePrice(id); renderProductsTable();renderProductsCards(); showDetail(product_id);
      }
    });
  });

  // 価格：編集→インライン
  qsa(".btn-edit-price", tbody).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tr = btn.closest("tr");
      startPriceInlineEdit(tr, product_id);
    });
  });
}

function startPriceInlineEdit(tr, product_id){
  const id = tr.dataset.id;
  const pr = db.prices.find(x=>x.price_id===id); if (!pr) return;

  tr.querySelector(".col-store").innerHTML = `<input class="table-input ip-store" value="${pr.store_name}">`;
  tr.querySelector(".col-n").innerHTML     = `<input class="table-input ip-n" type="number" step="0.01" min="0" value="${pr.normal_price??""}">`;
  tr.querySelector(".col-s").innerHTML     = `<input class="table-input ip-s" type="number" step="0.01" min="0" value="${pr.sale_price??""}">`;
  tr.querySelector(".col-date").innerHTML  = `<input class="table-input ip-date" type="date" value="${pr.registered_at || todayStr()}">`;
  tr.querySelector(".col-actions").innerHTML = `
    <div class="inline-actions">
      <button class="action-btn btn-save-price">保存</button>
      <button class="action-btn btn-cancel-price">キャンセル</button>
    </div>`;

  tr.querySelector(".btn-save-price").addEventListener("click", ()=>{
    const store = tr.querySelector(".ip-store").value.trim();
    const n = toNumber(tr.querySelector(".ip-n").value);
    const s = toNumber(tr.querySelector(".ip-s").value);
    const date = tr.querySelector(".ip-date").value || todayStr();
    if (!store || (n==null && s==null)){ alert("入力を確認してください。（価格はどちらか必須）"); return; }
    updatePrice(id, {store_name:store, normal_price:n, sale_price:s, registered_at:date});
    renderProductsTable(); renderProductsCards();showDetail(product_id);
  });
  tr.querySelector(".btn-cancel-price").addEventListener("click", ()=>showDetail(product_id));
}

// ====== 購入チェック（判定＆DB登録） =======================================
function handleCheckForm(){
  const form = qs("#form-check");
  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    const name = qs("#c-name").value.trim();
    const categoryIn = qs("#c-category").value.trim();
    const qty = toNumber(qs("#c-qty").value);
    const unit = qs("#c-unit").value;
    const price = toNumber(qs("#c-price").value);
    const store = qs("#c-store").value.trim();
    if (!name || !qty || !price){ alert("入力を確認してください。"); return; }

    let cat = categoryIn;
    if (!cat){
      const found = db.products.find(p=>p.product_name===name);
      if (found) cat = found.category;
    }

    const currentUnit = price/qty;
    const bottomTotal = calcBottomTotalForExact(name, qty, unit);
    const bottomUnit  = calcBottomUnitForName(name, unit);

    qs("#check-result").hidden = false;
    qs("#r-current-unit").textContent = fmtUnitPrice(currentUnit, unit);
    if (bottomTotal){
      qs("#r-bottom-total").textContent = fmtCurrency(bottomTotal.price);
      qs("#r-bottom-total-note").textContent = `${bottomTotal.store}｜${bottomTotal.date||""}`;
    } else {
      qs("#r-bottom-total").textContent = "未登録";
      qs("#r-bottom-total-note").textContent = "同容量の底値データなし";
    }
    if (bottomUnit){
      qs("#r-bottom-unit").textContent = fmtUnitPrice(bottomUnit.unit_price, unit);
      qs("#r-bottom-unit-note").textContent = `${bottomUnit.product.unit_quantity}${unit}｜${bottomUnit.store}｜${bottomUnit.date||""}`;
    } else {
      qs("#r-bottom-unit").textContent = "未登録";
      qs("#r-bottom-unit-note").textContent = "単価最安データなし";
    }

    let ratios = [];
    if (bottomTotal) ratios.push(price / bottomTotal.price);
    if (bottomUnit)  ratios.push(currentUnit / bottomUnit.unit_price);

    const jr = qs("#r-judge");
    const btnReg = qs("#btn-register-best");

    if (ratios.length===0){
      jr.textContent = "△ データ不足：まずはこの価格を登録しよう。";
      jr.className = "judge warn";
      btnReg.hidden = false;
    } else {
      const bestRatio = Math.min(...ratios);
      const latestDate = [bottomTotal?.date, bottomUnit?.date].filter(Boolean).sort().slice(-1)[0];
      let buyNow = JUDGE.buy_now_ratio, buyOk = JUDGE.buy_ok_ratio;
      if (daysBetween(latestDate) > JUDGE.stale_days) buyOk += JUDGE.stale_relax;

      if (bestRatio <= buyNow){
        jr.textContent = "✔ 買うべき（底値更新 or 単価最安以下）";
        jr.className = "judge ok";
        btnReg.hidden = false;
      } else if (bestRatio <= buyOk){
        jr.textContent = "◯ 買ってもいい（底値に近い水準）";
        jr.className = "judge ok";
        btnReg.hidden = false;
      } else {
        jr.textContent = "✖ 見送り（底値・単価最安より割高）";
        jr.className = "judge ng";
        btnReg.hidden = true;
      }
    }

    btnReg.onclick = ()=>{
      let product = db.products.find(p => p.product_name===name && p.unit_type===unit && +p.unit_quantity===+qty);
      if (!product){
        product = addProduct({category: cat || "未分類", product_name: name, unit_quantity: qty, unit_type: unit});
      }
      addPrice({product_id: product.product_id, store_name: (store||"不明店舗"), normal_price: price, sale_price: null, registered_at: todayStr()});
      renderProductsTable();renderProductsCards();
      alert("DBへ登録しました。");
      btnReg.hidden = true;
    };
  });
}

// ====== 初期化 ==============================================================
function init(){
  initTabs();
  refreshDatalists();
  refreshPriceProductSelect();
  refreshFilters();
  renderProductsTable();
  renderProductsCards();
  handleAddProductForm();
  handleAddPriceForm();
  handleCheckForm();
  qs("#btn-refresh-list").addEventListener("click", () => {
  refreshFilters();
  renderProductsTable();
  renderProductsCards(); // ← 追加
  });
  qs("#filter-category").addEventListener("change", () => {
  renderProductsTable();
  renderProductsCards(); // ← 追加
  });
  qs("#filter-name").addEventListener("input", () => {
  renderProductsTable();
  renderProductsCards(); // ← 追加
  });
}
document.addEventListener("DOMContentLoaded", init);
