import { z } from 'zod';

export const BacktestStatsSchema = z.object({
  total_return_pct: z.number().optional().nullable(),
  cagr_pct: z.number().optional().nullable(),
  max_drawdown_pct: z.number().optional().nullable(),
  sharpe: z.number().optional().nullable(),
  sharpe_ratio: z.number().optional().nullable(),
  sortino: z.number().optional().nullable(),
  sortino_ratio: z.number().optional().nullable(),
  win_rate: z.number().optional().nullable(),
  win_rate_pct: z.number().optional().nullable(),
  profit_factor: z.number().optional().nullable(),
  avg_win_pct: z.number().optional().nullable(),
  avg_loss_pct: z.number().optional().nullable(),
  avg_win_avg_loss: z.number().optional().nullable(),
  expectancy_pct: z.number().optional().nullable(),
  avg_holding_days: z.number().optional().nullable(),
  exposure_pct: z.number().optional().nullable(),
  trades: z.number().optional().nullable(),
  trades_count: z.number().optional().nullable(),
});

export type BacktestStats = z.infer<typeof BacktestStatsSchema>;

export const EquityCurvePointSchema = z.object({
  t: z.string().optional(),
  date: z.string().optional(),
  strategy: z.number(),
  benchmark: z.number(),
  is_out_of_sample: z.boolean().optional(),
});

export const DrawdownPointSchema = z.object({
  t: z.string().optional(),
  date: z.string().optional(),
  drawdown_pct: z.number(),
});

export const BacktestTradeSchema = z.object({
  trade_id: z.string().optional(),
  symbol: z.string().optional(),
  side: z.string().optional(),
  t_open: z.string().optional(),
  p_open: z.number().optional(),
  t_close: z.string().optional(),
  p_close: z.number().optional(),
  pnl: z.number().optional(),
  pnl_pct: z.number().optional(),
  r_multiple: z.number().optional().nullable(),
  holding_days: z.number().optional(),
  exit_reason: z.string().optional(),
});

export const BacktestResultSchema = z.object({
  symbol: z.string().optional(),
  strategy: z.string().optional(),
  total_trades: z.number().optional(),
  low_trades_warning: z.boolean().optional(),
  warning_banner: z.string().optional().nullable(),
  is_stats: BacktestStatsSchema.optional().nullable(),
  oos_stats: BacktestStatsSchema.optional().nullable(),
  bench_stats: BacktestStatsSchema.optional().nullable(),
  metrics: z
    .object({
      all: BacktestStatsSchema.optional(),
      in_sample: BacktestStatsSchema.optional(),
      out_of_sample: BacktestStatsSchema.optional(),
      benchmark: BacktestStatsSchema.optional(),
    })
    .optional(),
  equity_curve: z.array(EquityCurvePointSchema).optional(),
  drawdown_series: z.array(DrawdownPointSchema).optional(),
  drawdown_curve: z.array(DrawdownPointSchema).optional(),
  trades: z.array(BacktestTradeSchema).optional(),
});

export type BacktestResult = z.infer<typeof BacktestResultSchema>;
