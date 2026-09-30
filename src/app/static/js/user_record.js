/* ============================================================
   جرب صوتك | صفحة تسجيل جديد
   ============================================================ */
const $ = id => document.getElementById(id);
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const reader = $('reader');
const recordingCount = Number(reader.dataset.recordingCount);
const maxRecordUploads = Number(reader.dataset.maxRecords);
const recordingLimitReached = recordingCount >= maxRecordUploads;
const toast = (m, icon = 'bi-info-circle') => {
    $('toastMsg').innerHTML = `<i class="bi ${icon}"></i><span>${m}</span>`;
    bootstrap.Toast.getOrCreateInstance($('toast'), { delay: 3200 }).show();
};
const modals = {
    name: new bootstrap.Modal($('nameModal')),
    choose: new bootstrap.Modal($('chooseModal'))
};

function applyRecordingLimit() {
    if (!recordingLimitReached) return;
    ['btnUpload', 'btnUpload2', 'btnChoose', 'btnChoose2', 'btnRec'].forEach(id => {
        $(id).disabled = true;
    });
    $('recordLimitMessage').classList.remove('d-none');
    $('recHint').textContent = 'لقد تجاوزت عدد التسجيلات';
}

applyRecordingLimit();

/* ============================================================
   1) بيانات وهمية + دوال جلب/إرسال البيانات
   ============================================================ */
const DUMMY_PDFS = [
    { pdf_id: 'demo-1', name: 'قصة الأرنب الصغير', url: 'https://13dagger.github.io/pdf-test-files/with-images.pdf' },
    { pdf_id: 'demo-2', name: 'مغامرات في الغابة', url: 'https://13dagger.github.io/pdf-test-files/with-images.pdf' },
    { pdf_id: 'demo-3', name: 'رحلة إلى القمر', url: 'https://13dagger.github.io/pdf-test-files/with-images.pdf' },
    { pdf_id: 'demo-4', name: 'حكايات ما قبل النوم', url: 'https://13dagger.github.io/pdf-test-files/with-images.pdf' },
    { pdf_id: 'demo-5', name: 'عالم الحيوانات', url: 'https://13dagger.github.io/pdf-test-files/with-images.pdf' }
];

async function fetchPdfList() {
    const res = await fetch('/api/pdfs/get_pdfs');
    if (!res.ok) throw new Error('فشل جلب قائمة ملفات PDF');
    return await res.json();
}

