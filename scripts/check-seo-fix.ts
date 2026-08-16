import { unauthenticated } from "../app/shopify.server";
import { collectStoreData } from "../app/models/scan.server";
import { generateSeoSuggestions, applySeoFixes } from "../app/models/seoFix.server";

async function main() {
  const shop = process.argv[2] || "devcom-playground.myshopify.com";
  const apply = process.argv.includes("--apply");

  const { admin } = await unauthenticated.admin(shop);
  const storeData = await collectStoreData(admin, (msg) => console.log("...", msg));

  const candidates = storeData.products.missingSeoProducts;
  console.log(`\nFound ${candidates.length} products missing SEO metadata:`);
  console.log(candidates.map((c) => `  - ${c.title} (${c.id})`).join("\n"));

  if (candidates.length === 0) {
    process.exit(0);
  }

  console.log("\nGenerating suggestions...");
  const suggestions = await generateSeoSuggestions(shop, candidates);

  console.log("\n=== Suggestions ===");
  for (const s of suggestions) {
    console.log(`\n${s.title}`);
    console.log(`  SEO title: ${s.suggestedSeoTitle}`);
    console.log(`  SEO description: ${s.suggestedSeoDescription}`);
  }

  if (apply) {
    console.log("\nApplying fixes...");
    const result = await applySeoFixes(
      admin,
      suggestions.map((s) => ({
        id: s.id,
        productTitle: s.title,
        seoTitle: s.suggestedSeoTitle,
        seoDescription: s.suggestedSeoDescription,
      })),
    );
    console.log(`Succeeded: ${result.succeeded.length}, Failed: ${result.failed.length}`);
    if (result.failed.length > 0) {
      console.log(JSON.stringify(result.failed, null, 2));
    }
  } else {
    console.log("\n(dry run — pass --apply to actually write these to the store)");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
