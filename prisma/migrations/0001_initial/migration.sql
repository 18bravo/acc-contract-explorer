-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "contract_vehicles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agency" TEXT,
    "piid_prefix" TEXT,
    "task_order_count" INTEGER NOT NULL DEFAULT 0,
    "total_obligated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_orders" (
    "id" SERIAL NOT NULL,
    "piid" TEXT NOT NULL,
    "parent_idv_piid" TEXT,
    "vehicle_id" TEXT,
    "vehicle_name" TEXT,
    "vendor_name" TEXT,
    "vendor_uei" TEXT,
    "cage_code" TEXT,
    "award_description" TEXT,
    "product_or_service_description" TEXT,
    "naics_description" TEXT,
    "award_date" TEXT,
    "period_of_performance_start" TEXT,
    "period_of_performance_end" TEXT,
    "obligated_amount" DOUBLE PRECISION,
    "base_and_exercised_value" DOUBLE PRECISION,
    "potential_value" DOUBLE PRECISION,
    "naics_code" TEXT,
    "psc_code" TEXT,
    "awarding_agency" TEXT,
    "funding_agency" TEXT,
    "place_of_performance_state" TEXT,
    "place_of_performance_country" TEXT,
    "last_modified_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_text" tsvector,

    CONSTRAINT "task_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_jobs" (
    "id" SERIAL NOT NULL,
    "query" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "internal_count" INTEGER NOT NULL DEFAULT 0,
    "external_count" INTEGER NOT NULL DEFAULT 0,
    "new_records" INTEGER NOT NULL DEFAULT 0,
    "external_results" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "search_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_items" (
    "id" SERIAL NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "appropriation_type" TEXT NOT NULL,
    "agency" TEXT,
    "service" TEXT,
    "program_element" TEXT,
    "line_item_number" TEXT,
    "program_name" TEXT,
    "prior_year_actual" DECIMAL(15,2),
    "current_year_enacted" DECIMAL(15,2),
    "budget_year_request" DECIMAL(15,2),
    "outyear_1" DECIMAL(15,2),
    "outyear_2" DECIMAL(15,2),
    "outyear_3" DECIMAL(15,2),
    "outyear_4" DECIMAL(15,2),
    "outyear_5" DECIMAL(15,2),
    "source_document_url" TEXT,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_narratives" (
    "id" SERIAL NOT NULL,
    "line_item_id" INTEGER NOT NULL,
    "narrative_type" TEXT,
    "content" TEXT,
    "ai_summary" TEXT,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_narratives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_documents" (
    "id" SERIAL NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "agency" TEXT,
    "document_type" TEXT,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "file_hash" TEXT,
    "local_path" TEXT,
    "crawled_at" TIMESTAMP(3),
    "parsed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,

    CONSTRAINT "budget_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_trends" (
    "id" SERIAL NOT NULL,
    "program_element" TEXT,
    "program_name" TEXT,
    "fiscal_year" INTEGER NOT NULL,
    "agency" TEXT,
    "appropriation_type" TEXT,
    "amount" DECIMAL(15,2),
    "yoy_change_dollars" DECIMAL(15,2),
    "yoy_change_percent" DECIMAL(8,2),
    "five_year_cagr" DECIMAL(8,2),
    "trend_direction" TEXT,

    CONSTRAINT "budget_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contracts" (
    "id" SERIAL NOT NULL,
    "piid" TEXT NOT NULL,
    "parent_idv_piid" TEXT,
    "award_description" TEXT,
    "award_type" TEXT,
    "contract_type" TEXT,
    "award_date" TIMESTAMP(3),
    "period_of_performance_start" TIMESTAMP(3),
    "period_of_performance_end" TIMESTAMP(3),
    "base_value" DECIMAL(15,2),
    "current_value" DECIMAL(15,2),
    "obligated_amount" DECIMAL(15,2),
    "award_ceiling" DECIMAL(15,2),
    "naics_code" TEXT,
    "naics_description" TEXT,
    "psc_code" TEXT,
    "psc_description" TEXT,
    "vendor_name" TEXT,
    "vendor_uei" TEXT,
    "vendor_cage_code" TEXT,
    "contracting_office_id" INTEGER,
    "contracting_office_name" TEXT,
    "awarding_agency" TEXT,
    "awarding_sub_agency" TEXT,
    "funding_agency" TEXT,
    "funding_sub_agency" TEXT,
    "place_of_performance_state" TEXT,
    "place_of_performance_country" TEXT,
    "usaspending_award_id" TEXT,
    "last_modified_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_modifications" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "modification_number" TEXT,
    "action_date" TIMESTAMP(3),
    "action_type" TEXT,
    "description" TEXT,
    "obligated_change" DECIMAL(15,2),
    "obligated_total" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_modifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subawards" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "subaward_number" TEXT,
    "subaward_amount" DECIMAL(15,2),
    "subcontractor_name" TEXT,
    "subcontractor_uei" TEXT,
    "subcontractor_cage_code" TEXT,
    "description" TEXT,
    "action_date" TIMESTAMP(3),
    "place_of_performance_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subawards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_scores" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "cost_growth_pct" DECIMAL(8,2),
    "ceiling_utilization" DECIMAL(8,2),
    "contract_age_days" INTEGER,
    "modification_count" INTEGER,
    "pass_thru_ratio" DECIMAL(8,2),
    "vendor_concentration" INTEGER,
    "duplicate_risk" DECIMAL(8,2),
    "implied_hourly_rate" DECIMAL(10,2),
    "overall_score" DECIMAL(8,2),
    "flag_cost_growth" BOOLEAN NOT NULL DEFAULT false,
    "flag_underutilized" BOOLEAN NOT NULL DEFAULT false,
    "flag_old_contract" BOOLEAN NOT NULL DEFAULT false,
    "flag_high_mods" BOOLEAN NOT NULL DEFAULT false,
    "flag_pass_thru" BOOLEAN NOT NULL DEFAULT false,
    "flag_vendor_conc" BOOLEAN NOT NULL DEFAULT false,
    "flag_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "flag_high_rate" BOOLEAN NOT NULL DEFAULT false,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dod_organizations" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "parent_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dod_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_orders_vehicle_id_idx" ON "task_orders"("vehicle_id");

-- CreateIndex
CREATE INDEX "task_orders_vendor_name_idx" ON "task_orders"("vendor_name");

-- CreateIndex
CREATE INDEX "task_orders_award_date_idx" ON "task_orders"("award_date");

-- CreateIndex
CREATE INDEX "task_orders_piid_idx" ON "task_orders"("piid");

-- CreateIndex
CREATE INDEX "task_orders_obligated_amount_idx" ON "task_orders"("obligated_amount");

-- CreateIndex
CREATE INDEX "budget_line_items_fiscal_year_idx" ON "budget_line_items"("fiscal_year");

-- CreateIndex
CREATE INDEX "budget_line_items_agency_idx" ON "budget_line_items"("agency");

-- CreateIndex
CREATE INDEX "budget_line_items_program_element_idx" ON "budget_line_items"("program_element");

-- CreateIndex
CREATE INDEX "budget_line_items_appropriation_type_idx" ON "budget_line_items"("appropriation_type");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_items_fiscal_year_program_element_line_item_num_key" ON "budget_line_items"("fiscal_year", "program_element", "line_item_number", "agency");

-- CreateIndex
CREATE INDEX "budget_narratives_line_item_id_idx" ON "budget_narratives"("line_item_id");

-- CreateIndex
CREATE INDEX "budget_documents_fiscal_year_idx" ON "budget_documents"("fiscal_year");

-- CreateIndex
CREATE INDEX "budget_documents_status_idx" ON "budget_documents"("status");

-- CreateIndex
CREATE INDEX "budget_documents_agency_idx" ON "budget_documents"("agency");

-- CreateIndex
CREATE INDEX "budget_trends_trend_direction_fiscal_year_idx" ON "budget_trends"("trend_direction", "fiscal_year");

-- CreateIndex
CREATE INDEX "budget_trends_yoy_change_percent_idx" ON "budget_trends"("yoy_change_percent" DESC);

-- CreateIndex
CREATE INDEX "budget_trends_fiscal_year_idx" ON "budget_trends"("fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "budget_trends_program_element_fiscal_year_agency_appropriat_key" ON "budget_trends"("program_element", "fiscal_year", "agency", "appropriation_type");

-- CreateIndex
CREATE UNIQUE INDEX "service_contracts_piid_key" ON "service_contracts"("piid");

-- CreateIndex
CREATE INDEX "service_contracts_vendor_uei_idx" ON "service_contracts"("vendor_uei");

-- CreateIndex
CREATE INDEX "service_contracts_vendor_name_idx" ON "service_contracts"("vendor_name");

-- CreateIndex
CREATE INDEX "service_contracts_naics_code_idx" ON "service_contracts"("naics_code");

-- CreateIndex
CREATE INDEX "service_contracts_psc_code_idx" ON "service_contracts"("psc_code");

-- CreateIndex
CREATE INDEX "service_contracts_awarding_agency_idx" ON "service_contracts"("awarding_agency");

-- CreateIndex
CREATE INDEX "service_contracts_award_date_idx" ON "service_contracts"("award_date");

-- CreateIndex
CREATE INDEX "service_contracts_contracting_office_id_idx" ON "service_contracts"("contracting_office_id");

-- CreateIndex
CREATE INDEX "contract_modifications_contract_id_idx" ON "contract_modifications"("contract_id");

-- CreateIndex
CREATE INDEX "contract_modifications_action_date_idx" ON "contract_modifications"("action_date");

-- CreateIndex
CREATE INDEX "subawards_contract_id_idx" ON "subawards"("contract_id");

-- CreateIndex
CREATE INDEX "subawards_subcontractor_uei_idx" ON "subawards"("subcontractor_uei");

-- CreateIndex
CREATE UNIQUE INDEX "waste_scores_contract_id_key" ON "waste_scores"("contract_id");

-- CreateIndex
CREATE INDEX "waste_scores_overall_score_idx" ON "waste_scores"("overall_score" DESC);

-- CreateIndex
CREATE INDEX "waste_scores_flag_cost_growth_idx" ON "waste_scores"("flag_cost_growth");

-- CreateIndex
CREATE INDEX "waste_scores_flag_pass_thru_idx" ON "waste_scores"("flag_pass_thru");

-- CreateIndex
CREATE UNIQUE INDEX "dod_organizations_code_key" ON "dod_organizations"("code");

-- CreateIndex
CREATE INDEX "dod_organizations_parent_id_idx" ON "dod_organizations"("parent_id");

-- CreateIndex
CREATE INDEX "dod_organizations_level_idx" ON "dod_organizations"("level");

-- AddForeignKey
ALTER TABLE "task_orders" ADD CONSTRAINT "task_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "contract_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_narratives" ADD CONSTRAINT "budget_narratives_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "budget_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_contracting_office_id_fkey" FOREIGN KEY ("contracting_office_id") REFERENCES "dod_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_modifications" ADD CONSTRAINT "contract_modifications_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subawards" ADD CONSTRAINT "subawards_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_scores" ADD CONSTRAINT "waste_scores_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dod_organizations" ADD CONSTRAINT "dod_organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dod_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

