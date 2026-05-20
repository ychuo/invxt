export interface MoatAssessment {
  intangible_assets: number;
  switching_costs: number;
  network_effects: number;
  cost_advantage: number;
}

export interface Catalyst {
  event: string;
  timeframe: string;
  impact: "高" | "中" | "低";
}

export interface ExecutiveSummary {
  theme_definition: string;
  lifecycle_and_market: string;
  core_links: string;
  top_picks: { company_name: string; ticker: string; rating: string; logic: string }[];
  biggest_mispricing: string;
  key_catalysts: string;
}

export interface ThemeResult {
  theme_name: string;
  category: string;
  summary: string;
  directions: Direction[];
  lifecycle_stage?: string;
  tam_description?: string;
  policy_analysis?: string;
  executive_summary?: ExecutiveSummary;
}

export interface Direction {
  name: string;
  position: string;
  description: string;
}

export interface ChainResult {
  direction: string;
  upstream: string[];
  midstream: string[];
  downstream: string[];
  key_materials: string[];
  key_equipment: string[];
  profit_pool?: string;
  concentration?: string;
  localization_rate?: string;
}

export interface CompanyMapping {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  reasoning: string;
  relevance: string;
  selected_for_deep_research?: boolean;
  selection_reason?: string;
  industry_position?: string;
}

export interface KeyVariable {
  name: string;
  detail: string;
}

export interface RiskItem {
  risk: string;
  detail: string;
  falsifiable_condition?: string;
}

export interface ScoredCompany {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  exposure_score: number;
  revenue_tier: "core" | "important" | "marginal" | "concept";
  market_awareness: "priced_in" | "partially_recognized" | "under_the_radar";
  dimensions: {
    industry_purity: number;
    earnings_elasticity: number;
    expectation_gap: number;
    competitive_moat: number;
    market_awareness: number;
  };
  investment_logic: string;
  investment_rating?: string;
  moat_assessment?: MoatAssessment;
  catalysts?: Catalyst[];
  key_variables: KeyVariable[];
  risks: RiskItem[];
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface AnalysisState {
  task_id: string;
  topic: string;
  market: string;
  status: string;
  current_step: string;
  theme: ThemeResult | null;
  chain: ChainResult[];
  companies: CompanyMapping[];
  scored: ScoredCompany[];
  search: SearchResult[];
  error: string | null;
}

export interface GraphData {
  nodes: { id: string; type: string; data: Record<string, unknown> }[];
  edges: { source: string; target: string; type: string; data?: Record<string, unknown> }[];
}
