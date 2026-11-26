// Mock Google Apps Script runtime to exercise Code.gs end to end in Node.
// Сервер работает по киевскому времени; без этого тест падает на машинах в UTC.
process.env.TZ = 'Europe/Kyiv';
const fs = require('fs'), crypto = require('crypto'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../server/Code.gs', 'utf8');
const TOKEN = '123456:TEST-token', ADMIN = '1001';

function signed(buf) { return Array.from(buf).map(b => b > 127 ? b - 256 : b); }
function unsigned(arr) { return Buffer.from(arr.map(b => b < 0 ? b + 256 : b)); }
const props = { BOT_TOKEN: TOKEN, APP_URL: 'https://ex.github.io/ms/', ADMIN_IDS: ADMIN, WEBAPP_URL: 'https://script.google.com/macros/s/X/exec' };
const sent = [];
const sheets = {};
function mkSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getMaxRows: () => 1000, getMaxColumns: () => 26, getLastColumn: () => (data[0] || []).length,
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      setNumberFormat() { return this; }, setFontWeight() { return this; },
      setValues(vals) { for (let i = 0; i < vals.length; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < vals[i].length; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = data[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; }
    }),
    appendRow(v) { data.push(v.slice()); },
    deleteRow(r) { data.splice(r - 1, 1); },
    setFrozenRows() {}
  };
  return sh;
}
function fmt(d, tz, pat) {
  const parts = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(d).forEach(p => parts[p.type] = p.value);
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  return pat.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day).replace('HH', parts.hour === '24' ? '00' : parts.hour).replace('mm', parts.minute).replace('ss', parts.second).replace(/^u$/, String(wd));
}
function parseDate(str, tz, pat) {
  const m = str.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  for (const off of [2, 3]) { const d = new Date(guess - off * 3600e3); if (fmt(d, tz, 'yyyy-MM-dd HH:mm') === str) return d; }
  throw new Error('parse ' + str);
}
let cache = {};
const G = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)) }), openById() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json', ICAL: 'ical' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  HtmlService: { createHtmlOutput: s => ({ s }) },
  Utilities: {
    formatDate: fmt, parseDate,
    getUuid: () => crypto.randomUUID(),
    newBlob: (s, type, name) => ({ getBytes: () => signed(Buffer.from(String(s), 'utf8')), type, name }),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', unsigned(k)).update(unsigned(v)).digest()),
    base64Decode: s => signed(Buffer.from(s, 'base64')),
    sleep() {}
  },
  UrlFetchApp: {
    fetch: (url, o) => { sent.push({ url, p: o.contentType ? JSON.parse(o.payload) : o.payload }); return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' }; },
    fetchAll: reqs => reqs.map(r => { sent.push({ url: r.url, p: JSON.parse(r.payload) }); return { getResponseCode: () => 200 }; })
  },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  Logger: { log() {} }
};
const fn = new Function(...Object.keys(G), src + '\nreturn {doPost, doGet, setup, tick, verseOfDay, prayDigestJob, weekDigestJob, rows:function(n){_cache={};return rows(n);}, resetCache:function(){_cache={};}};');
const S = fn(...Object.values(G));

function initData(user, sp) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE', user: JSON.stringify(user), signature: 'sigxyz' };
  if (sp) f.start_param = sp;
  const dcs = Object.keys(f).sort().map(k => k + '=' + f[k]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return Object.keys(f).map(k => k + '=' + encodeURIComponent(f[k])).join('&') + '&hash=' + hash;
}
const call = (user, action, data) => { S.resetCache(); return JSON.parse(S.doPost({ postData: { contents: JSON.stringify(Object.assign({ action, initData: initData(user) }, data || {})) } }).s); };
const bot = (from, msg) => { S.resetCache(); S.doPost({ postData: { contents: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: Object.assign({ chat: { id: from.id, type: 'private' }, from }, msg) }) } }); };
const lastTo = id => sent.filter(s => s.p && String(s.p.chat_id) === String(id)).slice(-1)[0];

S.setup();
assert.strictEqual(S.rows('Events').length, 8, 'events seeded');
assert.ok(S.rows('Settings').length >= 18, 'settings seeded');

// --- registration
const admin = { id: 1001, first_name: 'Влад', username: 'vlad', language_code: 'ru' };
const anna = { id: 2002, first_name: 'Анна', language_code: 'uk' };
let r = call(anna, 'load'); assert.strictEqual(r.error, 'NOT_REGISTERED');
bot(anna, { text: '/start' }); assert.ok(/Як тебе звати/.test(lastTo(2002).p.text));
bot(anna, { text: 'Анна Коваль' }); assert.ok(lastTo(2002).p.reply_markup.keyboard[0][0].request_contact);
bot(anna, { contact: { user_id: 9999, phone_number: '380501112233' } }); assert.ok(/саме своїм/.test(lastTo(2002).p.text), 'foreign contact rejected');
bot(anna, { contact: { user_id: 2002, phone_number: '380501112233' } });
assert.ok(lastTo(2002).p.reply_markup.inline_keyboard[0][0].web_app.url === props.APP_URL, 'welcome with app button');
let u = S.rows('Users').find(x => x.id === '2002'); assert.strictEqual(u.phone, '+380501112233'); assert.strictEqual(u.status, 'ok'); assert.strictEqual(u.name, 'Анна Коваль');
bot(admin, { text: 'привіт' }); bot(admin, { text: 'Влад Admin' }); bot(admin, { contact: { user_id: 1001, phone_number: '+380670000000' } });
assert.ok(sent.some(s => String(s.p.chat_id) === '1001' && /Новий учасник: Анна/.test(s.p.text)) === false, 'anna registered before admin existed');
assert.ok(/Добро пожаловать|Готово|рады/i.test(sent.filter(s => String(s.p.chat_id) === '1001').map(s => s.p.text).join(' ')), 'russian bot texts');