async function uploadPdf(name, file) {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('file', file);
    const res = await fetch('/api/pdfs/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('فشل رفع ملف PDF');
    return await res.json();
}

async function uploadRecording(pdfId, durationSec, audioBlob) {
    const fd = new FormData();
    fd.append('pdf_id', pdfId);
    fd.append('duration', Math.round(durationSec));
    fd.append('file', audioBlob, 'recording.webm');
    const res = await fetch('/api/recordings/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('فشل رفع التسجيل الصوتي');
    return await res.json();
}

/* ============================================================
   2) عرض PDF عبر PDFlipbook
   ============================================================ */
let book = null, pages = 0;
let pdfSource = null;
let loadToken = 0;

function h(id, i) { return 18 + Math.abs(Math.sin(id * 7 + i * .9) * Math.cos(i * .35 + id)) * 82; }
function bars(id, n) { return Array.from({ length: n }, (_, i) => `<b style="height:${h(id, i)}%"></b>`).join(''); }

async function loadBook(url, my) {
    $('rdEmpty').classList.add('d-none');
    const box = $('rdLoad'); box.classList.remove('d-none');
    box.innerHTML = '<div class="spinner-border" style="color:var(--gold)"></div><div>جارٍ تحميل الملف…</div>';
    try {
        $('stage').innerHTML = '<div id="book" style="width:100%;height:100%"></div>';
        await new Promise(res => requestAnimationFrame(res));
        if (my !== loadToken) return;

        try { book && book.destroy && book.destroy(); } catch (e) { }
        book = PDFlipbook.create($('book'), {
            url: url,
            duration: 520,
            pageNumbers: true,
            arrows: true,
            controls: true,
            displayMode: 'auto',
            shadow: 'fullscreen',
            rtl: true,
            spine: true,
            maxScale: 20,
            padding: 0,
            pdfjsSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            pdfWorkerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
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
        box.innerHTML = '<i class="bi bi-exclamation-triangle fs-1"></i><div>تعذر تحميل ملف PDF.</div>';
        toast('تعذر تحميل ملف PDF', 'bi-exclamation-triangle');
    }
}

function openPdf(url, meta) {
    if (recordingLimitReached) return;
    if (pdfSource && pdfSource.objUrl) URL.revokeObjectURL(pdfSource.objUrl);
    pdfSource = meta; loadToken++;
    loadBook(url, loadToken);
    
    isSaveSuccessful = false;
    discardCurrent();
    
    $('btnRec').disabled = !canRecord;
    $('recHint').textContent = meta.name;
    updateSaveState();
}

$('pgPrev').onclick = () => book && (book.prev ? book.prev() : book.flipPrev && book.flipPrev());
$('pgNext').onclick = () => book && (book.next ? book.next() : book.flipNext && book.flipNext());
document.addEventListener('keydown', e => {
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') $('pgPrev').click();
    else if (e.key === 'ArrowRight') $('pgNext').click();
});

/* ---- رفع PDF من الجهاز ---- */
['btnUpload', 'btnUpload2'].forEach(id => $(id).onclick = () =>$('pdfFileInput').click());
let pendingFile = null;
$('pdfFileInput').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { toast('يرجى اختيار ملف PDF صالح', 'bi-exclamation-triangle'); return; }
    pendingFile = f;
    $('pdfNameInput').value = f.name.replace(/\.pdf$/i, '');
    modals.name.show();
    setTimeout(() => $('pdfNameInput').focus(), 300);
    e.target.value = '';
};
$('nameOk').onclick = () => {
    const name = $('pdfNameInput').value.trim() || 'ملف بدون اسم';
    if (!pendingFile) return;
    modals.name.hide();
    const objUrl = URL.createObjectURL(pendingFile);
    openPdf(objUrl, { type: 'uploaded', file: pendingFile, name, objUrl });
    pendingFile = null;
};

/* ---- اختيار PDF من المكتبة ---- */
let libItems = [];
$('chooseModal').addEventListener('show.bs.modal', async () => {
    $('pdfSearch').value = '';$('pdfLibList').innerHTML = ''; $('pdfLibEmpty').classList.add('d-none');$('pdfLibLoad').classList.remove('d-none');
    try { libItems = await fetchPdfList(); renderLib(libItems); }
    catch (e) { toast('تعذر جلب قائمة الملفات', 'bi-exclamation-triangle'); libItems = []; renderLib([]); }
    $('pdfLibLoad').classList.add('d-none');
});
function renderLib(items) {
    $('pdfLibEmpty').classList.toggle('d-none', items.length > 0);$('pdfLibList').innerHTML = items.map(p => `
    <div class="col"><div class="card pdf-card h-100 ${pdfSource && pdfSource.pdf_id === p.pdf_id ? 'sel' : ''}" data-id="${p.pdf_id}">
      <div class="card-body d-flex align-items-center gap-3 p-3">
        <span class="icon-c"><i class="bi bi-filetype-pdf"></i></span>
        <b class="text-truncate">${p.name}</b>
      </div>
    </div></div>`).join('');
}
$('pdfSearch').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    renderLib(libItems.filter(p => p.name.toLowerCase().includes(q)));
};
$('pdfLibList').addEventListener('click', e => {
    const c = e.target.closest('.pdf-card'); if (!c) return;
    const p = libItems.find(x => Number(x.pdf_id) === Number(c.dataset.id)); if (!p) return;
    modals.choose.hide();
    openPdf(p.url, { type: 'library', pdf_id: p.pdf_id, name: p.name });
});
['btnChoose', 'btnChoose2'].forEach(id => $(id).onclick = () => modals.choose.show());

/* ============================================================
   3) تسجيل الصوت
   ============================================================ */
const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
if (!canRecord) {
    console.warn('التسجيل الصوتي غير متاح: يتطلب اتصالاً آمناً (HTTPS) أو localhost، أو متصفحاً يدعم MediaRecorder.');
}

let stream = null, recorder = null, chunks = [], audioBlob = null, durationSec = 0;
let recordingStopPromise = null;
let recState = 'idle';   // idle | recording | paused | stopped
let isSaveSuccessful = false;
let discardFlag = false;
let timerInt = null, tStart = 0, tPaused = 0;
let actx = null, analyser = null, dataArr = null, rafId = null;

let playAudio = null, playSrcNode = null, playing = false;

$('pWave').innerHTML = bars(1, 48);
const waveBars = () => [...$('pWave').children];
function resetWaveIdle() { waveBars().forEach(b => { b.style.height = ''; b.classList.remove('on'); }); }

// الحصول على المدة الإجمالية للتسجيل بالثواني
function getRecordedDuration() {
    if (recState === 'recording') {
        return (performance.now() - tStart) / 1000 + tPaused;
    }
    return durationSec || tPaused;
}

function setRecUI() {
    const btn = $('btnRec'), dot = $('recDot'), wave =$('pWave'), play = $('btnPlay'), redo =$('btnRedo');
    btn.classList.remove('live'); wave.classList.remove('live'); dot.classList.remove('live');
    btn.disabled = recordingLimitReached || !canRecord || !pdfSource;
    play.classList.remove('live'); play.innerHTML = '<i class="bi bi-play-fill"></i>';
    redo.disabled = recState === 'idle';
    play.disabled = !audioBlob || recState === 'recording' || recState === 'paused';

    if (recState === 'recording') {
        btn.classList.add('live'); wave.classList.add('live'); dot.classList.add('live');
        btn.innerHTML = '<i class="bi bi-pause-fill"></i>'; 
        btn.title = 'إيقاف مؤقت للتسجيل';
    } else if (recState === 'paused') {
        btn.innerHTML = '<i class="bi bi-mic-fill"></i>';
        btn.title = 'استئناف التسجيل';
    } else {
        btn.innerHTML = '<i class="bi bi-mic-fill"></i>';
        btn.title = recState === 'stopped' ? 'تسجيل من جديد' : 'بدء التسجيل';
    }

    if (playing) { play.classList.add('live'); play.innerHTML = '<i class="bi bi-pause-fill"></i>'; }
    if (!canRecord) btn.title = 'التسجيل الصوتي يتطلب اتصالاً آمناً (HTTPS) أو تشغيل الموقع على localhost';
    updateSaveState();
}

function tick() { 
    if (recState === 'recording') {
        const total = (performance.now() - tStart) / 1000 + tPaused;
        $('tNow').textContent = fmt(total); 
        updateSaveState(); // التحديث أثناء التسجيل لتشغيل زر الحفظ فور تجاوُز 3 ثوانٍ
    }
}

function drawLive() {
    if (!analyser || recState !== 'recording') return;
    analyser.getByteFrequencyData(dataArr);
    const bs = waveBars(), step = Math.floor(dataArr.length / bs.length) || 1;
    bs.forEach((b, i) => {
        const v = dataArr[i * step] || 0;
        b.style.height = Math.max(8, (v / 255) * 100) + '%';
        b.classList.toggle('on', v > 10);
    });
    rafId = requestAnimationFrame(() => drawLive());
}

async function startRecording() {
    if (!canRecord) { toast('التسجيل الصوتي يتطلب اتصالاً آمناً HTTPS أو localhost، أو أن متصفحك لا يدعمه', 'bi-mic-mute'); return; }
    if (!pdfSource) { toast('يرجى اختيار ملف PDF أولاً', 'bi-exclamation-triangle'); return; }
    stopPlayback();
    
    isSaveSuccessful = false;

    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        console.error(e);
        toast('تعذر الوصول إلى الميكروفون، تحقق من إذن المتصفح', 'bi-mic-mute');
        return;
    }
    chunks = []; audioBlob = null; discardFlag = false;
    try {
        recorder = new MediaRecorder(stream);
    } catch (e) {
        console.error(e); toast('متصفحك لا يدعم تسجيل الصوت', 'bi-mic-mute');
        stream.getTracks().forEach(t => t.stop()); return;
    }

    recordingStopPromise = new Promise(resolve => {
        recorder.__resolveStop = resolve;
    });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (discardFlag) { discardFlag = false; return; }
        audioBlob = chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null;
        durationSec = tPaused;
        if (!audioBlob) toast('لم يُسجَّل أي صوت، حاول مرة أخرى', 'bi-exclamation-triangle');
        recState = audioBlob ? 'stopped' : 'idle';
        resetWaveIdle(); setRecUI();
        if (recorder.__resolveStop) {
            recorder.__resolveStop(audioBlob);
            recorder.__resolveStop = null;
        }
    };

    recorder.start(100);

    actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaStreamSource(stream);
    analyser = actx.createAnalyser(); analyser.fftSize = 128; dataArr = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);

    tStart = performance.now(); tPaused = 0; durationSec = 0;
    clearInterval(timerInt); timerInt = setInterval(tick, 200); tick();
    recState = 'recording'; 
    drawLive();
    setRecUI();
}

