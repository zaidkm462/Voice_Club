/* ============ إعدادات ============ */
const ROUTES = { new: '#' };
const API_URL = '/api/user/data';

// حالات المستخدم كما ترجع من الخادم (نصوص عربية)
const STATUS_INDEX = {
    'لم يرسل تسجيل': 0,
    'جار المراجعة': 1,
    'تمت الموافقة': 2,
    'مرفوض': 3
};
// حالات التسجيل الفردي (draft / review / approved / rejected)
const ST = {
    draft:    ['لم يُرسل', 's0'],
    review:   ['جار المراجعة', 's1'],
    approved: ['تمت الموافقة', 's2'],
    rejected: ['مرفوض', 's3']
};
const MSG = [
    'لم ترسل أي تسجيل بعد. اضغط «تسجيل جديد» لتبدأ.',
    'وصل تسجيلك ويجري الاستماع إليه الآن. سنرسل لك رسالة عند الانتهاء.',
    'تمت الموافقة على تسجيلك. شكراً لك!',
    'تم رفض تسجيلك. يمكنك المحاولة مرة أخرى بتسجيل جديد.'
];

let recs = [];
let msgs = [];
let USER_STATUS = 'لم يرسل تسجيل';

/* ============ أدوات ============ */
const $ = id => document.getElementById(id);
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const h = (id, i) => 18 + Math.abs(Math.sin(id * 7 + i * .9) * Math.cos(i * .35 + id)) * 82;
const bars = (id, n) => Array.from({ length: n }, (_, i) => `<b style="height:${h(id, i)}%"></b>`).join('');
const toast = m => { $('toastMsg').textContent = m; bootstrap.Toast.getOrCreateInstance($('toast'), { delay: 2600 }).show(); };
const M = { del: new bootstrap.Modal($('delModal')) };
const wrap = bootstrap.Collapse.getOrCreateInstance($('recsWrap'), { toggle: false });

/* ============ شاشة التحميل الأولية (تُخفي الصفحة حتى وصول البيانات) ============ */
(function initialLoading() {
    const s = document.createElement('style');
    s.id = '__init_style';
    s.textContent = '#app{display:none!important}';
    document.head.appendChild(s);
    const el = document.createElement('div');
    el.id = '__init_loading';
    el.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;background:#fff;z-index:99999;font-family:Cairo,sans-serif"><div class="spinner-border" style="color:#C89B3C"></div><div>جارٍ تحميل البيانات…</div></div>';
    document.body.appendChild(el);
})();
function hideInitialLoading() {
    const s = document.getElementById('__init_style');
    const el = document.getElementById('__init_loading');
    if (s) s.remove();
    if (el) el.remove();
}
function showInitialError() {
    const el = document.getElementById('__init_loading');
    if (el) el.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;background:#fff;z-index:99999;font-family:Cairo,sans-serif;color:#B3261E"><i class="bi bi-exclamation-triangle" style="font-size:3rem"></i><div>تعذر تحميل البيانات. تحقق من اتصالك ثم حاول مرة أخرى.</div><button onclick="location.reload()" style="padding:.5rem 1.2rem;border:1px solid #ccc;border-radius:.5rem;background:#fff;cursor:pointer;font-family:inherit;font-size:1rem">إعادة المحاولة</button></div>';
}