// --- bad signature
const bad = JSON.parse(S.doPost({ postData: { contents: JSON.stringify({ action: 'load', initData: initData(anna).replace(/hash=.{4}/, 'hash=0000') }) } }).s);
assert.ok(/перевірити вхід/.test(bad.error), 'bad signature rejected');

// --- load and member actions
r = call(anna, 'load'); assert.strictEqual(r.me.role, 'member'); assert.strictEqual(r.events.length, 8); assert.strictEqual(r.admin, null);
const today = fmt(new Date(), '', 'yyyy-MM-dd');
const wedEvent = r.events.find(e => e.id === 'wed');
// find next Wednesday
let d = new Date(); while (fmt(d, '', 'u') !== '3') d = new Date(d.getTime() + 864e5);
const wedKey = 'wed@' + fmt(d, '', 'yyyy-MM-dd');
r = call(anna, 'going', { key: wedKey, on: true }); assert.ok(r.att[wedKey].mine, 'going saved');
r = call(anna, 'going', { key: 'wed@2026-11-10', on: true }); assert.ok(/немає в розкладі/.test(r.error), 'wrong weekday rejected');
r = call(admin, 'load'); assert.strictEqual(r.att[wedKey].n, 1); assert.deepStrictEqual(r.att[wedKey].names, ['Анна']); assert.ok(r.leader[wedKey][0].phone === '+380501112233');
assert.strictEqual(r.me.role, 'admin'); assert.ok(r.admin.users.length === 2);

r = call(anna, 'needNew', { text: 'За роботу', vis: 'team' }); const needId = r.needs[0].id; assert.ok(r.needs[0].mine);
r = call(admin, 'load'); assert.ok(r.needs.find(n => n.id === needId), 'admin sees team need');
r = call(admin, 'pray', { id: needId, on: true }); assert.ok(r.needs.find(n => n.id === needId).prayed); assert.strictEqual(r.lit, 1);
r = call(anna, 'testNew', { text: 'Бог дав роботу', sign: 'name', consent: true, needId }); assert.strictEqual(r.myTests[0].status, 'pending'); assert.ok(r.needs.find(n => n.id === needId).answered);
assert.ok(sent.some(s => String(s.p.chat_id) === '1001' && /Бог ответил/.test(s.p.text || '')), 'whoever prayed hears the answer');
r = call(anna, 'moderate', { kind: 'test', id: r.myTests[0].id, status: 'approved' }); assert.ok(/адміністратор/.test(r.error), 'member cannot moderate');
r = call(admin, 'load'); const tid = r.admin.tests[0].id;
r = call(admin, 'moderate', { kind: 'test', id: tid, status: 'approved' }); assert.strictEqual(r.admin.tests.length, 0);
r = call(anna, 'load'); assert.strictEqual(r.tests[0].who, 'Анна');
r = call(anna, 'adNew', { type: 'give', text: 'Віддам праску', area: 'Оболонь' }); assert.strictEqual(r.myAds[0].status, 'pending');
r = call(admin, 'load'); r = call(admin, 'moderate', { kind: 'ad', id: r.admin.ads[0].id, status: 'active' });
assert.strictEqual(r.ads[0].text, 'Віддам праску');
r = call(anna, 'request', { kind: 'pastoral', topic: 'Сімейне питання', contact: 'Telegram' });
assert.ok(sent.some(s => String(s.p.chat_id) === '1001' && /пастором/.test(s.p.text)), 'admin notified about pastoral');
r = call(anna, 'personal', { personal: { read: { '0:1': true }, verseOn: true, lang: 'uk', skills: { el: true } } }); assert.deepStrictEqual(r, { ok: true });
r = call(anna, 'load'); assert.ok(r.personal.verseOn);

// --- admin: events, settings, roles, broadcast, presence
r = call(admin, 'eventSave', { event: { type: 'dates', dates: ['2026-12-24'], time: '19:00', kind: 'evenings', title: { uk: 'Різдвяне служіння', ru: '' }, active: true } });
const ne = r.events.find(e => e.title.uk === 'Різдвяне служіння'); assert.ok(ne && ne.title.ru === 'Різдвяне служіння' && ne.dates[0] === '2026-12-24');
r = call(admin, 'eventSave', { event: { id: 'wed', type: 'weekly', dow: [3], time: '19:15', kind: 'heaven', title: { uk: 'HeavenOS', ru: 'HeavenOS' }, who: { uk: 'пастор Володимир' } } });
assert.strictEqual(r.events.find(e => e.id === 'wed').time, '19:15');
r = call(admin, 'eventSave', { event: { type: 'weekly', dow: [], time: '9', title: { uk: 'x' } } }); assert.ok(/18:00/.test(r.error));
r = call(admin, 'settingsSave', { settings: { verseTime: '06:45', mono: '1111 2222', evil: 'x' } }); assert.strictEqual(r.settings.verseTime, '06:45'); assert.ok(!('evil' in r.settings));
r = call(admin, 'role', { userId: '2002', role: 'leader' }); assert.strictEqual(r.admin.users.find(x => x.id === '2002').role, 'leader');
r = call(anna, 'load'); assert.ok(r.leader, 'leader view for leader');
r = call(anna, 'presence', { key: wedKey, userId: '2002', on: true }); assert.ok(r.leader[wedKey][0].present);
const before = sent.length; r = call(admin, 'broadcast', { text: 'Завтра служіння!' }); assert.strictEqual(r.flash.sent, 2); assert.strictEqual(sent.length - before, 2);
r = call(admin, 'eventDel', { id: ne.id }); assert.ok(!r.events.find(e => e.id === ne.id));

