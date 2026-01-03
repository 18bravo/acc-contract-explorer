import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function setupSearch() {
  console.log("Setting up search infrastructure...\n");

  // Step 1: Enable pgvector extension
  console.log("1. Enabling pgvector extension...");
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("   ✓ pgvector extension enabled");
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ pgvector: ${err.message}`);
  }

  // Step 2: Enable pg_trgm for fuzzy text matching
  console.log("2. Enabling pg_trgm extension...");
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    console.log("   ✓ pg_trgm extension enabled");
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ pg_trgm: ${err.message}`);
  }

  // Step 3: Add embedding column if it doesn't exist
  console.log("3. Adding embedding column...");
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE task_orders
      ADD COLUMN IF NOT EXISTS embedding vector(1536);
    `);
    console.log("   ✓ embedding column added");
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ embedding column: ${err.message}`);
  }

  // Step 4: Add search_text column for full-text search
  console.log("4. Adding search_text column...");
  try {
    // First check if column exists
    const columnExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_orders' AND column_name = 'search_text'
      );
    `);

    if (!columnExists[0]?.exists) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE task_orders
        ADD COLUMN search_text tsvector;
      `);
      console.log("   ✓ search_text column added");
    } else {
      console.log("   ✓ search_text column already exists");
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ search_text column: ${err.message}`);
  }

  // Step 5: Populate search_text for existing records
  console.log("5. Populating search_text for existing records...");
  try {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE task_orders
      SET search_text = to_tsvector('english',
        coalesce(piid, '') || ' ' ||
        coalesce(vendor_name, '') || ' ' ||
        coalesce(award_description, '') || ' ' ||
        coalesce(naics_code, '') || ' ' ||
        coalesce(naics_description, '') || ' ' ||
        coalesce(psc_code, '') || ' ' ||
        coalesce(product_or_service_description, '') || ' ' ||
        coalesce(awarding_agency, '') || ' ' ||
        coalesce(funding_agency, '')
      )
      WHERE search_text IS NULL;
    `);
    console.log(`   ✓ Updated ${result} records`);
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ populate search_text: ${err.message}`);
  }

  // Step 6: Create GIN index for full-text search
  console.log("6. Creating full-text search index...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS task_orders_search_idx
      ON task_orders USING gin(search_text);
    `);
    console.log("   ✓ GIN index created");
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ GIN index: ${err.message}`);
  }

  // Step 7: Create trigram index for fuzzy matching on vendor_name
  console.log("7. Creating trigram index for vendor fuzzy search...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS task_orders_vendor_trgm_idx
      ON task_orders USING gin(vendor_name gin_trgm_ops);
    `);
    console.log("   ✓ Trigram index created");
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ Trigram index: ${err.message}`);
  }

  // Step 8: Create vector index (IVFFlat) for semantic search
  console.log("8. Creating vector index for semantic search...");
  try {
    // Check if we have any embeddings first
    const embeddingCount = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM task_orders WHERE embedding IS NOT NULL;
    `);

    if (Number(embeddingCount[0]?.count) > 0) {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS task_orders_embedding_idx
        ON task_orders USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      `);
      console.log("   ✓ Vector index created");
    } else {
      console.log("   ⚠ Skipping vector index (no embeddings yet)");
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`   ⚠ Vector index: ${err.message}`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("SEARCH SETUP COMPLETE");
  console.log("=".repeat(50));

  // Test full-text search
  console.log("\nTesting full-text search...");
  try {
    const testResults = await prisma.$queryRawUnsafe<{ piid: string; vendor_name: string; rank: number }[]>(`
      SELECT piid, vendor_name, ts_rank(search_text, plainto_tsquery('english', 'Lockheed')) as rank
      FROM task_orders
      WHERE search_text @@ plainto_tsquery('english', 'Lockheed')
      ORDER BY rank DESC
      LIMIT 5;
    `);
    console.log(`✓ Full-text search working. Found ${testResults.length} results for "Lockheed":`);
    testResults.forEach(r => console.log(`  - ${r.piid}: ${r.vendor_name}`));
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`✗ Full-text search test failed: ${err.message}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

setupSearch().catch((e) => {
  console.error("Setup failed:", e);
  prisma.$disconnect();
  pool.end();
  process.exit(1);
});
