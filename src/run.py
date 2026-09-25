import os

from flask import send_from_directory, abort

from app import create_app


app = create_app()




@app.route('/storage/<path:filename>')
def serve_storage_file(filename):
    try:
        return send_from_directory(app.config['STORAGE_DIR'], filename)
    except FileNotFoundError:
        abort(404)

if __name__ == '__main__':
    app.run(debug=True)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
