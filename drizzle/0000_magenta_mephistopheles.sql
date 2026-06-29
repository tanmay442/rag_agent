CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" serial NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_audit_action_check" CHECK ("document_audit"."action" IN ('upload','replace','delete','restore'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"blob" "bytea",
	"deleted_at" timestamp,
	CONSTRAINT "documents_file_name_unique" UNIQUE("file_name")
);
--> statement-breakpoint
CREATE TABLE "ticket_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_audit_action_check" CHECK ("ticket_audit"."action" IN ('create','assign','status_change','note','impersonation','role_change'))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"issue" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"assigned_to" text,
	"notes" text,
	CONSTRAINT "tickets_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin','user'))
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit" ADD CONSTRAINT "document_audit_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_audit" ADD CONSTRAINT "ticket_audit_ticket_id_tickets_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("ticket_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);