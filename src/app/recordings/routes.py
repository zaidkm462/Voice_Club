import os
import time
import traceback

from flask import Blueprint, jsonify, render_template, request, g

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
    uid = g.user['id']
    rec_id = request.json["record_id"]
    try:
        r = db.submit_record(uid, rec_id)
        if not r: return jsonify({}, 400)
        return jsonify({}, 200)
    except Exception:
        return jsonify({}, 400)

@recordings_bp.route("/api/recordings/delete", methods=["POST"])
@login_required
def delete():
    uid = g.user['id']
    rec_id = request.json["record_id"]
    try:
        r = db.delete_record(uid, rec_id)
        print(r)
        if not r: return jsonify({}, 400)
        return jsonify({}, 200)
    except Exception as e:
        #print(traceback.format_exc())
        return jsonify({}, 400)

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
    except Exception :    
        return jsonify({"ok": False}), 500