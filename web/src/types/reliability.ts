import { z } from 'zod';

export const ReliabilityCheckSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['pass', 'warn', 'fail']),
  badge: z.string(),
  detail: z.string(),
  hide_color: z.boolean().optional(),
});

export const RatingBucketSchema = z.object({
  rating: z.string(),
  count: z.number(),
  avg_return_10d: z.number(),
  hit_rate: z.number(),
  ci_margin: z.number(),
  expectancy: z.number(),
  profit_factor: z.number(),
});

export const AgreementCellSchema = z.object({
  category: z.string(),
  signals_count: z.number(),
  avg_return: z.number(),
});

export const EquityCurvePointSchema = z.object({
  date: z.string(),
  agent_equity: z.number(),
  rules_equity: z.number(),
  benchmark_equity: z.number(),
});

export const ReliabilitySummarySchema = z.object({
  mode: z.string(),
  sample_size: z.number(),
  passed_checks: z.number(),
  total_checks: z.number(),
  overall_status: z.enum(['pass', 'warn', 'fail']),
  overall_verdict: z.string(),
  hide_colors: z.boolean(),
  checks: z.array(ReliabilityCheckSchema),
  rating_buckets: z.array(RatingBucketSchema),
  equity_curve: z.array(EquityCurvePointSchema),
  agreement_matrix: z.array(AgreementCellSchema),
  disclaimer: z.string(),
});

export type ReliabilitySummary = z.infer<typeof ReliabilitySummarySchema>;

export const SignalOutcomeSchema = z.object({
  entry_date: z.string().optional().nullable(),
  entry_price: z.number().optional().nullable(),
  slippage_bps: z.number().optional().nullable(),
  forward_return_1d: z.number().optional().nullable(),
  forward_return_5d: z.number().optional().nullable(),
  forward_return_10d: z.number().optional().nullable(),
  forward_return_20d: z.number().optional().nullable(),
  alpha_vs_spy_10d: z.number().optional().nullable(),
  mfe_pct: z.number().optional().nullable(),
  mae_pct: z.number().optional().nullable(),
  bracket_result: z.string().optional().nullable(),
  status: z.string().optional(),
});

export const SignalLedgerItemSchema = z.object({
  signal_id: z.string(),
  run_id: z.string(),
  symbol: z.string(),
  as_of_date: z.string(),
  created_at: z.string(),
  rating: z.string(),
  strategy: z.string(),
  analysts: z.array(z.string()),
  debate_rounds: z.number(),
  risk_rounds: z.number(),
  llm_provider: z.string(),
  llm_models: z.record(z.string(), z.any()),
  temperature: z.number(),
  tradingagents_version: z.string(),
  config_hash: z.string(),
  data_vendors: z.array(z.string()),
  mode: z.enum(['live', 'replay']),
  last_close: z.number(),
  token_cost: z.number(),
  report_path: z.string().optional().nullable(),
  invalidated: z.number(),
  invalidated_reason: z.string().optional().nullable(),
  outcome: SignalOutcomeSchema.optional().nullable(),
});

export type SignalLedgerItem = z.infer<typeof SignalLedgerItemSchema>;
