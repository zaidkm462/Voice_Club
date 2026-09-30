from pathlib import Path
from uuid import uuid4

from werkzeug.exceptions import RequestEntityTooLarge
from config import PDF_DIR

import sqlite3

from flask import Blueprint, jsonify, render_template, request, g, current_app

import app.db as db
from app.decorators import admin_required
from app.storage.files import remove_unreferenced_media
from app.storage.uploads import upload_private_pdf


admin_bp = Blueprint(
    "admin",
    __name__,
)


@admin_bp.route("/admin/dashboard")
@admin_required
def dashboard():
    return render_template("admin/dashboard.html", active_section="contestants")


@admin_bp.route("/admin/contestants", defaults={"section": "contestants"})
@admin_bp.route("/admin/contestants/new", defaults={"section": "create"})
@admin_bp.route("/admin/pdfs", defaults={"section": "pdfs"})
@admin_bp.route("/admin/messages", defaults={"section": "messages"})
@admin_required
def pages(section):
    return render_template("admin/dashboard.html", active_section=section)


@admin_bp.route("/admin/users/<int:user_id>/pdfs")
@admin_required
def user_pdfs_page(user_id):
    user = db.get_user_account(user_id)
    if user is None:
        return "المتسابق غير موجود.", 404
    return render_template("admin/pdfs.html", pdf_user=user,
                           pdf_api=f"/api/admin/users/{user_id}/pdfs", own_files=False)


@admin_bp.route("/api/admin/users/<int:user_id>/pdfs", methods=["GET", "POST"])
@admin_required
def user_pdfs(user_id):
    if db.get_user_account(user_id) is None:
        return jsonify({"error": "user_not_found", "message": "المتسابق غير موجود."}), 404
    if request.method == "POST":
        return upload_private_pdf(user_id)
    return jsonify({"pdfs": db.get_private_pdfs(user_id), "shared_pdfs": []})


@admin_bp.route("/api/admin/users", methods=["GET"])
@admin_required
def get_users():
    users = db.get_user_accounts()

    return jsonify({
        "users": users,
        "message_recipients": db.get_message_recipients(),
    })


@admin_bp.route("/api/admin/messages/inbox", methods=["GET"])
@admin_required
def get_message_inbox():
    return jsonify({"messages": db.get_messages(g.user["id"])})


@admin_bp.route("/api/admin/users/<int:user_id>", methods=["GET"])
@admin_required
def get_user(user_id):
    user = db.get_user_account(user_id)

    if user is None:
        return jsonify({
            "error": "user_not_found",
            "message": "المتسابق غير موجود."
        }), 404

    submitted_recordings = db.get_submitted_recording(user_id)

    return jsonify({
        "user": user,
        "submitted_recordings": submitted_recordings
    })


@admin_bp.route("/api/admin/users", methods=["POST"])
@admin_required
def create_user():
    if not request.is_json:
        return jsonify({
            "error": "unsupported_media_type",
            "message": "يجب إرسال البيانات بصيغة JSON."
        }), 415

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "invalid_data",
            "message": "البيانات المرسلة غير صالحة."
        }), 400

    full_name = data.get("full_name")
    username = data.get("username")
    password = data.get("password")

    if not all(
        isinstance(value, str)
        for value in (full_name, username, password)
    ):
        return jsonify({
            "error": "missing_fields",
            "message": "الاسم واسم المستخدم وكلمة المرور مطلوبة."
        }), 400

    full_name = full_name.strip()
    username = username.strip()

    if not full_name or not username or not password.strip():
        return jsonify({
            "error": "empty_fields",
            "message": "لا يمكن ترك الحقول فارغة."
        }), 400

    if len(full_name) > 150 or len(username) > 80 or len(password) > 128:
        return jsonify({
            "error": "invalid_length",
            "message": "أحد الحقول يتجاوز الطول المسموح."
        }), 400

    try:
        user = db.create_user_account(full_name, username, password)
    except sqlite3.IntegrityError as error:
        if getattr(error, "sqlite_errorname", "") == "SQLITE_CONSTRAINT_UNIQUE":
            return jsonify({
                "error": "username_taken",
                "message": "اسم المستخدم مستخدم بالفعل."
            }), 409

        raise

    return jsonify({
        "message": "تم إنشاء حساب المتسابق.",
        "user": user
    }), 201