/* ============ جلب البيانات من الخادم ============ */
async function loadData(silent) {
    try {
        const res = await fetch(API_URL, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        applyData(data);
        hideInitialLoading();
        return true;
    } catch (err) {
        console.error('loadData failed:', err);
        if (silent) toast('تعذر تحديث البيانات');
        else showInitialError();
        return false;
    }
}

function applyData(data) {
    // اسم المستخدم والدور
    if (data.name) {
        const un = $('uname'); if (un) un.textContent = data.name;
        const sideB = document.querySelector('.side .card b'); if (sideB) sideB.textContent = data.name;
        const sideR = document.querySelector('.side .card .mute'); if (sideR && data.role) sideR.textContent = data.role;
        const sideI = document.querySelector('.side .card .icon-c'); if (sideI) sideI.textContent = data.name[0];
    }
    // حالة المستخدم العامة (نص عربي)
    if (typeof data.status === 'string') USER_STATUS = data.status;

    // التسجيلات (مصفوفة صفوف)
    recs = Array.isArray(data.recordings) ? data.recordings.map(normalizeRecording) : [];

    // الرسائل (مصفوفة صفوف)
    msgs = Array.isArray(data.messages) ? data.messages.map(normalizeMessage) : [];

    refresh();
}

/* ============ تطبيع بيانات الخادم (الصفوف مصفوفات) ============ */
function basename(p) { if (!p) return ''; const parts = String(p).split(/[\\/]/); return parts[parts.length - 1] || ''; }
function stripExt(n) { return String(n || '').replace(/\.[^.]+$/, ''); }

// تسجيل: [id, audio_path, pdf_path, duration_seconds, submitted, created_at]
function normalizeRecording(row) {
    const id    = row[0];
    const audio = row[1] || '';
    const pdf   = row[2] || '';
    const dur   = +row[3] || 0;
    const sub   = row[4];
    const date  = String(row[5] || '').slice(0, 10);

    // submitted: 0 = لم يُرسل | 1 = جار المراجعة | 2 = تمت الموافقة | 3 = مرفوض
    let status = 'draft';
    if (sub === 1) status = 'review';
    else if (sub === 2) status = 'approved';
    else if (sub === 3) status = 'rejected';

    // لا يوجد عمود title في الاستعلام → نستخرج الاسم من ملف PDF ثم الصوت
    const title = stripExt(basename(pdf)) || stripExt(basename(audio)) || 'تسجيل';

    return { id, title, date, dur, status, audio, pdf };
}

// رسالة: [id, title, content, is_read, created_at]
function normalizeMessage(row) {
    return {
        id:     row[0],
        from:   'فريق جرب صوتك',       // لا يُرجعه الاستعلام حالياً
        title:  row[1] || '',
        body:   row[2] || '',
        unread: !(row[3] === 1),
        time:   relTime(row[4])
    };
}

// التاريخ النسبي: "اليوم" / "أمس" / "قبل 3 أيام"…
function relTime(s) {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T'));
    if (isNaN(d)) return String(s);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return 'قبل ' + Math.floor(diff / 60) + ' دقيقة';
    if (diff < 86400) return 'قبل ' + Math.floor(diff / 3600) + ' ساعة';
    if (diff < 172800) return 'أمس';
    if (diff < 604800) return 'قبل ' + Math.floor(diff / 86400) + ' أيام';
    return d.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long' });
}

/* ============ حالة المستخدم ============ */
function userState() { return STATUS_INDEX[USER_STATUS] ?? 0; }
function renderStatus() {
    const i = userState();
    const pillIdx = i === 3 ? 0 : i;   // المرفوض يُعرض بلون محايد (s0) حالياً
    $('pill').className = 'pill s' + pillIdx;
    $('pt').textContent = ['لم يرسل تسجيل', 'جار المراجعة', 'تمت الموافقة', 'مرفوض'][i];
    $('msg').textContent = MSG[i] || MSG[0];

    const stepIdx = i === 3 ? 1 : i;   // للمرفوض نُبقي المؤشر على خطوة المراجعة
    const st = document.querySelectorAll('#steps .step'), br = document.querySelectorAll('#steps .bar-s');
    st.forEach((e, k) => {
        e.classList.toggle('on', k <= stepIdx);
        e.classList.toggle('cur', k === stepIdx);
        e.querySelector('.dot').innerHTML = k < stepIdx ? '<i class="bi bi-check-lg fs-5"></i>' : k + 1;
    });
    br.forEach((e, k) => e.classList.toggle('on', k < stepIdx));
}

/* ============ قائمة التسجيلات ============ */
function renderList() {
    $('cnt').textContent = recs.length ? `(${recs.length})` : '';
    $('list').innerHTML = recs.length ? recs.map(r => `
    <div class="col"><article class="card h-100"><div class="card-body d-flex flex-column gap-3 p-4">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <h3 class="fs-5 fw-bolder mb-0">${r.title}</h3>
        <span class="pill ${(ST[r.status] || ST.draft)[1]}"><i></i>${(ST[r.status] || ST.draft)[0]}</span>
      </div>
      <div class="mute d-flex gap-3">
        <span><i class="bi bi-calendar3"></i> ${r.date ? new Date(r.date).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long' }) : ''}</span>
        <span><i class="bi bi-stopwatch"></i> ${fmt(r.dur)}</span>
      </div>
      <div class="wave" aria-hidden="true">${bars(r.id, 34)}</div>
      <div class="d-flex gap-2 mt-auto" data-id="${r.id}">
        <button class="btn btn-gold flex-grow-1" data-a="play"><i class="bi bi-play-fill"></i> تشغيل</button>
        <button class="btn btn-line" data-a="send" ${r.status !== 'draft' ? 'disabled' : ''}><i class="bi bi-send"></i> إرسال</button>
        <button class="btn btn-line btn-del" data-a="del" aria-label="حذف" ${r.status !== 'draft' ? 'disabled' : ''}><i class="bi bi-trash3"></i></button>
      </div>
    </div></article></div>`).join('')
        : `<div class="col-12"><div class="card"><div class="card-body text-center p-5"><i class="bi bi-mic fs-1 mute"></i><p class="fs-5 mb-3">لا توجد تسجيلات بعد.</p><a href="#" data-go="new" class="btn btn-gold">سجّل صوتك الآن</a></div></div></div>`;
}

async function submit_record(id) {
    try {
        const res = await fetch("/api/recordings/submit", {
            method: 'POST',
            credentials: 'same-origin',
            body: JSON.stringify({"record_id": id}),
            headers: { "Content-Type": "application/json"}
        });
        if (!res.ok) {toast('تعذر ارسال التسجيل'); return;}
        loadData(true);
    } catch (err) {
        console.error('loadData failed:', err);
        toast('تعذر ارسال التسجيل');
    }
}

let target = null;
$('list').addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = +b.parentElement.dataset.id, r = recs.find(x => x.id === id);
    if (!r) return;
    if (b.dataset.a === 'play') openReader(r);                       // ← فتح القارئ
    if (b.dataset.a === 'send') { r.status = 'review'; refresh(); toast('تم إرسال التسجيل للمراجعة');submit_record(r.id); }
    if (b.dataset.a === 'del') { target = r; $('delName').textContent = r.title; M.del.show(); }
});
$('delOk').onclick = () => { recs = recs.filter(r => r !== target); M.del.hide(); refresh(); toast('تم حذف التسجيل'); };
function refresh() { renderList(); renderStatus(); renderMsgs(); }

