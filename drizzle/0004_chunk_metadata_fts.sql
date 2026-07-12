ALTER TABLE "chunks" ADD COLUMN "page" integer;
--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "chunk_index" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "section" text;
--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "meta" jsonb;
--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "fts" tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED NOT NULL;
--> statement-breakpoint
CREATE INDEX "chunks_page_idx" ON "chunks" USING btree ("page");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY "chunks_fts_idx" ON "chunks" USING gin ("fts");
