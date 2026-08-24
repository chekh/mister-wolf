const CONFIDENCE_WEIGHT: Record<string, number> = { high: 1.2, medium: 1.0, low: 0.8 };

export function recencyFactor(updatedAt: string, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(updatedAt).getTime()) / 86_400_000);
  return 1 / (1 + ageDays / 30);
}

export function finalScore(
  obj: { ftsScore: number; importance: number; confidence: string; updatedAt: string },
  now: Date
): number {
  return (
    obj.ftsScore * (1 + obj.importance) * (CONFIDENCE_WEIGHT[obj.confidence] ?? 1.0) * recencyFactor(obj.updatedAt, now)
  );
}
