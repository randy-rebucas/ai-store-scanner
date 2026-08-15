export const FEATURE_REQUEST_STATUSES = [
  "requested",
  "in_progress",
  "done",
] as const;
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number];
