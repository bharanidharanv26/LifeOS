-- Additive migration 3. Migrations 1 and 2 remain immutable.
CREATE TABLE memory_embeddings (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  dim INTEGER NOT NULL CHECK(dim > 0),
  vector_json TEXT NOT NULL CHECK(json_valid(vector_json)),
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_memory_embeddings_model ON memory_embeddings(model);
