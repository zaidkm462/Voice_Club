from flask import Blueprint, jsonify, render_template, request
import app.db as db

from app.decorators import owner_required


owner_bp = Blueprint(
    "owner",
    __name__
)


@owner_bp.route("/owner/dashboard")
@owner_required
def dashboard():
    return render_template("owner/dashboard.html", active_section="admins")


@owner_bp.route("/owner/admins", defaults={"section": "admins"})
@owner_bp.route("/owner/contestants", defaults={"section": "contestants"})
@owner_bp.route("/owner/contestants/new", defaults={"section": "create"})
@owner_bp.route("/owner/pdfs", defaults={"section": "pdfs"})
@owner_bp.route("/owner/messages", defaults={"section": "messages"})
@owner_required
def pages(section):
    return render_template("owner/dashboard.html", active_section=section)


@owner_bp.route("/owner/users/<int:user_id>/pdfs")
@owner_required
def user_pdfs_page(user_id):
    user = db.get_user_account(user_id)
    if user is None:
        return "المتسابق غير موجود.", 404
    return render_template("owner/pdfs.html", pdf_user=user,
                           pdf_api=f"/api/admin/users/{user_id}/pdfs", own_files=False)



@owner_bp.route("/api/owner/admins", methods=["GET"])
@owner_required
def get_admins():
    return jsonify({"admins": db.get_admin_accounts()})


@owner_bp.route("/api/owner/admins/<int:admin_id>/demote", methods=["POST"])
@owner_required
def demote_admin(admin_id):
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

    username = data.get("confirmed_username")
    if not isinstance(username, str) or not username.strip() or len(username) > 80:
        return jsonify({
            "error": "confirmation_required",
            "message": "اسم المستخدم مطلوب لتأكيد إزالة الصلاحيات."
        }), 400

    user = db.demote_admin_to_user(admin_id, username)
    if user is None:
        return jsonify({
            "error": "demotion_unavailable",
            "message": "تعذر تغيير الصلاحيات. حدّث القائمة وتأكد من أن الحساب مشرف واسم المستخدم مطابق."
        }), 409

    return jsonify({
        "message": "تمت إزالة صلاحيات المشرف مع الاحتفاظ بالحساب وبياناته.",
        "user": user
    }), 200


@owner_bp.route("/api/owner/users/<int:user_id>/promote", methods=["POST"])
@owner_required
def promote_user(user_id):
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

    username = data.get("confirmed_username")
    if not isinstance(username, str) or not username.strip() or len(username) > 80:
        return jsonify({
            "error": "confirmation_required",
            "message": "اسم المستخدم مطلوب لتأكيد الترقية."
        }), 400

    admin = db.promote_user_to_admin(user_id, username)
    if admin is None:
        return jsonify({
            "error": "promotion_unavailable",
            "message": "تعذرت الترقية. حدّث القائمة وتأكد من أن الحساب متسابق واسم المستخدم مطابق."
        }), 409

    return jsonify({
        "message": "تمت ترقية المتسابق إلى مشرف.",
        "admin": admin
    }), 200
