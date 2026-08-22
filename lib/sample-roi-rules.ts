export type SampleRoiSettings = {
  analysis_days: number;
  followup_days: number;
  conversion_days: number;
  client_window_days: number;
  min_opportunities: number;
  base_limit: number;
  medium_limit: number;
  low_limit: number;
  medium_conversion_pct: number;
  low_conversion_pct: number;
  medium_roi: number;
  low_roi: number;
};

export const DEFAULT_SAMPLE_ROI_SETTINGS: SampleRoiSettings = {
  analysis_days: 180,
  followup_days: 30,
  conversion_days: 90,
  client_window_days: 30,
  min_opportunities: 5,
  base_limit: 6,
  medium_limit: 4,
  low_limit: 2,
  medium_conversion_pct: 40,
  low_conversion_pct: 20,
  medium_roi: 3,
  low_roi: 1,
};

export function dynamicSampleLimit(
  opportunities: number,
  conversionPct: number,
  roi: number,
  settings: SampleRoiSettings,
) {
  if (opportunities < settings.min_opportunities) return settings.base_limit;
  if (conversionPct < settings.low_conversion_pct || roi < settings.low_roi) return settings.low_limit;
  if (conversionPct < settings.medium_conversion_pct || roi < settings.medium_roi) return settings.medium_limit;
  return settings.base_limit;
}
