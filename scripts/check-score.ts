import { unauthenticated } from "../app/shopify.server";
import { collectStoreData } from "../app/models/scan.server";
import { computeCategoryScores, computeOverallScore } from "../app/models/scoring.server";

async function main() {
  const shop = process.argv[2] || "devcom-playground.myshopify.com";
  const { admin } = await unauthenticated.admin(shop);

  const storeData = await collectStoreData(admin, (msg) => console.log("...", msg));
  const scores = computeCategoryScores(storeData);
  const overall = computeOverallScore(scores);

  console.log("\n=== Overall score ===");
  console.log(overall === null ? "Not enough data" : `${overall}/100`);

  console.log("\n=== Category scores ===");
  for (const s of scores) {
    console.log(
      `${s.label}: ${s.score === null ? "N/A" : s.score + "/100"} — ${s.insufficientDataReason || s.summary}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
