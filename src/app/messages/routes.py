from flask import Blueprint, jsonify, render_template, request

from app.decorators import admin_required, login_required

messages_bp = Blueprint(
    "messages",
    __name__,
)

@messages_bp.route("/messages/get_messages", methods=["POST"])
@login_required
def get_messages():
    return