/* ============ وضع القراءة: PDF بتقليب الصفحات + الصوت الحقيقي ============ */
let cur = null, t = 0, book = null, pages = 0, scrollY0 = 0, token = 0;
let audioEl = null, playing = false;

function upd() {
    $('tNow').textContent = fmt(t);
    const n = $('pWave').children;
    const k = cur ? Math.round(t / cur.dur * n.length) : 0;
    for (let i = 0; i < n.length; i++) n[i].classList.toggle('on', i < k);
    $('pBtn').innerHTML = playing
        ? '<i class="bi bi-pause-fill"></i> إيقاف مؤقت'
        : '<i class="bi bi-play-fill"></i> تشغيل';
}

function ensureAudio() {
    if (audioEl || !cur || !cur.audio) return;
    audioEl = new Audio(cur.audio);
    audioEl.preload = 'auto';
    audioEl.addEventListener('loadedmetadata', () => {
        if ((!cur.dur || !isFinite(cur.dur)) && audioEl.duration) {
            cur.dur = Math.round(audioEl.duration);
            $('tTot').textContent = '/ ' + fmt(cur.dur);
            upd();
        }
    });
    audioEl.addEventListener('timeupdate', () => { t = audioEl.currentTime; upd(); });
    audioEl.addEventListener('ended', () => { playing = false; t = cur.dur; upd(); });
    audioEl.addEventListener('error', () => { toast('تعذر تشغيل الملف الصوتي'); playing = false; upd(); });
}

function play() {
    if (!cur) return;
    if (!cur.audio) { toast('لا يوجد ملف صوتي لهذا التسجيل'); return; }
    ensureAudio();
    if (!audioEl) return;
    audioEl.play().then(() => { playing = true; upd(); }).catch(err => {
        console.error(err);
        toast('تعذر تشغيل الملف الصوتي');
    });
}
function pause() {
    if (audioEl) audioEl.pause();
    playing = false; upd();
}
function stop() {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
    t = 0; playing = false; upd();
    if (book) try { book.goTo(1); } catch (e) {}
}
function seek(f) {
    if (!cur) return;
    const nt = cur.dur * Math.min(1, Math.max(0, f));
    if (audioEl) audioEl.currentTime = nt;
    t = nt; upd();
}

