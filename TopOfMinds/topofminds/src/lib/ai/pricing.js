export function calculateCostUSD({ inputTokens = 0, outputTokens = 0, inputPricePerMTok = 0, outputPricePerMTok = 0 }) {
  const inputCost = (inputTokens / 1_000_000) * inputPricePerMTok;
  const outputCost = (outputTokens / 1_000_000) * outputPricePerMTok;
  return Number((inputCost + outputCost).toFixed(6));
}
