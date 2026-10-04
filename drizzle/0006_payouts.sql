CREATE TABLE "contractor_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"contractor_id" text NOT NULL,
	"project_id" text,
	"work_order_id" text,
	"bill_id" text,
	"kind" text DEFAULT 'ADVANCE' NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text NOT NULL,
	"mode" text DEFAULT 'UPI' NOT NULL,
	"reference" text,
	"note" text,
	"receipt_url" text,
	"paid_on" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_bill_id_contractor_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."contractor_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;