// --- schedule: verse + reminders
props.verseSent = '';
const st = S.rows('Settings').find(x => x.key === 'verseTime'); const vt = fmt(new Date(Date.now() - 5 * 60e3), '', 'HH:mm');
const sh = sheets.Settings; sh.data[st._r - 1][1] = vt;
const b2 = sent.length; S.resetCache(); S.tick();
const vmsg = sent.slice(b2).filter(s => /Вірш дня|Стих дня/.test(s.p.text || ''));
assert.strictEqual(vmsg.length, 1, 'verse sent only to users with verseOn'); assert.ok(vmsg[0].p.reply_markup.inline_keyboard[0][0].web_app.url.indexOf('?v=') > 0);
S.resetCache(); const b3 = sent.length; S.tick(); assert.strictEqual(sent.slice(b3).filter(s => /Вірш дня/.test(s.p.text || '')).length, 0, 'verse not sent twice');
// reminder: create event starting in 30 minutes today
const soon = new Date(Date.now() + 30 * 60e3), soonDate = fmt(soon, '', 'yyyy-MM-dd'), soonTime = fmt(soon, '', 'HH:mm');
r = call(admin, 'eventSave', { event: { id: 'soon', type: 'dates', dates: [soonDate], time: soonTime, kind: 'prayer', title: { uk: 'Тестова зустріч' } } });
r = call(anna, 'going', { key: 'soon@' + soonDate, on: true }); assert.ok(r.att['soon@' + soonDate].mine);
const b4 = sent.length; S.resetCache(); S.tick();
assert.ok(sent.slice(b4).some(s => String(s.p.chat_id) === '2002' && /Нагадування/.test(s.p.text)), 'reminder sent');
const b5 = sent.length; S.resetCache(); S.tick(); assert.ok(!sent.slice(b5).some(s => /Нагадування/.test(s.p.text || '')), 'reminder once');