function pauseRecording() {
    if (recorder && recorder.state === 'recording') {
        recorder.pause();
        tPaused += (performance.now() - tStart) / 1000;
        durationSec = tPaused;
        cancelAnimationFrame(rafId);
        if (actx) actx.suspend();
        recState = 'paused';
        resetWaveIdle();
        setRecUI();
    }
}

function resumeRecording() {
    if (recorder && recorder.state === 'paused') {
        recorder.resume();
        tStart = performance.now();
        if (actx) actx.resume();
        recState = 'recording';
        drawLive();
        setRecUI();
    }
}

function finishRecording() {
    cancelAnimationFrame(rafId); clearInterval(timerInt);
    if (recState === 'recording') {
        tPaused += (performance.now() - tStart) / 1000;
        durationSec = tPaused;
    }
    if (actx) { actx.close().catch(() => { }); actx = null; }
    if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
        return recordingStopPromise;
    }
    return Promise.resolve(audioBlob);
}

function discardCurrent() {
    cancelAnimationFrame(rafId); clearInterval(timerInt);
    if (recorder && recorder.state !== 'inactive') { discardFlag = true; recorder.stop(); }
    else if (stream) { stream.getTracks().forEach(t => t.stop()); }
    if (actx) { actx.close().catch(() => { }); actx = null; }
    stopPlayback();
    audioBlob = null; chunks = []; tPaused = 0; durationSec = 0;
    $('tNow').textContent = '0:00'; resetWaveIdle();
    recState = 'idle'; 
    isSaveSuccessful = false;
    setRecUI();
}

