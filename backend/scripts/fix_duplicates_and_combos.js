const URL = 'https://quanly-san-xuat.odoo.com';
const DB = 'quanly-san-xuat';
const LOGIN = 'vanquyen607@gmail.com';

const PASSWORD = '123456789';

let cookieHeaders = [];
async function post(path, payload) {
  const res = await fetch(URL + path, {
    method: 'POST',
    headers: {'Content-Type':'application/json; charset=utf-8', Cookie: cookieHeaders.join('; ')},
    body: JSON.stringify(payload)
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookieHeaders = setCookie.split(',').map(s => s.split(';')[0]);
  const text = await res.text();
  try { const data = JSON.parse(text); if (data.error) throw new Error(data.error.data?.message || JSON.stringify(data.error)); return data.result; } catch(e) { if (e.message.startsWith('{')) throw e; throw new Error(text.slice(0, 300)); }
}
async function call(m, method, args=[], kwargs={}) { return post('/web/dataset/call_kw/' + m + '/' + method, {jsonrpc:'2.0', method:'call', params:{model:m, method, args, kwargs}}); }
async function main() {
  await post('/web/session/authenticate', {jsonrpc:'2.0', method:'call', params:{db:DB, login:LOGIN, password:PASSWORD}});

  // Part 1: Find and delete duplicates
  const all = await call('product.template', 'search_read', [], {domain:[['default_code','!=',false]], fields:['id','default_code','qty_available'], limit:500, order:'id asc'});
  const byCode = {};
  for (const p of all) { if (!byCode[p.default_code]) byCode[p.default_code] = []; byCode[p.default_code].push(p); }
  let deletedCount = 0;
  const deleteIds = [];
  for (const [code, arr] of Object.entries(byCode)) {
    if (code === 'false' || arr.length < 2) continue;
    arr.sort((a,b) => (b.qty_available||0) - (a.qty_available||0));
    const toDel = arr.slice(1).map(x => x.id);
    if (toDel.length) {
      try {
        await call('product.template', 'unlink', [toDel]);
        deletedCount += toDel.length;
        deleteIds.push(...toDel);
      } catch(e) { console.error('Failed to delete', code, e.message); }
    }
  }

  // Part 2: Fix combos
  const combos = await call('product.template', 'search_read', [], {domain:[['type','=','combo']], fields:['id','name','default_code','combo_ids'], limit:10});
  const comboResults = [];
  for (const c of combos) {
    try {
      const existing = Array.isArray(c.combo_ids) ? c.combo_ids.filter(x => typeof x === 'number') : [];
      if (existing.length > 0) {
        comboResults.push({name: c.name, id: c.id, ok: true, note: 'already has ' + existing.length + ' combo(s)'});
        continue;
      }
      const goods = await call('product.template', 'search_read', [], {domain:[['type','=','consu']], fields:['id','name','default_code'], limit:3});
      if (goods.length < 2) { comboResults.push({name: c.name, id: c.id, ok: false, error:'Nedd >=2 consu products'}); continue; }
      const comboId = await call('product.combo', 'create', [{name: c.name}]);
      for (let i=0;i<2;i++) await call('product.combo.item', 'create', [{combo_id: comboId, product_template_id: goods[i].id, quantity: 1}]);
      await call('product.template', 'write', [[c.id], {combo_ids: [[6, false, [comboId]]]}]);
      comboResults.push({name: c.name, id: c.id, ok: true, comboId});
    } catch(e) { comboResults.push({name: c.name, id: c.id, ok: false, error: e.message}); }
  }

  // Final verification
  const remaining = await call('product.template', 'search_read', [], {domain:[['default_code','in',['QA001','ASM001','QJ001','GT001','MLT001','TX001','DN001','VT001','KQ001','AK001','PHO001','BM001','TRASU001','SUC001','CAF001','SHIP001','CONS001','CBO001','CBO002']]], fields:['id','name','default_code','type','is_storable','qty_available'], limit:50});
  const totalCount = await call('product.template', 'search_count', [], {domain:[['default_code','!=',false]]});
  console.log(JSON.stringify({deletedCount, deletedIds: deleteIds.slice(0,30), comboResults, totalCount, sampleRemaining: remaining.slice(0,20)}, null, 2));
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