// --- live home group room
{
  var bob = { id: 3003, first_name: 'Богдан', language_code: 'ru' };
  bot(bob, { text: '/start' }); bot(bob, { text: 'Богдан' }); bot(bob, { contact: { user_id: 3003, phone_number: '380500000003' } });
  let x = call(bob, 'roomOpen', { key: wedKey, card: 7 }); assert.ok(/лідер/.test(x.error), 'member cannot open room');
  x = call(bob, 'room', { key: wedKey }); assert.strictEqual(x.room, null, 'no room yet');
  const n0 = sent.length;
  x = call(admin, 'roomOpen', { key: wedKey, card: 7, link: 'https://meet.example/abc' });
  assert.ok(x.flash.room === wedKey); const lr = x.rooms.find(q => q.key === wedKey); assert.ok(lr && lr.status === 'live' && lr.card === 7, 'room listed live');
  assert.ok(sent.slice(n0).some(m => String(m.p.chat_id) === '2002' && /почалась/.test(m.p.text) && /#room=/.test(m.p.reply_markup.inline_keyboard[0][0].web_app.url)), 'going people notified');
  x = call(admin, 'roomOpen', { key: 'sun@' + wedKey.split('@')[1], card: 1 }); assert.ok(/HeavenOS/.test(x.error), 'only heaven meetings');
  x = call(bob, 'roomJoin', { key: wedKey }); assert.ok(x.room.joined && x.room.card === 7 && x.room.link === 'https://meet.example/abc');
  assert.strictEqual(x.room.onlineN, 1, 'bob online');
  x = call(bob, 'roomPost', { key: wedKey, type: 'msg', text: 'Мене зачепила команда' }); assert.strictEqual(x.room.feed.slice(-1)[0].x, 'Мене зачепила команда');
  x = call(bob, 'roomPost', { key: wedKey, type: 'msg', text: 'ще' }); assert.ok(/повільніше/.test(x.error), 'rate limit');
  cache['S:3003'] = '0';
  x = call(bob, 'roomPost', { key: wedKey, type: 'pray', text: 'За маму' }); const pid = x.room.feed.slice(-1)[0].id;
  x = call(anna, 'roomPray', { key: wedKey, id: pid }); assert.strictEqual(x.room.feed.find(f => f.id === pid).c, 1); assert.ok(x.room.feed.find(f => f.id === pid).prayed);
  x = call(anna, 'roomReact', { key: wedKey, kind: 'amen' }); x = call(anna, 'roomReact', { key: wedKey, kind: 'amen' }); assert.strictEqual(x.room.reacts.amen, 1, 'react throttled');
  cache['S:3003'] = '0';
  x = call(bob, 'roomPost', { key: wedKey, type: 'hand' }); assert.ok(x.room.handUp && x.room.hands.length === 0, 'member does not see queue');
  x = call(admin, 'room', { key: wedKey }); assert.strictEqual(x.room.hands[0].n, 'Богдан'); assert.ok(x.room.canLead);
  x = call(bob, 'roomSet', { key: wedKey, stage: 'prayer' }); assert.ok(/лідер/.test(x.error));
  x = call(admin, 'roomSet', { key: wedKey, stage: 'talk', pin: 'Що зачепило найбільше?', handDone: '3003' });
  assert.strictEqual(x.room.stage, 'talk'); assert.strictEqual(x.room.pin, 'Що зачепило найбільше?'); assert.strictEqual(x.room.hands.length, 0);
  x = call(bob, 'room', { key: wedKey }); assert.strictEqual(x.room.pin, 'Що зачепило найбільше?'); assert.ok(!x.room.handUp);
  // cache lost: state rebuilds from the sheets
  Object.keys(cache).filter(k => k.startsWith('R:')).forEach(k => delete cache[k]);
  x = call(bob, 'room', { key: wedKey }); assert.strictEqual(x.room.stage, 'talk'); assert.strictEqual(x.room.feed.filter(f => f.t === 'msg').length, 1); assert.ok(x.room.joined);
  x = call(bob, 'roomDel', { key: wedKey, id: x.room.feed.find(f => f.t === 'pin').id }); assert.ok(/лише своє/.test(x.error));
  cache['S:3003'] = '0';
  x = call(bob, 'roomPost', { key: wedKey, type: 'step', text: 'Подзвоню братові' });
  x = call(admin, 'roomClose', { key: wedKey, summary: 'Говорили про образ Божий' });
  const done = x.rooms.find(q => q.key === wedKey); assert.ok(done.status === 'ended' && done.summary.online === 2 && done.summary.steps === 1 && done.summary.prayers[0] === 'За маму' && done.summary.hall === 1);
  x = call(bob, 'roomPost', { key: wedKey, type: 'msg', text: 'пізно' }); assert.ok(/завершено/.test(x.error));
  cache['S:3003'] = '0';
  x = call(bob, 'roomPost', { key: wedKey, type: 'comment', text: 'Дякую за вечір' }); assert.strictEqual(x.room.feed.slice(-1)[0].t, 'comment');
  x = call(bob, 'load'); assert.ok(x.rooms.find(q => q.key === wedKey).summary.text === 'Говорили про образ Божий');
}

// --- role invites
{
  props.BOT_NAME = 'misto_bot';
  let x = call(anna, 'roleInvite', { role: 'leader' }); assert.ok(/адміністратор/.test(x.error), 'only admin makes invites');
  x = call(admin, 'roleInvite', { role: 'leader' }); const m = x.link.match(/^https:\/\/t\.me\/misto_bot\?start=r_leader_([a-z0-9]+)$/); assert.ok(m, 'invite link');
  x = call(admin, 'roleInvite', { role: 'admin' }); assert.ok(/Невідома роль/.test(x.error), 'no admin invites');
  const cara = { id: 4004, first_name: 'Cara', language_code: 'uk' };
  bot(cara, { text: '/start r_leader_' + m[1] }); bot(cara, { text: 'Катерина' }); bot(cara, { contact: { user_id: 4004, phone_number: '380500000004' } });
  assert.strictEqual(S.rows('Users').find(q => q.id === '4004').role, 'leader', 'role given after registration');
  assert.ok(sent.some(s => String(s.p.chat_id) === '4004' && /Лідер групи/.test(s.p.text)), 'told about role');
  var dan = { id: 5005, first_name: 'Dan', language_code: 'ru' };
  bot(dan, { text: '/start r_leader_wrongcode' }); assert.ok(sent.some(s => String(s.p.chat_id) === '5005' && /недействительно/.test(s.p.text)), 'bad code told');
  bot(dan, { text: 'Дан' }); bot(dan, { contact: { user_id: 5005, phone_number: '380500000005' } });
  assert.strictEqual(S.rows('Users').find(q => q.id === '5005').role, 'member', 'bad code gives nothing');
  x = call(admin, 'roleInvite', { role: 'minister', reset: true }); const m2 = x.link.match(/r_minister_([a-z0-9]+)$/);
  bot(dan, { text: '/start r_minister_' + m2[1] }); assert.strictEqual(S.rows('Users').find(q => q.id === '5005').role, 'minister', 'registered user upgraded');
  bot(dan, { text: '/start r_prayer_' + call(admin, 'roleInvite', { role: 'prayer' }).link.split('_').pop() }); assert.strictEqual(S.rows('Users').find(q => q.id === '5005').role, 'minister', 'never downgraded');
  // admin removes an already published testimony and ad
  x = call(admin, 'load'); const pub = x.tests[0]; x = call(admin, 'moderate', { kind: 'test', id: pub.id, status: 'rejected' }); assert.ok(!x.tests.find(q => q.id === pub.id), 'published testimony removed');
  const ad = x.ads[0]; x = call(admin, 'moderate', { kind: 'ad', id: ad.id, status: 'rejected' }); assert.ok(!x.ads.find(q => q.id === ad.id), 'published ad removed');
}
// --- verses for cards
{
  let x = call(admin, 'load'); assert.strictEqual(x.verses[18].length, 7, 'seeded 7 verses for card 18'); assert.strictEqual(x.verses[18][3].ref, 'Псалом 34:19');
  assert.ok(/Знаємо, що тим/.test(x.verses[18][0].uk), 'church wording kept');
  x = call(bob, 'verseAdd', { card: 5, verses: [{ ref: 'Івана 3:16', uk: 'Так бо Бог полюбив світ' }] }); assert.ok(/лідер/i.test(x.error), 'members cannot add');
  x = call(dan, 'verseAdd', { card: 5, verses: [{ ref: 'Івана 3:16', uk: 'Так бо Бог полюбив світ' }, { ref: 'Римлян 5:8', uk: '' }] }); assert.ok(!x.error, x.error);
  assert.strictEqual(x.verses[5].length, 2); assert.strictEqual(x.verses[5][0].who, 'Дан');
  x = call(anna, 'load'); assert.strictEqual(x.verses[5].length, 2, 'everyone sees verses');
  x = call(dan, 'verseDel', { id: x.verses[5][1].id }); assert.strictEqual(x.verses[5].length, 1, 'leader deletes');
  x = call(dan, 'verseAdd', { card: 99, verses: [{ ref: 'Івана 3:16' }] }); assert.ok(/картка/.test(x.error));
  x = call(admin, 'load'); assert.strictEqual(x.verses[18].length, 7, 'seed added only once');
}
// --- sermons, fellow travellers, cheers
{
  let x = call(dan, 'sermonSave', { sermon: { date: '2026-11-15', title_uk: 'Що з нами буде?' } }); assert.ok(/адміністратор/.test(x.error), 'only admin saves sermons');
  x = call(admin, 'sermonSave', { sermon: { date: '2026-11-15', time: '11:00', title_uk: 'Що з нами буде?', ask: 'Ким ми стаємо, поки чекаємо?' } }); assert.ok(!x.error, x.error);
  assert.strictEqual(x.sermons[0].status, 'announce'); const sid = x.sermons[0].id;
  x = call(admin, 'sermonSave', { sermon: { id: sid, date: '2026-11-15', title_uk: 'Що з нами буде?', status: 'published' } }); assert.ok(/текст/.test(x.error), 'publish needs text');
  x = call(admin, 'sermonSave', { sermon: { id: sid, date: '2026-11-15', title_uk: 'Що з нами буде?', status: 'published', text: 'Суть: Бог поруч.' } }); assert.strictEqual(x.sermons[0].status, 'published');
  x = call(anna, 'load'); assert.strictEqual(x.sermons.length, 1, 'everyone sees sermons');
  // way: anna shares her path, dan does not
  const now = Date.now(), P = {}; for (let n = 1; n <= 9; n++) P[n] = { took: now - 5e6, done: now - 4e6 + n, kept: n <= 5 ? now - 1e6 + n : undefined };
  call(anna, 'personal', { personal: { shareWay: true, devs: { p: P } } });
  call(dan, 'personal', { personal: { shareWay: false, devs: { p: { 1: { took: now, done: now } } } } });
  x = call(dan, 'load'); assert.strictEqual(x.way.devs.count, 2, 'everyone on the path counted'); assert.strictEqual(x.way.devs.people[0].done, 9); assert.strictEqual(x.way.devs.levels[1], 1); assert.ok(x.way.devs.people.every(p => !p.name), 'anonymous');
  const kinds = x.way.feed.map(f => f.kind).sort().join(','); assert.strictEqual(kinds, 'kept,level,start,start', kinds);
  assert.ok(!JSON.stringify(x.way).includes('report'), 'no private data');
  const lv = x.way.feed.find(f => f.kind === 'level');
  const before = sent.length; x = call(dan, 'cheer', { key: lv.key, kind: 'cheer' }); assert.strictEqual(x.way.feed.find(f => f.key === lv.key).cheers, 1);
  assert.ok(sent.slice(before).some(s => String(s.p.chat_id) === '2002' && /підтримує/.test(s.p.text)), 'author notified');
  x = call(dan, 'cheer', { key: lv.key, kind: 'cheer' }); assert.strictEqual(x.way.feed.find(f => f.key === lv.key).cheers, 0, 'second tap undoes');
  x = call(anna, 'cheer', { key: lv.key, kind: 'cheer' }); assert.ok(/Себе/.test(x.error));
}
// --- Церква в дії: бінго добрих справ
{
  let x = call(anna, 'bgMark', { cell: 4, on: true }); assert.ok(/клітинка/.test(x.error), 'free cell is not markable');
  x = call(anna, 'bgMark', { cell: 9, on: true }); assert.ok(/клітинка/.test(x.error));
  x = call(anna, 'bgMark', { cell: 0, on: true }); assert.strictEqual(x.bingo.mine, '100000000'); assert.strictEqual(x.bingo.deeds, 1); assert.strictEqual(x.bingo.bingos, 0);
  x = call(anna, 'bgMark', { cell: 8, on: true }); assert.strictEqual(x.bingo.bingos, 1, 'diagonal through the free star');
  x = call(dan, 'bgMark', { cell: 0, on: true }); assert.strictEqual(x.bingo.cells[0], 2); assert.strictEqual(x.bingo.people, 2); assert.strictEqual(x.bingo.mine, '100000000');
  x = call(anna, 'bgMark', { cell: 8, on: false }); assert.strictEqual(x.bingo.bingos, 0, 'untick removes the bingo'); assert.strictEqual(x.bingo.deeds, 2);
  x = call(dan, 'bgMark', { cell: 0, on: false }); assert.strictEqual(x.bingo.people, 1, 'empty card is not a player');
  x = call(admin, 'load'); assert.strictEqual(x.bingo.mine, '000000000'); assert.strictEqual(x.bingo.cells[0], 1);
}
// verse formula matches the app
assert.ok(S.verseOfDay('2026-11-09').ref.uk);
// --- in-app registration: name from the app, contact through the bot
const olga = { id: 7007, first_name: 'Ольга', username: 'olga', language_code: 'uk' };
r = call(olga, 'register', { name: ' ' }); assert.ok(/ім’я/.test(r.error), 'empty name rejected');
r = call(olga, 'register', { name: '  Ольга   Мельник ' }); assert.strictEqual(r.status, 'contact');
assert.strictEqual(call(olga, 'load').error, 'NOT_REGISTERED', 'not yet: no contact');
bot(olga, { contact: { user_id: 7007, phone_number: '380631234567' } });
u = S.rows('Users').find(x => x.id === '7007'); assert.strictEqual(u.status, 'ok'); assert.strictEqual(u.name, 'Ольга Мельник'); assert.strictEqual(u.phone, '+380631234567');
assert.strictEqual(call(olga, 'load').me.name, 'Ольга Мельник', 'registered through the app');

// --- contact signed by Telegram straight from the app (no bot chat needed)
function signTg(f) {
  const dcs = Object.keys(f).sort().map(k => k + '=' + f[k]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return Object.keys(f).map(k => k + '=' + encodeURIComponent(f[k])).join('&') + '&hash=' + hash;
}
const petro = { id: 8008, first_name: 'Петро', language_code: 'uk' };
const goodC = signTg({ contact: JSON.stringify({ user_id: 8008, phone_number: '380501112233', first_name: 'Петро' }), auth_date: String(Math.floor(Date.now() / 1000)) });
r = call(petro, 'contact', { contact: goodC.replace(/hash=.{4}/, 'hash=0000'), name: 'Петро' }); assert.ok(r.error, 'forged contact rejected');
const otherC = signTg({ contact: JSON.stringify({ user_id: 9999, phone_number: '380500000000' }), auth_date: '1' });
r = call(petro, 'contact', { contact: otherC, name: 'Петро' }); assert.ok(/не ваш/.test(r.error), 'foreign contact rejected');
r = call(petro, 'contact', { contact: goodC, name: 'Петро Іваненко' }); assert.ok(r.ok, 'signed contact accepted: ' + JSON.stringify(r));
u = S.rows('Users').find(x => x.id === '8008'); assert.strictEqual(u.status, 'ok'); assert.strictEqual(u.phone, '+380501112233'); assert.strictEqual(u.name, 'Петро Іваненко');
assert.strictEqual(call(petro, 'load').me.name, 'Петро Іваненко', 'in-app contact registers instantly');

// --- sheet turns "07:30" into a Date: settings must come back as HH:mm
{ const stR = S.rows('Settings').find(x => x.key === 'verseTime'); sheets.Settings.data[stR._r - 1][1] = new Date(1899, 11, 30, 7, 30);
  S.resetCache(); assert.strictEqual(call(admin, 'load').settings.verseTime, '07:30', 'time cell normalised'); }
// --- per-person verse time
{ const ago = fmt(new Date(Date.now() - 3 * 60e3), '', 'HH:mm'), today = fmt(new Date(), '', 'yyyy-MM-dd');
  const nowM = (h => +h.slice(0, 2) * 60 + +h.slice(3))(fmt(new Date(), '', 'HH:mm'));
  if (nowM >= 12) {
    call(anna, 'personal', { personal: { verseOn: true, verseAt: ago, lang: 'uk' } });
    props.verseLast = today + '|' + (nowM - 10);
    const b9 = sent.length; S.resetCache(); S.tick();
    const got = sent.slice(b9).filter(s => /Вірш дня|Стих дня/.test(s.p.text || ''));
    assert.strictEqual(got.length, 1, 'own time hit'); assert.strictEqual(got[0].p.chat_id, '2002');
    S.resetCache(); const b10 = sent.length; S.tick(); assert.strictEqual(sent.slice(b10).filter(s => /Вірш дня/.test(s.p.text || '')).length, 0, 'own time once');
  } }

// --- the same number via the app and the bot chat: one welcome, one admin alert
{ const ira = { id: 9090, first_name: 'Ірина', username: 'ira', language_code: 'uk' };
  const cI = signTg({ contact: JSON.stringify({ user_id: 9090, phone_number: '380671234567' }), auth_date: String(Math.floor(Date.now() / 1000)) });
  const b0 = sent.length;
  call(ira, 'register', { name: 'Ірина' });
  call(ira, 'contact', { contact: cI, name: 'Ірина' });
  bot(ira, { contact: { user_id: 9090, phone_number: '380671234567' } });
  const alerts = sent.slice(b0).filter(s => /Новий учасник: Ірина/.test(s.p.text || ''));
  assert.strictEqual(alerts.length, 1, 'admin alerted once, got ' + alerts.length); }

// --- prayer digest at 20:00, answered prayer, English bot, weekly admin digest, calendar file, sermon video
{ const kyiv = (iso, hm) => { for (const off of [2, 3]) { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), +hm.slice(0, 2) - off, +hm.slice(3))); if (fmt(d, '', 'HH:mm') === hm) return d; } };
  const today = fmt(new Date(), '', 'yyyy-MM-dd');
  let x = call(admin, 'needNew', { text: 'За здоров’я мами', vis: 'all' }); const nid = x.needs.find(n => n.mine).id;
  call(anna, 'personal', { personal: { lang: 'en' } });
  assert.strictEqual(S.rows('Users').find(u => u.id === '2002').lang, 'en', 'English kept for the bot');
  call(anna, 'pray', { id: nid, on: true }); call(olga, 'pray', { id: nid, on: true }); call(admin, 'pray', { id: nid, on: true });
  delete props.prayDigest; props.prayDigestAt = String(Date.now() - 3600e3);
  let b = sent.length; S.resetCache(); S.prayDigestJob(kyiv(today, '19:50'));
  assert.strictEqual(sent.length, b, 'no digest before 20:00');
  S.resetCache(); S.prayDigestJob(kyiv(today, '20:05'));
  let dg = sent.slice(b).filter(s => /помолились|помолилися|prayed for you/.test(s.p.text || ''));
  assert.strictEqual(dg.length, 1, 'one digest'); assert.strictEqual(dg[0].p.chat_id, '1001'); assert.ok(/: 2 человека/.test(dg[0].p.text), 'counts others only: ' + dg[0].p.text);
  b = sent.length; S.resetCache(); S.prayDigestJob(kyiv(today, '21:00')); assert.strictEqual(sent.length, b, 'digest once a day');
  b = sent.length; x = call(admin, 'needAnswered', { id: nid });
  const ans = sent.slice(b).filter(s => /God answered|Бог відповів|Бог ответил/.test(s.p.text || ''));
  assert.strictEqual(ans.length, 2, 'both who prayed told'); assert.ok(/God answered/.test(ans.find(s => s.p.chat_id === '2002').p.text), 'English for Anna');
  b = sent.length; call(admin, 'needAnswered', { id: nid }); assert.strictEqual(sent.length, b, 'answered only once');
  call(anna, 'personal', { personal: { lang: 'uk' } });
  // weekly digest: only on Sunday after 20:00, once
  let sun = new Date(); while (fmt(sun, '', 'u') !== '7') sun = new Date(sun.getTime() + 864e5);
  const sIso = fmt(sun, '', 'yyyy-MM-dd'); delete props.weekDigest;
  b = sent.length; S.resetCache(); S.weekDigestJob(kyiv(sIso, '19:00')); assert.strictEqual(sent.length, b, 'no weekly digest before 20:00');
  S.resetCache(); S.weekDigestJob(kyiv(sIso, '20:10'));
  const wk = sent.slice(b).filter(s => /Тиждень у застосунку/.test(s.p.text || ''));
  assert.strictEqual(wk.length, 1, 'weekly digest to the admin'); assert.strictEqual(wk[0].p.chat_id, '1001'); assert.ok(/Молитов: \d+/.test(wk[0].p.text));
  b = sent.length; S.resetCache(); S.weekDigestJob(kyiv(sIso, '21:10')); assert.strictEqual(sent.length, b, 'weekly digest once');
  // calendar file
  const ics = S.doGet({ parameter: { ics: wedKey, l: 'ru' } }).s; 
  assert.ok(/BEGIN:VEVENT/.test(ics) && /SUMMARY:HeavenOS/.test(ics) && new RegExp('DTSTART:' + wedKey.slice(4).replace(/-/g, '') + 'T1[67]1500Z').test(ics), 'ics built');
  assert.strictEqual(S.doGet({ parameter: { ics: 'wed@2026-11-10' } }).s, 'Not found', 'ics only for real dates');
  assert.ok(/misto-svitla/.test(S.doGet({}).s), 'plain doGet still works');
  // sermon video
  x = call(admin, 'sermonSave', { sermon: { date: '2026-11-22', title_uk: 'Відео', video: 'javascript:alert(1)' } }); assert.ok(/https/.test(x.error), 'bad video link rejected');
  x = call(admin, 'sermonSave', { sermon: { date: '2026-11-22', title_uk: 'Відео', video: 'https://youtu.be/abc' } });
  assert.strictEqual(x.sermons.find(s => s.title.uk === 'Відео').video, 'https://youtu.be/abc', 'video saved');
  x = call(admin, 'sermonSave', { sermon: { date: '2026-11-22', title_uk: 'Відео', video: 'https://youtu.be/abc', vfrom: '52:10', vto: '1:31:40' } });
  { const v = x.sermons.find(s => s.title.uk === 'Відео'); assert.strictEqual(v.vfrom, '52:10'); assert.strictEqual(v.vto, '1:31:40'); }
  x = call(admin, 'sermonSave', { sermon: { date: '2026-11-22', title_uk: 'Відео', vfrom: '52 хв' } }); assert.ok(/формат/.test(x.error), 'bad clock rejected');
  x = call(admin, 'sermonSave', { sermon: { date: '2026-11-22', title_uk: 'Відео', vfrom: '1:00:00', vto: '59:00' } }); assert.ok(/пізніше/.test(x.error), 'end must follow start');
  x = call(admin, 'settingsSave', { settings: { ytChannel: 'abc' } }); assert.ok(/UC/.test(x.error), 'bad channel id rejected');
  x = call(admin, 'settingsSave', { settings: { ytChannel: 'UCmK9YFNcVwyrPgj060EM3-g' } }); assert.strictEqual(x.settings.ytChannel, 'UCmK9YFNcVwyrPgj060EM3-g');
}

