import os
import time
import traceback

from flask import Blueprint, jsonify, render_template, request, g, current_app

from app.decorators import admin_required, login_required
import app.db as db
from config import RECORDING_DIR

recordings_bp = Blueprint(
    "recodings",
    __name__,
)

@recordings_bp.route("/api/recordings/submit", methods=["POST"])
@login_required
def submit():
    if g.user["role"] != "user":
        return jsonify(error="forbidden", message="Only contestants can submit auditions."), 403
    if not request.is_json:
        return jsonify(error="invalid_content_type", message="Send a JSON request."), 415
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or type(data.get("record_id")) is not int or data["record_id"] <= 0:
        return jsonify(error="invalid_record_id", message="A positive integer record_id is required."), 400
    uid = g.user['id']
    rec_id = data["record_id"]
    try:
        db.submit_record(uid, rec_id)
        return jsonify(ok=True, recording_id=rec_id, status="pending"), 200
    except ValueError as error:
        errors = {
            "forbidden": (403, "Only contestants can submit auditions."),
            "not_found": (404, "Recording not found."),
            "missing_audio": (409, "The audio file is missing or empty."),
            "already_submitted": (409, "This recording has already been submitted."),
        }
        code = str(error)
        if code not in errors:
            raise
        status, message = errors[code]
        return jsonify(error=code, message=message), status
    except Exception:
        current_app.logger.exception("Audition submission failed")
        return jsonify(error="submission_failed", message="Unable to submit the audition."), 500

@recordings_bp.route("/api/recordings/delete", methods=["POST"])
@login_required
def delete():
    if not request.is_json:
        return jsonify(error="invalid_content_type", message="Send a JSON request."), 415
    data = request.get_json(silent=True)
    rec_id = data.get("record_id") if isinstance(data, dict) else None
    if type(rec_id) is not int or rec_id <= 0:
        return jsonify(error="invalid_record_id", message="A positive integer record_id is required."), 400
    if not db.delete_record(g.user["id"], rec_id):
        return jsonify(error="delete_unavailable", message="Only unsent or rejected recordings can be deleted."), 409
    return jsonify(ok=True, recording_id=rec_id), 200

@recordings_bp.route('/api/recordings/upload', methods=['POST'])
@login_required
def upload_recording():
    uid = g.user["id"]

    try:
        pdf_id = int(request.form.get('pdf_id', ''))
    except (TypeError, ValueError):
        return jsonify({"error": "pdf_id غير صالح"}), 400

    try:
        duration = int(float(request.form.get('duration', '0') or 0))
    except (TypeError, ValueError):
        duration = 0

    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({"error": "لم يتم إرسال أي ملف صوتي"}), 400
    if not ('.' in f.filename and f.filename.rsplit('.', 1)[1].lower() in {'webm', 'mp3', 'wav', 'ogg', 'm4a', 'mp4'}):
        return jsonify({"error": "صيغة الصوت غير مدعومة"}), 400


    if not db.check_pdf_id(pdf_id): return jsonify({"error": "ملف PDF غير موجود"}), 404

    fname = str(g.user['id']) + '_' + str(int(time.time())) + ".webm"

    f.save(os.path.join(RECORDING_DIR, fname))

    rel = f"/storage/recordings/{fname}"
    try:
        r_id = db.add_record(uid, pdf_id, rel, duration)     
        return jsonify({"ok": True, "recording_id": r_id}), 201
    except ValueError as error:
        if str(error) == "max_records_uploads":
            try:
                os.remove(os.path.join(RECORDING_DIR, fname))
            except OSError:
                current_app.logger.exception("Failed to remove rejected recording file")
            return jsonify({
                "error": "max_records_uploads",
                "message": "لقد تجاوزت عدد التسجيلات المسموح به.",
            }), 409
        raise
    except Exception :    
        return jsonify({"ok": False}), 500
