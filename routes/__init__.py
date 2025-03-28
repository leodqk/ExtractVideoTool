def register_routes(app):
    from routes.main_routes import register_main_routes
    from routes.api_routes import register_api_routes
    from routes.azure_routes import register_azure_routes
    from routes.gemini_routes import register_gemini_routes
    
    register_main_routes(app)
    register_api_routes(app)
    register_azure_routes(app)
    register_gemini_routes(app)
