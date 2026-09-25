from functools import wraps

from flask import g, jsonify, redirect, request, url_for


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):

        if g.user is None:

            if request.path.startswith("/api/"):
                return jsonify({
                    "error": "unauthorized"
                }), 401

            return redirect(url_for("auth.login"))

        return function(*args, **kwargs)

    return wrapper


def admin_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):

        if g.user is None:

            if request.path.startswith("/api/"):
                return jsonify({
                    "error": "unauthorized"
                }), 401

            return redirect(url_for("auth.login"))

        if g.user["role"] not in ("admin", "owner"):
            return jsonify({
                "error": "forbidden"
            }), 403

        return function(*args, **kwargs)

    return wrapper


def owner_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):

        if g.user is None:

            if request.path.startswith("/api/"):
                return jsonify({
                    "error": "unauthorized"
                }), 401

            return redirect(url_for("auth.login"))

        if g.user["role"] != "owner":
            return jsonify({
                "error": "forbidden"
            }), 403

        return function(*args, **kwargs)

    return wrapper
