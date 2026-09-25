from flask import Blueprint, jsonify, render_template, request

from app.decorators import admin_required, login_required
import app.db as db

messages_bp = Blueprint(
    "messages",
    __name__,
)

