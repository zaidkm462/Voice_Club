// Focused tests of the actual dashboard functions; no browser/network required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/static/js/user_dash.js'), 'utf8');
const normalize = source.slice(source.indexOf('function normalizeRecording(row)'), source.indexOf('function normalizeMessage(row)'));
const submission = source.slice(source.indexOf('let submissionBusy = false;'), source.indexOf('let target = null;'));

async function main() {
    const messages = [];
    let calls = 0;
    let refreshes = 0;
    let resolveResponse;
    const context = vm.createContext({
        USER_STATUS: 'تمت الموافقة',
        fetch: () => { calls++; return new Promise(resolve => { resolveResponse = resolve; }); },
        loadData: async () => { refreshes++; return true; },
        toast: message => messages.push(message),
        console: { error() {} },
    });
    vm.runInContext(normalize + '\n' + submission, context);
    const button = { disabled: false };
    const pending = context.submit_record(7, button);
    assert.equal(button.disabled, true);
    assert.equal(messages.length, 0, 'No success before server response');
    await context.submit_record(7, button);
    assert.equal(calls, 1, 'Double click does not send a second request');
    resolveResponse({ ok: true, json: async () => ({ recording_id: 7, submitted: true }) });
    await pending;
    assert.equal(refreshes, 1);
    assert.equal(button.disabled, false);
    assert.equal(messages.pop(), 'تم إرسال التسجيل للمراجعة');
    context.fetch = async () => ({ ok: false, json: async () => ({ message: 'Rejected by server' }) });
    await context.submit_record(7, button);
    assert.equal(messages.pop(), 'Rejected by server');
    assert.equal(refreshes, 1, 'Server rejection does not mark the recording sent');
    context.fetch = async () => ({ ok: true, json: async () => [{}, 400] });
    await context.submit_record(7, button);
    assert.notEqual(messages.pop(), 'تم إرسال التسجيل للمراجعة', 'Legacy malformed response is not success');
    context.fetch = async () => { throw new Error('offline'); };
    await context.submit_record(7, button);
    assert.equal(button.disabled, false);
    const row = [7, '/storage/recordings/test.webm', '/storage/pdfs/test.pdf', 1, 1, '2026-09-29', 'Test'];
    assert.equal(context.normalizeRecording(row).audio, '/storage/recordings/test.webm');
    assert.equal(context.normalizeRecording(row).status, 'approved');
    context.USER_STATUS = 'مرفوض';
    assert.equal(context.normalizeRecording(row).status, 'rejected');
    context.USER_STATUS = 'جار المراجعة';
    assert.equal(context.normalizeRecording(row).status, 'review');
    row[4] = 0;
    assert.equal(context.normalizeRecording(row).status, 'draft');
    assert.ok(!source.includes("r.status = 'review'; refresh();"), 'Click handler must not announce optimistic success');
    console.log('PASS: frontend confirmation, errors, duplicate clicks, audio URL and review labels');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
