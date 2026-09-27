from flask import Blueprint, jsonify, render_template, g, request

import app.db as db
from app.decorators import login_required
from app.storage.uploads import upload_private_pdf


user_bp = Blueprint(
    "user",
    __name__,
)


@user_bp.route("/user/pdfs")
@login_required
def pdfs_page():
    return render_template("user/pdfs.html", pdf_user=g.user, pdf_api="/api/user/pdfs", own_files=True)


@user_bp.route("/api/user/pdfs", methods=["GET", "POST"])
@login_required
def own_pdfs():
    if request.method == "POST":
        return upload_private_pdf(g.user["id"])
    return jsonify({"pdfs": db.get_private_pdfs(g.user["id"]), "shared_pdfs": db.get_shared_pdfs()})


def role(x):
    roles = {"owner": "مالك", "admin": "آدمن", "user": "مستخدم"}
    return roles[x]
def statu(x):
    status = {'unsent': 'لم يرسل تسجيل', 'pending': 'جار المراجعة', 'approved': 'تمت الموافقة', 'rejected': 'مرفوض'}
    return status[x]

@user_bp.route("/user/dashboard")
@login_required
def dashboard(active_section="home"):
    roles = {"owner": "مالك", "admin": "آدمن", "user": "مستخدم"}

    user = {
        "name": g.user["full_name"],
        "role": role(g.user["role"])
    }
    return render_template("user/dashboard.html", user=user, active_section=active_section)


@user_bp.route("/user/recordings", defaults={"section": "recs"})
@user_bp.route("/user/messages", defaults={"section": "msgs"})
@login_required
def pages(section):
    return dashboard(active_section=section)


@user_bp.route("/user/record")
@login_required
def record_page():
    return render_template("user/record.html")


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