// --- where people come from: bot /start src_…, app start_param, admin list, weekly digest, public page data
{ const insta = { id: 6060, first_name: 'Іра', language_code: 'uk' };
  bot(insta, { text: '/start src_instagram' });
  assert.strictEqual(S.rows('Users').find(u => u.id === '6060').src, 'instagram', 'bot start keeps the source');
  const fly = { id: 6161, first_name: 'Ліна', language_code: 'uk' };
  S.resetCache(); JSON.parse(S.doPost({ postData: { contents: JSON.stringify({ action: 'register', name: 'Ліна Коваль', initData: initData(fly, 'src_flyer') }) } }).s);
  assert.strictEqual(S.rows('Users').find(u => u.id === '6161').src, 'flyer', 'app start_param keeps the source');
  const evf = { id: 6262, first_name: 'Ян', language_code: 'uk' };
  S.resetCache(); S.doPost({ postData: { contents: JSON.stringify({ action: 'register', name: 'Ян Бій', initData: initData(evf, 'ev_sun_20261122') }) } });
  assert.strictEqual(S.rows('Users').find(u => u.id === '6262').src, 'friend', 'event invite counts as friend');
  bot(insta, { text: 'Іра Мельник' }); bot(insta, { contact: { user_id: 6060, phone_number: '380670000606' } });
  assert.ok(sent.some(s => String(s.p.chat_id) === '1001' && /Іра Мельник.*джерело: Instagram/.test(s.p.text || '')), 'admin sees the source');
  assert.strictEqual(call(admin, 'load').admin.users.find(u => u.id === '6060').src, 'instagram');
  let sun = new Date(); while (fmt(sun, '', 'u') !== '7') sun = new Date(sun.getTime() + 864e5);
  delete props.weekDigest; const b = sent.length; S.resetCache();
  S.weekDigestJob(new Date(parseDate(fmt(sun, '', 'yyyy-MM-dd') + ' 20:30').getTime()));
  assert.ok(sent.slice(b).some(s => /Звідки: .*Instagram 1/.test(s.p.text || '')), 'weekly digest counts sources');
  const pub = JSON.parse(S.doGet({ parameter: { pub: '1' } }).s);
  assert.ok(pub.events.length > 3 && pub.settings.address_uk && !pub.users && !pub.settings.mono, 'public data has schedule only');
  call(admin, 'eventSave', { event: { id: 'pubx', type: 'dates', dates: ['2026-12-31'], time: '20:00', kind: 'evenings', title: { uk: 'Новорічна молитва' }, active: true } });
  assert.ok(JSON.parse(S.doGet({ parameter: { pub: '1' } }).s).events.some(e => e.id === 'pubx'), 'public cache refreshed after edit');
}

