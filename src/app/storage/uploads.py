from pathlib import Path
from uuid import uuid4
from flask import request, jsonify, g
from werkzeug.exceptions import RequestEntityTooLarge
from config import PDF_DIR
import app.db as db


def upload_private_pdf(owner_user_id):
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

        pdf = db.create_private_pdf(
            name=name,
            original_filename=original_filename,
            path=f"/storage/pdfs/{stored_filename}",
            uploaded_by_id=g.user["id"],
            owner_user_id=owner_user_id,
        )

    except Exception:
        if file_created:
            file_path.unlink(missing_ok=True)
        raise

    return jsonify({
        "message": "تم رفع النص بنجاح.",
        "pdf": pdf
    }), 201
