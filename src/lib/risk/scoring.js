export function getRiskCategory(totalScore = 0) {
  const score = Number(totalScore) || 0;

  if (score <= 8) return "Conservative";
  if (score <= 12) return "Moderately Conservative";
  if (score <= 16) return "Balanced";
  if (score <= 20) return "Growth";
  return "Aggressive";
}

export function calculateRiskScore(answers = []) {
  const totalScore = answers.reduce((sum, answer) => sum + (Number(answer.score) || 0), 0);

  return {
    totalScore,
    riskCategory: getRiskCategory(totalScore),
  };
}
