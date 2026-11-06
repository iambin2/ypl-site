/* 컴퓨터의 난이도 (2026-11-06). 이름은 프로그램 코드로 만들어진 포켓몬의 진화 순서, 약한 것부터. 폴리곤Z가 지금까지 만들고 잰 컴퓨터
   그대로이고(docs/BATTLE_COMPUTER.md), 아래 둘은 덜 생각하고 더 실수한다. options는 battleCpu.js createCpu에 그대로 간다:
   slack은 최선과 이만큼 가까운 수를 고르게 두는 폭, mistake는 한 턴을 그럴듯한 수 아무것으로나 두는 확률.
   로비(화면)와 워커(컴퓨터)가 함께 읽으므로 무거운 것을 들이지 않는다. 세기는 docs/BATTLE_COMPUTER.md 5장에 잰 대로다: 폴리곤2는 폴리곤Z에 100판 34%, 폴리곤은 폴리곤2에 60판 32%. */
export const LEVELS = {
  porygon: { label: "폴리곤", species: "Porygon", options: { reads: false, rollout: false, budgetMs: 300, slack: 0.6, mistake: 0.3 } },
  porygon2: { label: "폴리곤2", species: "Porygon2", options: { reads: false, budgetMs: 500, slack: 0.35, mistake: 0.18 } },
  porygonz: { label: "폴리곤Z", species: "Porygon-Z", options: {} },
};
export const LEVEL_IDS = Object.keys(LEVELS);
// a battle kept from before the levels (or with an unknown one) is played at the computer's full strength, as it was started
export const DEFAULT_LEVEL = "porygonz";
export const levelOf = id => LEVELS[id] || LEVELS[DEFAULT_LEVEL];
