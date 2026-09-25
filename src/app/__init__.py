from flask import Flask
from authen import authenticate



def create_app():
    app = Flask(__name__)

    app.config["SECRET_KEY"] = "change-this-key"


    @app.before_request
    def before_request():
        authenticate()

    from auth.routes import auth_bp
    from user.routes import user_bp
    from admin.routes import admin_bp
    from owner.routes import owner_bp
    from storage.routes import store_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(owner_bp)
    app.register_blueprint(store_bp)

    return app
