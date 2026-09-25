from flask import Blueprint, jsonify, render_template, request, g

from app.decorators import admin_required, login_required
import app.db as db

recordings_bp = Blueprint(
    "recodings",
    __name__,
)

@recordings_bp.route("/api/recordings/submit", methods=["POST"])
@login_required
def submit():
    uid = g.user['id']
    rec_id = request.json["record_id"]
    r = db.submit_record(uid, rec_id)
    if not r: return jsonify({}, 400)
    return jsonify({}, 200)