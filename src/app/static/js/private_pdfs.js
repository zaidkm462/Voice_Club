document.addEventListener("DOMContentLoaded", () => {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const endpoint = $("pdfPage").dataset.api;
    let busy = false;
    let controller;
    async function json(response) {
        if (response.status === 401) throw new Error("سجّل الدخول مجدداً.");
        if (response.status === 403) throw new Error("لا تملك صلاحية الوصول.");
        if (response.status === 413) throw new Error("الحد الأقصى 10 ميغابايت.");
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "تعذر إتمام الطلب.");
        return data;
    }
    async function refresh() {
        controller?.abort();
        const current = new AbortController();
        controller = current;
        $("privatePdfRefresh").disabled = true;
        $("privatePdfRows").replaceChildren();
        $("privatePdfStatus").textContent = "جارٍ التحميل…";
        try {
            const data = await json(await fetch(endpoint, { credentials: "same-origin", signal: current.signal }));
            if (controller !== current) return;
            if (!Array.isArray(data.pdfs) || !Array.isArray(data.shared_pdfs)) throw new Error("استجابة غير متوقعة.");
            for (const [items, label] of [[data.pdfs, "خاص"], [data.shared_pdfs, "مشترك"]]) {
                items.forEach((pdf) => {
                    const row = document.createElement("tr");
                    [pdf.name, label, pdf.created_at].forEach((value) => {
                        const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
                    });
                    const cell = document.createElement("td");
                    if (typeof pdf.path === "string" && pdf.path.startsWith("/storage/pdfs/")) {
                        const url = new URL(pdf.path, location.origin);
                        if (url.origin === location.origin && url.pathname.startsWith("/storage/pdfs/")) {
                            const link = document.createElement("a");
                            link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
                            link.textContent = "فتح PDF"; cell.append(link);
                        }
                    }
                    row.append(cell); $("privatePdfRows").append(row);
                });
            }
            $("privatePdfStatus").textContent = data.pdfs.length + data.shared_pdfs.length ? "" : "لا توجد ملفات بعد.";
        } catch (error) {
            if (error.name !== "AbortError" && controller === current) $("privatePdfStatus").textContent = "تعذر تحميل الملفات. " + error.message;
        } finally {
            if (controller === current) $("privatePdfRefresh").disabled = false;
        }
    }
    $("privatePdfForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy || !event.currentTarget.reportValidity()) return;
        const name = $("privatePdfName").value.trim();
        const file = $("privatePdfFile").files[0];
        const alert = $("privatePdfAlert");
        alert.className = "alert alert-danger mt-3";
        if (!name || !file || !file.name.toLowerCase().endsWith(".pdf") || !file.size || file.size > 10 * 1024 * 1024) {
            alert.textContent = "أدخل اسماً واختر ملف PDF غير فارغ لا يتجاوز 10 ميغابايت."; return;
        }
        const body = new FormData(); body.append("name", name); body.append("file", file);
        busy = true;
        ["privatePdfSubmit", "privatePdfName", "privatePdfFile"].forEach((id) => { $(id).disabled = true; });
        alert.className = "alert d-none";
        try {
            const data = await json(await fetch(endpoint, { method: "POST", credentials: "same-origin", body }));
            if (!data.pdf?.id) throw new Error("تعذر تأكيد الرفع.");
            $("privatePdfForm").reset();
            alert.className = "alert alert-success mt-3"; alert.textContent = "تم رفع الملف.";
            await refresh();
        } catch (error) {
            alert.className = "alert alert-danger mt-3";
            alert.textContent = error instanceof TypeError || error instanceof SyntaxError
                ? "تعذر تأكيد الرفع. حدّث القائمة قبل إعادة المحاولة لتجنب التكرار." : error.message;
        } finally {
            busy = false;
            ["privatePdfSubmit", "privatePdfName", "privatePdfFile"].forEach((id) => { $(id).disabled = false; });
        }
    });
    $("privatePdfRefresh").addEventListener("click", refresh);
    window.addEventListener("pagehide", () => controller?.abort());
    refresh();
});
