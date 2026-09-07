// Presentation-only state for a bracket just created from canonical runtime
// facts. It intentionally keeps the loaded projection untouched: drawing may
// never reshuffle slots or write bracket state.
export function beginNormalizedBracketDraw(bracket) {
  if (!bracket?.id) throw new Error("추첨을 시작할 normalized bracket id가 없습니다.");
  return {
    bracket,
    openId: bracket.id,
    drawId: bracket.id,
  };
}

export function completeNormalizedBracketDraw() {
  return null;
}
