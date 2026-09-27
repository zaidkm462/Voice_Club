import os
import random
import traceback

from flask import Blueprint, current_app, jsonify, render_template, request, g

from app.decorators import admin_required, login_required
import app.db as db
from  config import PDF_DIR

pdf_bp = Blueprint(
    "pdfs",
    __name__,
)

@pdf_bp.route('/api/pdfs/get_pdfs', methods=['GET'])
@login_required
def get_pdfs():
    try:
        pdfs = db.get_pdfs()
        print(pdfs)
        return jsonify(pdfs), 200
    except Exception:      
        return jsonify(), 400

@pdf_bp.route('/api/pdfs/upload', methods=['POST'])
@login_required
def upload_pdf():
    name = (request.form.get('name') or '').strip() or 'كتاب بدون اسم'
    f = request.files.get('file')
    if not f or not f.filename:
        print("f, f.f", f, f.filename)
        return jsonify({"error": "لم يتم إرسال أي ملف"}), 400
    if not ('.' in f.filename and f.filename.rsplit('.', 1)[1].lower() in ['pdf']):
        print("only .pdf", name, f.filename)
        return jsonify({"error": "يُسمح بملفات PDF فقط"}), 400

    fname = name + str(random.randint(0, 100)) + ".pdf"
    f.save(os.path.join(current_app.root_path, os.path.join(PDF_DIR, fname)))

    rel = f"/storage/pdfs/"+fname

    pdf_id = db.add_pdf(name, rel)
    return jsonify({"pdf_id": pdf_id}), 201