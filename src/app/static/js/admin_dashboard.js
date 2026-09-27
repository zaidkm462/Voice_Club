document.addEventListener("DOMContentLoaded", () => {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const labels = { unsent: "لم يرسل تسجيل", pending: "جارٍ المراجعة", approved: "تمت الموافقة", rejected: "مرفوض" };
    const colors = { unsent: "secondary", pending: "warning", approved: "success", rejected: "danger" };
    const modal = bootstrap.Modal.getOrCreateInstance($("userDetailsModal"));
    let users = [];
    let page = 1;
    const pageSize = 10;
    let selectedId = null;
    let detailController = null;
    let listController = null;
    let previewUrl = null;
    let pdfListController = null;
    let reviewBusy = false;
    let reviewHasSubmission = false;
    let reviewStatus = null;
    let deletionController = null;
    let deletionPreview = null;
    let deleteBusy = false;
    const show = (id, visible) => $(id).classList.toggle("d-none", !visible);
    const setText = (id, value) => { $(id).textContent = value ?? "—"; };

    function section(name, historyMode = "push") {
        if (!document.getElementById("section-" + name)) name = "contestants";
        const link = document.querySelector('.app-sidebar a[data-section="' + name + '"]');
        if (link && historyMode !== "none" && location.pathname !== new URL(link.href).pathname) {
            history[historyMode === "replace" ? "replaceState" : "pushState"]({ section: name }, "", link.href);
        }
        document.querySelectorAll(".app-sidebar a").forEach((link) => {
            const url = new URL(link.href, location.origin);
            if (url.pathname === location.pathname) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        if (name === "pdfs") loadPdfs();
        document.querySelectorAll(".dashboard-section").forEach((el) => {
            el.classList.toggle("d-none", el.id !== "section-" + name);
        });
        document.querySelectorAll(".app-sidebar a[data-section]").forEach((button) => {
            const active = button.dataset.section === name;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    async function getJson(url, signal) {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
            signal
        });
        if (response.status === 401) throw new Error("انتهت الجلسة أو لم تسجل الدخول. سجّل الدخول ثم أعد المحاولة.");
        if (response.status === 403) throw new Error("لا تملك صلاحية عرض هذه البيانات.");
        if (response.status === 404) throw new Error("المتسابق غير موجود.");
        if (!response.ok) throw new Error("تعذر تحميل البيانات. حاول مرة أخرى.");
        if (!(response.headers.get("content-type") || "").includes("application/json")) {
            throw new Error("استجابة غير متوقعة. تحقق من تسجيل الدخول.");
        }
        return response.json();
    }

    function tableMessage(message) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "text-center text-secondary py-4";
        cell.textContent = message;
        row.append(cell);
        $("usersTableBody").replaceChildren(row);
    }

    function cell(value) {
        const el = document.createElement("td");
        el.textContent = value ?? "—";
        return el;
    }

    function renderUsers() {
        const query = $("userSearch").value.trim().toLocaleLowerCase("ar");
        const status = $("statusFilter").value;
        const filtered = users.filter((user) =>
            (!status || user.status === status) &&
            (String(user.full_name) + " " + String(user.username)).toLocaleLowerCase("ar").includes(query)
        );
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        page = Math.min(page, pages);
        $("usersTableBody").replaceChildren();
        filtered.slice((page - 1) * pageSize, page * pageSize).forEach((user) => {
            const row = document.createElement("tr");
            const statusCell = cell("");
            const badge = document.createElement("span");
            badge.className = "badge text-bg-" + (colors[user.status] || "secondary");
            badge.textContent = labels[user.status] || "غير معروف";
            statusCell.append(badge);
            const actions = cell("");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-sm btn-outline-dark";
            button.textContent = "عرض التفاصيل";
            button.dataset.userId = String(user.id);
            actions.append(button);
            row.append(cell(user.full_name), cell(user.username), statusCell, cell(user.created_at), actions);
            $("usersTableBody").append(row);
        });
        if (!filtered.length) tableMessage(users.length ? "لا توجد نتائج تطابق البحث." : "لا يوجد متسابقون.");
        setText("resultCount", "عدد النتائج: " + filtered.length);
        setText("pageLabel", page + " / " + pages);
        $("previousPage").disabled = page <= 1;
        $("nextPage").disabled = page >= pages;
    }

    function updateSelectors() {
        ["messageRecipient"].forEach((id) => {
            const select = $(id);
            if (!select) return;
            const previous = select.value;
            select.replaceChildren(new Option("اختر متسابقاً", ""));
            users.forEach((user) => select.add(new Option(user.full_name + " — " + user.username, String(user.id))));
            select.value = previous;
        });
    }

    async function loadUsers() {
        listController?.abort();
        const controller = new AbortController();
        listController = controller;
        $("refreshUsersButton").disabled = true;
        $("userSearch").disabled = true;
        $("statusFilter").disabled = true;
        $("previousPage").disabled = true;
        $("nextPage").disabled = true;
        show("usersAlert", false);
        tableMessage("جارٍ تحميل المتسابقين…");
        try {
            const data = await getJson("/api/admin/users", controller.signal);
            if (!Array.isArray(data.users)) throw new Error("تعذر قراءة قائمة المتسابقين.");
            users = data.users;
            setText("totalCount", users.length);
            ["pending", "approved", "unsent"].forEach((status) => {
                setText(status + "Count", users.filter((user) => user.status === status).length);
            });
            updateSelectors();
            renderUsers();
        } catch (error) {
            if (error.name === "AbortError") return;
            users = [];
            updateSelectors();
            ["totalCount", "pendingCount", "approvedCount", "unsentCount"].forEach((id) => setText(id, "—"));
            tableMessage("تعذر عرض القائمة.");
            setText("resultCount", "");
            setText("pageLabel", "");
            setText("usersAlert", error instanceof TypeError ? "تعذر الاتصال. تحقق من الشبكة وأعد المحاولة." : error.message);
            show("usersAlert", true);
        } finally {
            if (listController === controller) {
                $("refreshUsersButton").disabled = false;
                $("userSearch").disabled = false;
                $("statusFilter").disabled = false;
            }
        }
    }

    function resetMedia() {
        const audio = $("detailRecordingAudio");
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        $("detailPdfLink").removeAttribute("href");
        show("detailPdfLink", false);
        show("mediaError", false);
    }

    // Only serve media through this application's storage route.
    function mediaUrl(path) {
        if (typeof path !== "string" || !path.startsWith("/storage/")) return null;
        const url = new URL(path, location.origin);
        return url.origin === location.origin && url.pathname.startsWith("/storage/") ? url.href : null;
    }

    function renderDetails(data) {
        if (!data.user || typeof data.user !== "object") throw new Error("تعذر قراءة تفاصيل المتسابق.");
        const user = data.user;
        $("detailPrivatePdfs").href = "/admin/users/" + user.id + "/pdfs";
        setText("detailFullName", user.full_name);
        setText("detailUsername", user.username);
        setText("detailStatus", labels[user.status] || user.status);
        setText("detailCreatedAt", user.created_at);
        const recording = data.submitted_recording;
        reviewHasSubmission = Boolean(recording);
        reviewStatus = user.status;
        updateReviewButtons();
        show("noSubmittedRecording", !recording);
        show("submittedRecordingDetails", Boolean(recording));
        if (recording) {
            setText("detailPdfName", recording.pdf_name);
            const pdf = mediaUrl(recording.pdf_path);
            const audio = mediaUrl(recording.recording_path);
            if (pdf) {
                $("detailPdfLink").href = pdf;
                show("detailPdfLink", true);
            }
            if (audio) $("detailRecordingAudio").src = audio;
            if (!pdf || !audio) {
                setText("mediaError", "بعض روابط الملفات غير متاحة.");
                show("mediaError", true);
            }
        }
        show("detailsContent", true);
    }

    async function loadUserDetails(id) {
        if (reviewBusy || deleteBusy) return;
        resetDeletion();
        if (!Number.isSafeInteger(id) || id <= 0) return;
        detailController?.abort();
        const controller = new AbortController();
        detailController = controller;
        selectedId = id;
        reviewHasSubmission = false;
        reviewStatus = null;
        updateReviewButtons();
        show("reviewAlert", false);
        resetMedia();
        $("reviewNote").value = "";
        show("detailsContent", false);
        show("detailsError", false);
        show("retryDetails", false);
        show("detailsLoading", true);
        modal.show();
        try {
            const data = await getJson("/api/admin/users/" + id, controller.signal);
            if (controller !== detailController) return;
            renderDetails(data);
        } catch (error) {
            if (error.name === "AbortError" || controller !== detailController) return;
            setText("detailsError", error instanceof TypeError ? "تعذر الاتصال. أعد المحاولة." : error.message);
            show("detailsError", true);
            show("retryDetails", true);
        } finally {
            if (controller === detailController) show("detailsLoading", false);
        }
    }

    function updateReviewButtons() {
        $("approveUserButton").disabled = reviewBusy || deleteBusy || !reviewHasSubmission || reviewStatus === "approved";
        $("rejectUserButton").disabled = reviewBusy || deleteBusy || !reviewHasSubmission || reviewStatus === "rejected";
        $("composeForUser").disabled = reviewBusy || deleteBusy;
        $("deleteUserButton").disabled = reviewBusy || deleteBusy;
        setText("reviewEligibility", reviewBusy
            ? "جارٍ حفظ القرار…"
            : reviewHasSubmission
                ? "يمكنك تغيير القرار لاحقاً. الرفض لا يحذف الحساب أو ملفاته."
                : "يلزم وجود تسجيل مرسل قبل الموافقة أو الرفض.");
    }

    async function saveReview(status) {
        if (reviewBusy || deleteBusy || !reviewHasSubmission || !selectedId || status === reviewStatus) return;
        resetDeletion();
        const contestantName = $("detailFullName").textContent;
        const prompt = status === "approved"
            ? "تأكيد الموافقة على مشاركة " + contestantName + "؟"
            : "تأكيد رفض مشاركة " + contestantName + "؟ سيبقى الحساب وجميع ملفاته.";
        if (!window.confirm(prompt)) return;

        const userId = selectedId;
        reviewBusy = true;
        updateReviewButtons();
        show("reviewAlert", false);
        const alert = $("reviewAlert");
        try {
            const response = await fetch("/api/admin/users/" + userId + "/decision", {
                method: "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ status })
            });
            if (response.status === 401) throw new Error("سجّل الدخول مجدداً لحفظ القرار.");
            if (response.status === 403) throw new Error("لا تملك صلاحية مراجعة المشاركات.");
            if (response.status === 404 || response.status === 409) {
                reviewHasSubmission = false;
                throw new Error("تعذر مراجعة هذا المتسابق. أغلق النافذة وأعد فتح التفاصيل لتحديثها.");
            }
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "تعذر حفظ القرار.");
            if (response.status !== 200 || data.user?.id !== userId || data.user.status !== status) {
                throw new Error("تعذر تأكيد القرار. أعد فتح التفاصيل للتحقق قبل المحاولة مجدداً.");
            }
            reviewStatus = data.user.status;
            setText("detailStatus", labels[reviewStatus] || reviewStatus);
            alert.className = "alert alert-success";
            alert.textContent = status === "approved"
                ? "تمت الموافقة على المشاركة."
                : "تم رفض المشاركة مع الاحتفاظ بالحساب وملفاته.";
            await loadUsers();
        } catch (error) {
            alert.className = "alert alert-danger";
            alert.textContent = error instanceof TypeError || error instanceof SyntaxError
                ? "تعذر تأكيد حفظ القرار. أعد فتح التفاصيل للتحقق قبل إعادة المحاولة."
                : error.message;
        } finally {
            reviewBusy = false;
            updateReviewButtons();
        }
    }
    $("approveUserButton").addEventListener("click", () => saveReview("approved"));
    $("rejectUserButton").addEventListener("click", () => saveReview("rejected"));

    function resetDeletion() {
        deletionController?.abort();
        deletionController = null;
        deletionPreview = null;
        $("deleteUserForm").reset();
        show("deletionPanel", false);
        show("deleteUserForm", false);
        show("deletionError", false);
        show("deletionLoading", false);
        $("deleteUserButton").setAttribute("aria-expanded", "false");
        updateDeletionControls();
    }

    function updateDeletionControls() {
        $("deleteUsernameInput").disabled = deleteBusy;
        $("cancelDeleteButton").disabled = deleteBusy;
        $("confirmDeleteButton").disabled = deleteBusy || !deletionPreview ||
            deletionPreview.user.id !== selectedId ||
            $("deleteUsernameInput").value !== deletionPreview.user.username;
        setText("confirmDeleteButton", deleteBusy ? "جارٍ الحذف…" : "حذف نهائي");
    }

    $("deleteUserButton").addEventListener("click", async () => {
        if (reviewBusy || deleteBusy || !selectedId) return;
        resetDeletion();
        const userId = selectedId;
        const controller = new AbortController();
        deletionController = controller;
        show("deletionPanel", true);
        show("deletionLoading", true);
        $("deleteUserButton").setAttribute("aria-expanded", "true");
        try {
            const data = await getJson("/api/admin/users/" + userId + "/deletion-preview", controller.signal);
            if (controller !== deletionController || selectedId !== userId) return;
            const counts = data.affected_records;
            if (data.user?.id !== userId || typeof data.user.username !== "string" ||
                !data.user.username || !counts ||
                !["private_pdfs", "recordings", "messages", "sessions"].every(
                    (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0
                )) throw new Error("تعذر قراءة معاينة الحذف. أعد فتحها.");
            deletionPreview = data;
            setText("deletionUsername", data.user.username);
            setText("deletePdfCount", counts.private_pdfs);
            setText("deleteRecordingCount", counts.recordings);
            setText("deleteMessageCount", counts.messages);
            setText("deleteSessionCount", counts.sessions);
            show("deleteUserForm", true);
            updateDeletionControls();
            $("deleteUsernameInput").focus();
        } catch (error) {
            if (error.name === "AbortError" || controller !== deletionController) return;
            setText("deletionError", error instanceof TypeError ? "تعذر الاتصال. أعد فتح معاينة الحذف." : error.message);
            show("deletionError", true);
        } finally {
            if (controller === deletionController) show("deletionLoading", false);
        }
    });

    $("deleteUsernameInput").addEventListener("input", updateDeletionControls);
    $("cancelDeleteButton").addEventListener("click", () => {
        if (deleteBusy) return;
        resetDeletion();
        $("deleteUserButton").focus();
    });
    $("deleteUserForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        updateDeletionControls();
        if (reviewBusy || $("confirmDeleteButton").disabled || !event.currentTarget.reportValidity()) return;
        const userId = deletionPreview.user.id;
        const confirmedUsername = $("deleteUsernameInput").value;
        deleteBusy = true;
        updateReviewButtons();
        updateDeletionControls();
        show("deletionError", false);
        show("deletionResult", false);
        let deleted = false;
        try {
            const response = await fetch("/api/admin/users/" + userId, {
                method: "DELETE",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ confirmed_username: confirmedUsername })
            });
            if (response.status === 401) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");
            if (response.status === 403) throw new Error("لا تملك صلاحية حذف المتسابقين.");
            if (response.status === 404) throw new Error("الحساب غير موجود. أغلق التفاصيل وحدّث القائمة.");
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "تعذر حذف الحساب.");
            if (response.status !== 200 || data.deleted_user_id !== userId) {
                throw new Error("تعذر تأكيد الحذف. حدّث القائمة للتحقق قبل إعادة المحاولة.");
            }
            deleted = true;
            const cleanupFailed = !Number.isSafeInteger(data.file_cleanup?.failed) || data.file_cleanup.failed > 0;
            $("deletionResult").className = "alert " + (cleanupFailed ? "alert-warning" : "alert-success");
            setText("deletionResult", cleanupFailed
                ? "تم حذف الحساب، لكن تنظيف بعض الملفات يحتاج إلى مراجعة."
                : "تم حذف حساب المتسابق: " + confirmedUsername);
        } catch (error) {
            // A lost response does not prove that the deletion failed. Never auto-retry.
            deletionPreview = null;
            setText("deletionError", error instanceof TypeError || error instanceof SyntaxError
                ? "تعذر تأكيد النتيجة. أغلق التفاصيل وحدّث القائمة قبل إعادة المحاولة."
                : error.message);
            show("deletionError", true);
        } finally {
            deleteBusy = false;
            updateReviewButtons();
            updateDeletionControls();
        }
        if (deleted) {
            modal.hide();
            selectedId = null;
            section("contestants");
            await loadUsers();
            $("refreshUsersButton").focus();
        }
    });

    $("createUserForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = $("createUserButton");
        if (button.disabled || !form.reportValidity()) return;

        const payload = {
            full_name: $("newFullName").value.trim(),
            username: $("newUsername").value.trim(),
            password: $("newPassword").value
        };
        const alert = $("createUserAlert");
        if (!payload.full_name || !payload.username || !payload.password.trim()) {
            alert.className = "alert alert-danger";
            alert.textContent = "يرجى ملء جميع الحقول.";
            return;
        }

        button.disabled = true;
        button.textContent = "جارٍ إنشاء الحساب…";
        show("createUserAlert", false);
        try {
            const response = await fetch("/api/admin/users", {
                method: "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payload)
            });
            if (response.status === 401) throw new Error("سجّل الدخول ثم أعد المحاولة.");
            if (response.status === 403) throw new Error("لا تملك صلاحية إنشاء الحسابات.");
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "تعذر إنشاء الحساب.");
            if (response.status !== 201 || !data.user) {
                throw new Error("استجابة غير متوقعة. تحقق من قائمة المتسابقين قبل إعادة المحاولة.");
            }

            form.reset();
            $("newPassword").type = "password";
            $("togglePassword").setAttribute("aria-pressed", "false");
            setText("togglePassword", "إظهار");
            alert.className = "alert alert-success";
            alert.textContent = "تم إنشاء حساب المتسابق: " + data.user.username;
            await loadUsers();
        } catch (error) {
            alert.className = "alert alert-danger";
            alert.textContent = error instanceof TypeError || error instanceof SyntaxError
                ? "تعذر تأكيد النتيجة. حدّث قائمة المتسابقين قبل إعادة المحاولة."
                : error.message;
        } finally {
            button.disabled = false;
            button.textContent = "إنشاء الحساب";
        }
    });

    async function loadPdfs() {
        pdfListController?.abort();
        const controller = new AbortController();
        pdfListController = controller;
        $("refreshPdfsButton").disabled = true;
        show("pdfLibraryAlert", false);
        $("pdfLibraryBody").replaceChildren();
        setText("pdfLibraryStatus", "جارٍ تحميل المكتبة…");
        try {
            const data = await getJson("/api/admin/pdfs", controller.signal);
            if (controller !== pdfListController) return;
            if (!Array.isArray(data.pdfs)) throw new Error("تعذر قراءة قائمة الملفات.");
            data.pdfs.forEach((pdf) => {
                const row = document.createElement("tr");
                const action = cell("");
                const url = mediaUrl(pdf.path);
                if (url) {
                    const link = document.createElement("a");
                    link.href = url;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.className = "btn btn-outline-dark btn-sm";
                    link.textContent = "فتح PDF";
                    action.append(link);
                } else {
                    action.textContent = "الرابط غير متاح";
                }
                row.append(cell(pdf.name), cell(pdf.original_filename), cell(pdf.created_at), action);
                $("pdfLibraryBody").append(row);
            });
            setText("pdfLibraryStatus", data.pdfs.length ? "عدد النصوص: " + data.pdfs.length : "لا توجد نصوص مشتركة بعد.");
        } catch (error) {
            if (error.name === "AbortError" || controller !== pdfListController) return;
            setText("pdfLibraryStatus", "");
            setText("pdfLibraryAlert", error instanceof TypeError ? "تعذر الاتصال. أعد المحاولة." : error.message);
            show("pdfLibraryAlert", true);
        } finally {
            if (controller === pdfListController) $("refreshPdfsButton").disabled = false;
        }
    }

    $("uploadPdfForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = $("uploadPdfButton");
        if (button.disabled || !form.reportValidity()) return;
        const name = $("pdfTitle").value.trim();
        const file = $("pdfFile").files[0];
        const alert = $("uploadPdfAlert");
        if (!name || name.length > 150 || !file || !file.name.toLowerCase().endsWith(".pdf")) {
            alert.className = "alert alert-danger";
            alert.textContent = "أدخل اسماً صالحاً واختر ملف PDF.";
            return;
        }
        if (file.size === 0 || file.size > 10 * 1024 * 1024) {
            alert.className = "alert alert-danger";
            alert.textContent = "اختر ملفاً غير فارغ لا يتجاوز 10 ميغابايت.";
            return;
        }
        const body = new FormData();
        body.append("name", name);
        body.append("file", file);
        button.disabled = true;
        button.textContent = "جارٍ الرفع…";
        $("pdfTitle").disabled = true;
        $("pdfFile").disabled = true;
        show("uploadPdfAlert", false);
        try {
            // The browser supplies the multipart Content-Type and boundary.
            const response = await fetch("/api/admin/pdfs", {
                method: "POST",
                headers: { Accept: "application/json" },
                credentials: "same-origin",
                body
            });
            if (response.status === 401) throw new Error("سجّل الدخول ثم أعد المحاولة.");
            if (response.status === 403) throw new Error("لا تملك صلاحية رفع النصوص المشتركة.");
            if (response.status === 413) throw new Error("الملف كبير جداً. الحد الأقصى 10 ميغابايت.");
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "تعذر رفع الملف.");
            if (response.status !== 201 || !data.pdf?.id) {
                throw new Error("تعذر تأكيد الرفع. حدّث المكتبة قبل إعادة المحاولة.");
            }
            form.reset();
            $("pdfFile").setCustomValidity("");
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = null;
            $("pdfPreview").disabled = true;
            setText("pdfSelection", "لم يتم اختيار ملف.");
            alert.className = "alert alert-success";
            alert.textContent = "تم رفع النص: " + data.pdf.name;
            await loadPdfs();
        } catch (error) {
            alert.className = "alert alert-danger";
            alert.textContent = error instanceof TypeError || error instanceof SyntaxError
                ? "تعذر تأكيد الرفع. حدّث المكتبة قبل إعادة المحاولة لتجنب رفع نسخة أخرى."
                : error.message;
        } finally {
            button.disabled = false;
            button.textContent = "رفع النص";
            $("pdfTitle").disabled = false;
            $("pdfFile").disabled = false;
        }
    });
    $("refreshPdfsButton").addEventListener("click", loadPdfs);

    $("sendMessageForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = $("sendMessageButton");
        if (button.disabled || !form.reportValidity()) return;

        const recipientId = Number($("messageRecipient").value);
        const recipientName = $("messageRecipient").selectedOptions[0]?.textContent || "";
        const payload = {
            title: $("messageTitle").value.trim(),
            content: $("messageBody").value.trim()
        };
        const alert = $("sendMessageAlert");
        if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || !payload.title || !payload.content) {
            alert.className = "alert alert-danger";
            alert.textContent = "اختر متسابقاً وأدخل عنوان الرسالة ونصها.";
            return;
        }
        if (payload.title.length > 150 || payload.content.length > 5000) {
            alert.className = "alert alert-danger";
            alert.textContent = "العنوان أو نص الرسالة يتجاوز الطول المسموح.";
            return;
        }

        const fields = [$("messageRecipient"), $("messageTitle"), $("messageBody")];
        fields.forEach((field) => { field.disabled = true; });
        button.disabled = true;
        button.textContent = "جارٍ الإرسال…";
        show("sendMessageAlert", false);

        try {
            const response = await fetch("/api/admin/users/" + recipientId + "/messages", {
                method: "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payload)
            });
            if (response.status === 401) throw new Error("سجّل الدخول ثم أعد المحاولة.");
            if (response.status === 403) throw new Error("لا تملك صلاحية إرسال الرسائل.");
            if (response.status === 404) throw new Error("المتسابق غير موجود. حدّث القائمة واختر المستلم مجدداً.");
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "تعذر إرسال الرسالة.");
            if (response.status !== 201 || !data.data?.id) {
                throw new Error("تعذر تأكيد الإرسال. تحقق من وصول الرسالة قبل إعادة إرسالها.");
            }

            $("messageTitle").value = "";
            $("messageBody").value = "";
            alert.className = "alert alert-success";
            alert.textContent = "تم إرسال الرسالة إلى " + recipientName;
        } catch (error) {
            alert.className = "alert alert-danger";
            alert.textContent = error instanceof TypeError || error instanceof SyntaxError
                ? "تعذر تأكيد الإرسال. تحقق من وصول الرسالة قبل إعادة إرسالها لتجنب التكرار."
                : error.message;
        } finally {
            fields.forEach((field) => { field.disabled = false; });
            button.disabled = false;
            button.textContent = "إرسال الرسالة";
        }
    });

    document.querySelectorAll(".app-sidebar a[data-section]").forEach((button) =>
        button.addEventListener("click", (event) => { event.preventDefault(); section(button.dataset.section); })
    );
    // These forms remain local until their backend operations are implemented.
    document.querySelectorAll("[data-pending-form]").forEach((form) =>
        form.addEventListener("submit", (event) => event.preventDefault())
    );
    $("usersTableBody").addEventListener("click", (event) => {
        const button = event.target.closest("[data-user-id]");
        if (button) loadUserDetails(Number(button.dataset.userId));
    });
    ["userSearch", "statusFilter"].forEach((id) => $(id).addEventListener("input", () => {
        page = 1;
        renderUsers();
    }));
    $("previousPage").addEventListener("click", () => { page--; renderUsers(); });
    $("nextPage").addEventListener("click", () => { page++; renderUsers(); });
    $("refreshUsersButton").addEventListener("click", loadUsers);
    $("retryDetails").addEventListener("click", () => loadUserDetails(selectedId));
    $("userDetailsModal").addEventListener("hide.bs.modal", (event) => {
        if (reviewBusy || deleteBusy) {
            event.preventDefault();
            return;
        }
        detailController?.abort();
        detailController = null;
        resetDeletion();
        resetMedia();
    });
    $("detailRecordingAudio").addEventListener("error", () => {
        if (!$("detailRecordingAudio").hasAttribute("src")) return;
        setText("mediaError", "تعذر تشغيل التسجيل. قد يكون الملف غير متاح.");
        show("mediaError", true);
    });
    $("composeForUser").addEventListener("click", () => {
        $("messageRecipient").value = String(selectedId);
        modal.hide();
        section("messages");
    });
    $("togglePassword").addEventListener("click", () => {
        const visible = $("newPassword").type === "password";
        $("newPassword").type = visible ? "text" : "password";
        $("togglePassword").setAttribute("aria-pressed", String(visible));
        setText("togglePassword", visible ? "إخفاء" : "إظهار");
    });
    $("pdfFile").addEventListener("change", () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        $("pdfPreview").disabled = true;
        const file = $("pdfFile").files[0];
        $("pdfFile").setCustomValidity("");
        if (!file) return setText("pdfSelection", "لم يتم اختيار ملف.");
        if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
            $("pdfFile").setCustomValidity("اختر ملف PDF.");
            return setText("pdfSelection", "يرجى اختيار ملف PDF.");
        }
        previewUrl = URL.createObjectURL(file);
        $("pdfPreview").disabled = false;
        setText("pdfSelection", file.name + " · " + (file.size / 1024 / 1024).toFixed(2) + " MB");
    });
    $("pdfPreview").addEventListener("click", () => {
        if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
    });
    window.addEventListener("pagehide", () => {
        detailController?.abort();
        listController?.abort();
        pdfListController?.abort();
        deletionController?.abort();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        $("detailRecordingAudio").pause();
    });
    window.addEventListener("popstate", () => {
        const link = [...document.querySelectorAll(".app-sidebar a[data-section]")].find((item) => new URL(item.href).pathname === location.pathname);
        section(link?.dataset.section || document.body.dataset.section, "none");
    });
    section(location.hash.slice(1) || document.body.dataset.section || "contestants", "replace");
    loadUsers();
});
