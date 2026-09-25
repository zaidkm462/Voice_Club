from flask import Blueprint, jsonify, render_template

from decorators import owner_required


owner_bp = Blueprint(
    "owner",
    __name__
)


@owner_bp.route("/owner/dashboard")
@owner_required
def dashboard():
    return render_template("/owner/dashboard.html")



@owner_bp.route("/api/owner/admins")
@owner_required
def get_admins():
    return jsonify([])

