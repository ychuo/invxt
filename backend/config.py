from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"

    database_url: str = "postgresql://invxt:password@localhost:5432/invxt"
    redis_url: str = "redis://localhost:6379"

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    embedding_model: str = "BAAI/bge-m3"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
