import psycopg2
from pgvector.psycopg2 import register_vector
from backend.config import settings


class VectorStore:
    def __init__(self):
        self._conn = psycopg2.connect(settings.database_url)
        register_vector(self._conn)
        self._init_db()

    def _init_db(self):
        with self._conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS embeddings (
                    id SERIAL PRIMARY KEY,
                    entity_name TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    text_content TEXT NOT NULL,
                    embedding vector(1024),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS embedding_idx ON embeddings
                USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
            """)
        self._conn.commit()

    def insert(self, entity_name: str, entity_type: str, text_content: str,
               embedding: list[float], metadata: dict | None = None):
        with self._conn.cursor() as cur:
            cur.execute(
                """INSERT INTO embeddings (entity_name, entity_type, text_content, embedding, metadata)
                   VALUES (%s, %s, %s, %s, %s)""",
                (entity_name, entity_type, text_content, embedding, metadata or {}),
            )
        self._conn.commit()

    def search(self, query_embedding: list[float], entity_type: str | None = None,
               limit: int = 10) -> list[dict]:
        with self._conn.cursor() as cur:
            if entity_type:
                cur.execute(
                    """SELECT entity_name, entity_type, text_content, metadata,
                              1 - (embedding <=> %s) AS similarity
                       FROM embeddings WHERE entity_type = %s
                       ORDER BY embedding <=> %s LIMIT %s""",
                    (query_embedding, entity_type, query_embedding, limit),
                )
            else:
                cur.execute(
                    """SELECT entity_name, entity_type, text_content, metadata,
                              1 - (embedding <=> %s) AS similarity
                       FROM embeddings ORDER BY embedding <=> %s LIMIT %s""",
                    (query_embedding, query_embedding, limit),
                )
            return [
                {
                    "entity_name": row[0],
                    "entity_type": row[1],
                    "text_content": row[2],
                    "metadata": row[3],
                    "similarity": row[4],
                }
                for row in cur.fetchall()
            ]

    def close(self):
        self._conn.close()