@admin_bp.route(
    "/api/admin/users/<int:user_id>/messages",
    methods=["POST"],
)
@admin_required
def send_user_message(user_id):
    user = db.get_account(user_id)

    if user is None:
        return jsonify({
            "error": "user_not_found",
            "message": "المستلم غير موجود."
        }), 404

    if not request.is_json:
        return jsonify({
            "error": "unsupported_media_type",
            "message": "يجب إرسال البيانات بصيغة JSON."
        }), 415

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "invalid_data",
            "message": "البيانات المرسلة غير صالحة."
        }), 400

    title = data.get("title")
    content = data.get("content")

    if not isinstance(title, str) or not isinstance(content, str):
        return jsonify({
            "error": "missing_fields",
            "message": "عنوان الرسالة ونصها مطلوبان."
        }), 400

    title = title.strip()
    content = content.strip()

    if not title or not content:
        return jsonify({
            "error": "empty_fields",
            "message": "لا يمكن إرسال رسالة فارغة."
        }), 400

    if len(title) > 150 or len(content) > 5000:
        return jsonify({
            "error": "invalid_length",
            "message": "العنوان أو نص الرسالة يتجاوز الطول المسموح."
        }), 400

    message = db.create_user_message(
        sender_id=g.user["id"],
        recipient_id=user_id,
        title=title,
        content=content,
    )

    return jsonify({
        "message": "تم إرسال الرسالة.",
        "data": message
    }), 201


@admin_bp.route("/api/admin/messages", methods=["POST"])
@admin_required
def send_group_message():
    if g.user["role"] not in ("admin", "owner"):
        return jsonify({
            "error": "forbidden",
            "message": "الإرسال الجماعي غير متاح لهذا الحساب."
        }), 403
    if not request.is_json:
        return jsonify({
            "error": "unsupported_media_type",
            "message": "يجب إرسال البيانات بصيغة JSON."
        }), 415

    data = request.get_json(silent=True)
    scope = data.get("recipient_scope") if isinstance(data, dict) else None
    title = data.get("title") if isinstance(data, dict) else None
    content = data.get("content") if isinstance(data, dict) else None
    allowed_scopes = ("owners", "admins", "users") if g.user["role"] == "owner" else ("admins", "users")
    if scope not in allowed_scopes:
        return jsonify({"error": "invalid_recipient_scope", "message": "وجهة الإرسال غير صالحة."}), 400
    if not isinstance(title, str) or not isinstance(content, str):
        return jsonify({"error": "missing_fields", "message": "عنوان الرسالة ونصها مطلوبان."}), 400

    title, content = title.strip(), content.strip()
    if not title or not content:
        return jsonify({"error": "empty_fields", "message": "لا يمكن إرسال رسالة فارغة."}), 400
    if len(title) > 150 or len(content) > 5000:
        return jsonify({"error": "invalid_length", "message": "العنوان أو نص الرسالة يتجاوز الطول المسموح."}), 400

    message = db.create_user_message(
        sender_id=g.user["id"],
        recipient_id=g.user["id"],
        recipient_scope=scope,
        title=title,
        content=content,
    )
    return jsonify({"message": "تم إرسال الرسالة.", "data": message}), 201


@admin_bp.route("/api/admin/pdfs", methods=["GET"])
@admin_required
def get_pdfs():
    return jsonify({
        "pdfs": db.get_shared_pdfs()
    })


@admin_bp.route("/api/admin/pdfs", methods=["POST"])
@admin_required
def upload_shared_pdf():
    max_file_size = 10 * 1024 * 1024

    # Allow extra space for the multipart form fields.
    request.max_content_length = max_file_size + 1024 * 1024

    try:
        name = request.form.get("name", "").strip()
        uploaded_file = request.files.get("file")

        if not name or len(name) > 150:
            return jsonify({
                "error": "invalid_name",
                "message": "اسم النص مطلوب وبحد أقصى 150 حرفاً."
            }), 400

        if uploaded_file is None or not uploaded_file.filename:
            return jsonify({
                "error": "missing_file",
                "message": "يرجى اختيار ملف PDF."
            }), 400

        original_filename = uploaded_file.filename.replace("\\", "/")
        original_filename = original_filename.rsplit("/", 1)[-1]

        if (
            len(original_filename) > 255
            or not original_filename.lower().endswith(".pdf")
        ):
            return jsonify({
                "error": "invalid_file",
                "message": "يرجى اختيار ملف بامتداد PDF واسم صالح."
            }), 400

        content = uploaded_file.read(max_file_size + 1)

    except RequestEntityTooLarge:
        return jsonify({
            "error": "file_too_large",
            "message": "الملف كبير جداً. الحد الأقصى 10 ميغابايت."
        }), 413

    if len(content) > max_file_size:
        return jsonify({
            "error": "file_too_large",
            "message": "الحد الأقصى لحجم الملف 10 ميغابايت."
        }), 413

    if not content.startswith(b"%PDF-"):
        return jsonify({
            "error": "invalid_pdf",
            "message": "الملف لا يحتوي على ترويسة PDF صحيحة."
        }), 400

    stored_filename = f"{uuid4().hex}.pdf"
    directory = Path(PDF_DIR)
    file_path = directory / stored_filename
    file_created = False

    try:
        directory.mkdir(parents=True, exist_ok=True)

        with file_path.open("xb") as destination:
            file_created = True
            destination.write(content)

        pdf = db.create_shared_pdf(
            name=name,
            original_filename=original_filename,
            path=f"/storage/pdfs/{stored_filename}",
            uploaded_by_id=g.user["id"],
        )

    except Exception:
        if file_created:
            file_path.unlink(missing_ok=True)
        raise

    return jsonify({
        "message": "تم رفع النص بنجاح.",
        "pdf": pdf
    }), 201


