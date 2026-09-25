from flask import Blueprint, redirect, render_template, url_for, g, request, jsonify, make_response

import app.db as db
from app.authen import hash_token, generate_token

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/")
def index():

    if g.user is None:
        return redirect(url_for("auth.login"))

    if g.user["role"] == "user":
        return redirect(url_for("user.dashboard"))

    if g.user["role"] == "admin":
        return redirect(url_for("admin.dashboard"))

    if g.user["role"] == "owner":
        return redirect(url_for("owner.dashboard"))

    return redirect(url_for("auth.login"))



@auth_bp.route("/api/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")
    else:
        data = request.get_json() or {}
        username = data.get('username')
        password = data.get('password')
        db.check_login(username, password)

        if not g.user:
            return jsonify({
                "success": False,
                "message": "اسم المستخدم أو كلمة المرور غير صحيحة"
            }), 401

        raw_token = generate_token()
        token_hash = hash_token(raw_token)

        db.insert_token(g.user["id"], token_hash)

        response_data = jsonify({
            "success": True,
            "redirect_url": url_for(f'{g.user["role"]}.dashboard'),
            "auth_token": raw_token,
        })

        response = make_response(response_data, 200)
        response.set_cookie(
            key="auth_token",
            value=raw_token,
            httponly=True,
            samesite="Lax",
            secure=False,
            max_age=86400 * 30
        )

        return response
