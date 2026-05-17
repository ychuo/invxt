export interface ThemeResult {
  theme_name: string;
  category: string;
  summary: string;
  directions: Direction[];
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
}

export interface CompanyMapping {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  reasoning: string;
  relevance: string;
}

export interface KeyVariable {
  name: string;
  detail: string;
}

export interface RiskItem {
  risk: string;
  detail: string;
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
