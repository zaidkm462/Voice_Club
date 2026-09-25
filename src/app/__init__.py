from flask import Flask
from app.authen import authenticate



def create_app():
    app = Flask(__name__)

    app.config["SECRET_KEY"] = "change-this-key"


    @app.before_request
    def before_request():
        authenticate()

    from app.auth.routes import auth_bp
    from app.user.routes import user_bp
    from app.admin.routes import admin_bp
    from app.owner.routes import owner_bp
    from app.storage.routes import store_bp
    from app.recordings.routes import recordings_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(owner_bp)
    app.register_blueprint(store_bp)
    app.register_blueprint(recordings_bp)

    return app
