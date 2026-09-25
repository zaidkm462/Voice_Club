from flask import Blueprint, jsonify, render_template

from decorators import admin_required


admin_bp = Blueprint(
    "admin",
    __name__,
)

@admin_bp.route("/admin/dashboard")
@admin_required
def dashboard():
    return render_template("/admin/dashboard.html")


@admin_bp.route("/api/admin/users")
@admin_required
def get_users():
    return jsonify([])
