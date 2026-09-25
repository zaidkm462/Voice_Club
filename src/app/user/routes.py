from flask import Blueprint, jsonify, render_template, g, request

import db
from decorators import login_required


user_bp = Blueprint(
    "user",
    __name__,
)


def role(x):
    roles = {"owner": "مالك", "admin": "آدمن", "user": "مستخدم"}
    return roles[x]
def statu(x):
    status = {'unsent': 'لم يرسل تسجيل', 'pending': 'جار المراجعة', 'approved': 'تمت الموافقة', 'rejected': 'مرفوض'}
    return status[x]

@user_bp.route("/user/dashboard")
@login_required
def dashboard():
    roles = {"owner": "مالك", "admin": "آدمن", "user": "مستخدم"}

    user = {
        "name": g.user["full_name"],
        "role": role(g.user["role"])
    }
    return render_template("/user/dashboard.html", user=user)


@user_bp.route("/api/user/data")
@login_required
def get_data():
    uid = g.user["id"]
    user = {
        "name": g.user["full_name"],
        "role": role(g.user["role"]),
        "messages": db.get_messages(uid),
        "recordings": db.get_recordings(uid),
        "status": statu(g.user["status"])
    }

    return jsonify(user)



