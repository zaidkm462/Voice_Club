from flask import Blueprint, jsonify, render_template, send_from_directory, abort

from decorators import admin_required
from src import config

store_bp = Blueprint(
    "storage",
    __name__,
)

@store_bp.route('/storage/<path:filename>')
def serve_storage_file(filename):
    try:
        return send_from_directory(config.STORAGE_DIR, filename)
    except FileNotFoundError:
        abort(404)