async function loadBook(r, my) {
    const box = $('rdLoad'); box.classList.remove('d-none');
    box.innerHTML = '<div class="spinner-border" style="color:var(--gold)"></div><div id="rdMsg">جارٍ تحميل الملف…</div>';
    try {
        $('stage').innerHTML = '<div id="book" style="width:100%;height:100%"></div>';
        await new Promise(res => requestAnimationFrame(res));
        if (my !== token) return;

        book = PDFlipbook.create($('book'), {
            url: r.pdf,
            duration: 520,
            pageNumbers: true,
            arrows: true,
            controls: true,
            displayMode: 'auto',
            shadow: 'fullscreen',
            // نسخة UMD من pdf.js (تعمل كسكربت عادي)
            pdfjsSrc:     'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            pdfWorkerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        });

        pages = book.pageCount || book.pages || 0;
        $('pgInfo').textContent = pages ? `صفحة 1 / ${pages}` : '';

        if (book && typeof book.on === 'function') {
            book.on('flip', e => {
                const p = (e && e.data != null) ? e.data + 1 : ((book.currentPage || 0) + 1);
                if (pages) $('pgInfo').textContent = `صفحة ${p} / ${pages}`;
            });
        }

        box.classList.add('d-none');
    } catch (err) {
        console.error(err);
        box.innerHTML = '<i class="bi bi-exclamation-triangle fs-1"></i><div>تعذر تحميل ملف PDF، لكن الصوت يعمل.</div>';
    }
}

function openReader(r) {
    cur = r; t = 0; book = null; pages = 0; audioEl = null; playing = false;
    const my = ++token; scrollY0 = window.scrollY;

    // عنوان التسجيل في الترويسة
    let rdTitle = $('rdTitle');
    if (!rdTitle) {
        const rdTop = document.querySelector('#reader .rd-top');
        if (rdTop) {
            rdTitle = document.createElement('b');
            rdTitle.id = 'rdTitle';
            rdTitle.className = 'ms-auto fs-5';
            rdTop.appendChild(rdTitle);
        }
    }
    if (rdTitle) rdTitle.textContent = r.title;

    $('tTot').textContent = '/ ' + fmt(r.dur);
    $('pgInfo').textContent = '';
    $('pWave').innerHTML = bars(r.id, 90);
    $('stage').innerHTML = '';

    // تعطيل أزرار التنزيل إذا لم يوجد ملف
    const dlAudio = document.querySelector('#reader .bi-file-earmark-music')?.closest('button');
    const dlPdf   = document.querySelector('#reader .bi-filetype-pdf')?.closest('button');
    if (dlAudio) dlAudio.disabled = !r.audio;
    if (dlPdf)   dlPdf.disabled   = !r.pdf;

    // إزالة خلفية rdLoad الافتراضية (aqua)
    const rdl = $('rdLoad'); if (rdl) rdl.style.backgroundColor = '';

    document.body.classList.add('reading'); upd();
    requestAnimationFrame(() => loadBook(r, my).then(() => { if (my === token) play(); }));
}

function closeReader() {
    token++; pause();
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl.src = ''; audioEl = null; }
    try { book && book.destroy && book.destroy(); } catch (e) {}
    book = null; $('stage').innerHTML = '';
    document.body.classList.remove('reading'); scrollTo(0, scrollY0);
}

/* ============ أزرار التنزيل ============ */
function downloadFile(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || '';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
}
(function bindDownloads() {
    const btns = document.querySelectorAll('#reader .rd-top button');
    btns.forEach(b => {
        if (b.id === 'rdBack') return;
        const html = b.innerHTML || '';
        if (html.includes('bi-file-earmark-music')) {
            b.addEventListener('click', () => {
                if (!cur || !cur.audio) return toast('لا يوجد ملف صوتي');
                downloadFile(cur.audio, (cur.title || 'audio') + '.mp3');
            });
        } else if (html.includes('bi-filetype-pdf')) {
            b.addEventListener('click', () => {
                if (!cur || !cur.pdf) return toast('لا يوجد ملف PDF');
                downloadFile(cur.pdf, (cur.title || 'file') + '.pdf');
            });
        }
    });
})();

/* ============ ربط أزرار القارئ ============ */
$('pBtn').onclick = () => playing ? pause() : play();
$('rdBack').onclick = closeReader;
$('pgPrev').onclick = () => book && book.prev();
$('pgNext').onclick = () => book && book.next();
$('pWave').onclick = e => {
    const b = e.currentTarget.getBoundingClientRect();
    seek((b.right - e.clientX) / b.width); // الموجة من اليمين لليسار
};
document.addEventListener('keydown', e => {
    if (!document.body.classList.contains('reading')) return;
    if (e.key === 'Escape') closeReader();
    else if (e.code === 'Space' && !/BUTTON|A/.test(e.target.tagName)) { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === 'ArrowLeft')  book && book.prev();
    else if (e.key === 'ArrowRight') book && book.next();
});

/* ============ الرسائل ============ */
function renderMsgs() {
    const n = msgs.filter(m => m.unread).length;
    document.querySelectorAll('.ucnt').forEach(e => { e.textContent = n; e.classList.toggle('d-none', !n); });
    $('mpill').className = 'pill py-0 ' + (n ? 's1' : 's0');
    $('mpill').textContent = n ? n + ' جديدة' : 'لا جديد';
    $('mlist').innerHTML = msgs.length ? msgs.map(m => `
    <div class="col"><article class="card msg h-100 ${m.unread ? 'unread' : ''}"><div class="card-body p-4 d-flex gap-3">
      <span class="icon-c"><i class="bi bi-envelope${m.unread ? '-fill' : '-open'}"></i></span>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between gap-2 mute" style="font-size:1rem"><span>${m.from}</span><span>${m.time}</span></div>
        <h3 class="fs-5 fw-bolder my-1">${m.title}</h3>
        <p class="mb-2">${m.body}</p>
        ${m.unread ? `<button class="btn btn-line btn-sm" data-read="${m.id}"><i class="bi bi-check2"></i> تحديد كمقروءة</button>` : ''}
      </div>
    </div></article></div>`).join('')
    : `<div class="col-12"><div class="card"><div class="card-body text-center p-5"><i class="bi bi-envelope-open fs-1 mute"></i><p class="fs-5 mb-0">لا توجد رسائل.</p></div></div></div>`;
}
$('mlist').addEventListener('click', e => {
    const b = e.target.closest('[data-read]'); if (!b) return;
    const m = msgs.find(x => x.id === +b.dataset.read);
    if (m) m.unread = false;
    renderMsgs();
});

/* ============ التنقل والطي ============ */
const mwrap = bootstrap.Collapse.getOrCreateInstance($('msgsWrap'), { toggle: false });
[['recsWrap', 'chev'], ['msgsWrap', 'chevM']].forEach(([w, c]) => {
    $(w).addEventListener('shown.bs.collapse', () => { $(c).className = 'bi bi-chevron-up fs-4 mute'; });
    $(w).addEventListener('hidden.bs.collapse', () => { $(c).className = 'bi bi-chevron-down fs-4 mute'; });
});

// تحويل زرّي «إخفاء» إلى زرّي «تحديث» يطلبان نفس الـ endpoint
['hideRecs', 'hideMsgs'].forEach(id => {
    const b = $(id);
    if (!b) return;
    b.innerHTML = '<i class="bi bi-arrow-clockwise"></i> تحديث';
    b.onclick = () => loadData(true);
});

// فتح/إغلاق قسم واحد بالضغط على الخيار نفسه (بدون سكرول)
function openSection(g) {
    const [a, b] = g === 'recs' ? [wrap, mwrap] : [mwrap, wrap];
    const el = g === 'recs' ? $('recsWrap') : $('msgsWrap');
    b.hide();
    if (el.classList.contains('show')) a.hide();
    else a.show();
}

document.addEventListener('click', e => {
    const a = e.target.closest('[data-go]'); if (!a) return; e.preventDefault();
    const g = a.dataset.go;
    if (g === 'recs' || g === 'msgs') openSection(g);
    else if (g === 'home') scrollTo({ top: 0, behavior: 'smooth' });
    else if (ROUTES[g] && ROUTES[g] !== '#') location.href = ROUTES[g];
    else toast('هنا تنتقل إلى صفحة التسجيل');
});

/* ============ الإقلاع ============ */
loadData(false);