// --- quiet prayers for general topics count as lights, capped per person per day
{ const before = call(anna, 'load').lit;
  let r = call(anna, 'prayQuiet', { count: 3 }); assert.strictEqual(r.added, 3);
  assert.strictEqual(call(anna, 'load').lit, before + 3, 'quiet prayers light up');
  r = call(anna, 'prayQuiet', { count: 500 }); assert.strictEqual(r.added, 10, 'max 10 per call');
  for (let i = 0; i < 3; i++) call(anna, 'prayQuiet', { count: 10 });
  assert.strictEqual(call(anna, 'load').lit, before + 30, 'max 30 per person per day');
}

// --- the group's call link is remembered and reused; it can be changed while the room is live
{ const wk = Object.keys(call(admin, 'load').leader || {}).find(k => /^wed@/.test(k)) || wedKey;
  let r = call(admin, 'roomOpen', { key: wedKey, card: 3, link: 'https://t.me/heavenos_wed' });
  assert.strictEqual(call(admin, 'load').calls.wed, 'https://t.me/heavenos_wed', 'link remembered for the group');
  call(admin, 'roomClose', { key: wedKey, summary: '' });
  r = call(admin, 'roomOpen', { key: wedKey, card: 3 });
  assert.strictEqual(call(admin, 'room', { key: wedKey }).room.link, 'https://t.me/heavenos_wed', 'reused next time');
  r = call(admin, 'roomSet', { key: wedKey, link: 'https://meet.google.com/abc-defg-hij' });
  assert.strictEqual(r.room.link, 'https://meet.google.com/abc-defg-hij', 'changed while live');
  assert.strictEqual(call(admin, 'load').calls.wed, 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(call(petro, 'load').calls, null, 'members do not get the list');
}

// --- who is in the app right now
{ let r = call(admin, 'ping'); assert.ok(r.online >= 1, 'ping counts me');
  const before = r.online;
  r = call(anna, 'ping'); assert.strictEqual(r.online, before + (r.online > before ? 1 : 0), 'second person counted');
  assert.ok(call(admin, 'load').online >= 2, 'load returns the online count');
  assert.ok(/NOT_REGISTERED/.test(JSON.stringify(call({ id: 999111, first_name: 'Гість' }, 'ping'))), 'strangers are not counted');
}

console.log('ALL GOOD. messages sent:', sent.length, '| log rows:', (sheets.Log ? sheets.Log.data.length - 1 : 0));
if (sheets.Log && sheets.Log.data.length > 1) console.log(sheets.Log.data.slice(1));