$('btnRec').onclick = () => {
    if (recordingLimitReached) {
        toast('لقد تجاوزت عدد التسجيلات', 'bi-exclamation-triangle');
    } else if (recState === 'idle' || recState === 'stopped') {
        startRecording();
    } else if (recState === 'recording') {
        pauseRecording();
    } else if (recState === 'paused') {
        resumeRecording();
    }
};

$('btnRedo').onclick = () => { if (recState !== 'idle') discardCurrent(); };

/* ---- الاستماع للتسجيل ---- */
function stopPlayback() {
    if (playAudio) { try { playAudio.pause(); } catch (e) { } }
    playing = false; cancelAnimationFrame(rafId); resetWaveIdle(); setRecUI();
}

function togglePlayback() {
    if (!audioBlob) return;
    if (playing) { stopPlayback(); return; }
    if (!playAudio || playAudio.__blob !== audioBlob) {
        if (playAudio) { try { playAudio.pause(); } catch (e) { } }
        playAudio = new Audio(URL.createObjectURL(audioBlob));
        playAudio.__blob = audioBlob;
        playAudio.onended = () => stopPlayback();
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        try {
            playSrcNode = actx.createMediaElementSource(playAudio);
            analyser = actx.createAnalyser(); analyser.fftSize = 128; dataArr = new Uint8Array(analyser.frequencyBinCount);
            playSrcNode.connect(analyser); analyser.connect(actx.destination);
        } catch (e) { }
    }
    playAudio.play();
    playing = true; setRecUI(); drawLive();
}
$('btnPlay').onclick = togglePlayback;

setRecUI();

/* ============================================================
   4) حفظ التسجيل والرفع
   ============================================================ */
function updateSaveState() { 
    const currentDuration = getRecordedDuration();
    // شرط التفعيل: اختيار PDF + تجاوز المدة 3 ثوانٍ + لم يحفظ بنجاح من قبل + التسجيل ليس في حالة خمول (idle)
    const canSave = pdfSource && currentDuration >= 3 && !isSaveSuccessful && recState !== 'idle';
    $('btnSave').disabled = !canSave; 
}

$('btnSave').onclick = async () => {
    if (!pdfSource) { toast('يرجى اختيار ملف PDF أولاً', 'bi-exclamation-triangle'); return; }
    
    // إنهاء التسجيل إذا كان يعمل أو متوقفاً مؤقتاً قبل استخراج الـ AudioBlob
    if (recState === 'paused' || recState === 'recording') {
        await finishRecording();
    }
    
    // التحقق مجدداً من المدة قبل إرسال الطلب
    if (getRecordedDuration() < 3) {
        toast('يجب أن يكون طول التسجيل 3 ثوانٍ على الأقل', 'bi-exclamation-triangle');
        return;
    }

    const btn = $('btnSave'), oldHtml = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> يرجى الانتظار…';
    toast('يرجى الانتظار لحين إرسال التسجيل…', 'bi-hourglass-split');

    try {
        let pdfId = pdfSource.type === 'library' ? pdfSource.pdf_id : (await uploadPdf(pdfSource.name, pdfSource.file)).pdf_id;
        
        if (!(audioBlob instanceof Blob) || audioBlob.size === 0) {
            throw new Error('لم يكتمل التسجيل الصوتي');
        }
        await uploadRecording(pdfId, durationSec, audioBlob);
        
        isSaveSuccessful = true;
        toast('تم حفظ التسجيل بنجاح، بانتظار المراجعة', 'bi-check2-circle');
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> تم الحفظ';
    } catch (e) {
        console.error(e);
        toast('تعذر إرسال التسجيل، حاول مرة أخرى', 'bi-exclamation-triangle');
        
        isSaveSuccessful = false;
        btn.innerHTML = oldHtml;
    } finally {
        updateSaveState();
    }
};