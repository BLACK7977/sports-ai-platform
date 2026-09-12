export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMProvider {
  id: string;
  name: string;
  chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string>;
  chatStream?(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<string>;
}

export interface MatchAnalysisResult {
  matchId: string;
  summary: string;
  keyInsights: string[];
  narrative: string;
}

export interface MatchPredictionResult {
  matchId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  explanation: string;
}

export interface PlayerInsightResult {
  playerId: string;
  strengths: string[];
  weaknesses: string[];
  performanceSummary: string;
  outlook: string;
}