@admin_bp.route(
    "/api/admin/users/<int:user_id>/decision",
    methods=["POST"],
)
@admin_required
def review_user(user_id):
    if not request.is_json:
        return jsonify({
            "error": "unsupported_media_type",
            "message": "يجب إرسال البيانات بصيغة JSON."
        }), 415

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "invalid_data",
            "message": "البيانات المرسلة غير صالحة."
        }), 400

    status = data.get("status")
    record_id = data.get("record_id")

    if type(record_id) is not int or record_id <= 0:
        return jsonify({
            "error": "invalid_record_id",
            "message": "A positive integer record_id is required."
        }), 400

    if status not in ("approved", "rejected"):
        return jsonify({
            "error": "invalid_status",
            "message": "القرار يجب أن يكون موافقة أو رفضاً."
        }), 400

    user = db.get_user_account(user_id)

    if user is None:
        return jsonify({
            "error": "user_not_found",
            "message": "المتسابق غير موجود."
        }), 404

    updated_user = db.set_record_review_status(record_id, status, user_id)

    if updated_user is None:
        return jsonify({
            "error": "review_unavailable",
            "message": "تعذر حفظ القرار. حدّث التفاصيل وتأكد من وجود تسجيل مرسل."
        }), 409

    return jsonify({
        "message": "تم حفظ قرار المراجعة.",
        "user": updated_user
    }), 200


@admin_bp.route(
    "/api/admin/users/<int:user_id>/deletion-preview",
    methods=["GET"],
)
@admin_required
def preview_user_deletion(user_id):
    summary = db.get_user_deletion_summary(user_id)

    if summary is None:
        return jsonify({
            "error": "user_not_found",
            "message": "المتسابق غير موجود."
        }), 404

    return jsonify(summary), 200


@admin_bp.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    # Deleting an account is separate from marking it rejected.
    if not request.is_json:
        return jsonify({
            "error": "unsupported_media_type",
            "message": "يجب إرسال البيانات بصيغة JSON."
        }), 415

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "invalid_data",
            "message": "البيانات المرسلة غير صالحة."
        }), 400

    confirmed_username = data.get("confirmed_username")

    if not isinstance(confirmed_username, str) or not confirmed_username.strip():
        return jsonify({
            "error": "confirmation_required",
            "message": "اكتب اسم المستخدم لتأكيد الحذف."
        }), 400

    try:
        result = db.delete_user_account(user_id, confirmed_username)
    except ValueError:
        return jsonify({
            "error": "confirmation_mismatch",
            "message": "اسم المستخدم المكتوب لا يطابق الحساب."
        }), 400

    if result is None:
        return jsonify({
            "error": "user_not_found",
            "message": "المتسابق غير موجود."
        }), 404

    # The account is already deleted; report cleanup failures separately.
    cleanup = {"removed": 0, "missing": 0, "retained": 0, "failed": 0}

    for stored_path in result["file_cleanup_candidates"]:
        try:
            outcome = remove_unreferenced_media(stored_path)
            cleanup[outcome] += 1
        except Exception:
            current_app.logger.exception(
                "Media cleanup failed after deleting contestant %s", user_id
            )
            cleanup["failed"] += 1

    message = "تم حذف حساب المتسابق."

    if cleanup["failed"]:
        message += " تعذر تنظيف بعض الملفات وتحتاج إلى مراجعة."

    return jsonify({
        "message": message,
        "deleted_user_id": result["deleted_user_id"],
        "file_cleanup": cleanup
    }), 200
