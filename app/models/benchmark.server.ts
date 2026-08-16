import prisma from "../db.server";
import type { StoreSnapshot } from "./scan.server";

// Buckets stores by product count so a 20-product store isn't benchmarked
// against a 5000-product one. Bounds are inclusive of the lower end.
const COHORT_BUCKETS = [
  { min: 0, max: 50, label: "0-50 products" },
  { min: 51, max: 200, label: "51-200 products" },
  { min: 201, max: 1000, label: "201-1000 products" },
  { min: 1001, max: Infinity, label: "1000+ products" },
];

function bucketFor(productCount: number) {
  return (
    COHORT_BUCKETS.find((b) => productCount >= b.min && productCount <= b.max) ??
    COHORT_BUCKETS[COHORT_BUCKETS.length - 1]
  );
}

export type BenchmarkMetric = {
  key: string;
  label: string;
  storeValue: number; // as a percentage, 0-100
  cohortAverage: number; // as a percentage, 0-100
  cohortSize: number;
};

// Below this, an average is too noisy/identifying to show responsibly.
const MIN_COHORT_SIZE = 3;

export async function getCohortBenchmark(
  currentShop: string,
  currentStoreData: StoreSnapshot,
): Promise<BenchmarkMetric[]> {
  const bucket = bucketFor(currentStoreData.productCount);

  // Pull the latest completed scan per other shop, cheaply, by scanning
  // recent rows ordered by recency and keeping the first one seen per shop.
  const recentScans = await prisma.storeScan.findMany({
    where: {
      shop: { not: currentShop },
      status: "completed",
      storeData: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { shop: true, storeData: true },
  });

  const latestPerShop = new Map<string, StoreSnapshot>();
  for (const row of recentScans) {
    if (latestPerShop.has(row.shop) || !row.storeData) continue;
    try {
      const data: StoreSnapshot = JSON.parse(row.storeData);
      if (
        data.productCount >= bucket.min &&
        data.productCount <= bucket.max
      ) {
        latestPerShop.set(row.shop, data);
      }
    } catch {
      // skip unparseable rows
    }
  }

  const cohort = Array.from(latestPerShop.values());
  if (cohort.length < MIN_COHORT_SIZE) {
    return [];
  }

  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? (numerator / denominator) * 100 : 0;

  const metrics: Array<{
    key: string;
    label: string;
    storeValue: (d: StoreSnapshot) => number;
  }> = [
    {
      key: "outOfStockRate",
      label: "Out-of-stock rate",
      storeValue: (d) => rate(d.products.outOfStockCount, d.productCount),
    },
    {
      key: "untaggedRate",
      label: "Untagged product rate",
      storeValue: (d) => rate(d.products.untaggedCount, d.productCount),
    },
    {
      key: "unfulfilledRate",
      label: "Unfulfilled order rate (sample)",
      storeValue: (d) => rate(d.orders.unfulfilledCount, d.orders.sampleSize),
    },
    {
      key: "repeatCustomerRate",
      label: "Repeat customer rate (sample)",
      storeValue: (d) =>
        rate(d.customers.repeatCustomerCount, d.customers.sampleSize),
    },
  ];

  return metrics.map((metric) => {
    const cohortValues = cohort.map(metric.storeValue);
    const cohortAverage =
      cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length;

    return {
      key: metric.key,
      label: metric.label,
      storeValue: Math.round(metric.storeValue(currentStoreData) * 10) / 10,
      cohortAverage: Math.round(cohortAverage * 10) / 10,
      cohortSize: cohort.length,
    };
  });
}
