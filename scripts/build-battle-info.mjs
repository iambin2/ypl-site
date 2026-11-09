// Builds src/data/battle-info-ko.json, what each move, ability and item does, for the battle screen to say in the games'
// own Korean words. The text is the Korean flavour text of the newest version group that has one, from PokeAPI's CSV dump
// (the data is BSD-3; the text itself is the games'). It is quoted as the games print it, only line breaks joined
// (DESIGN.md, Voice and tone). Only ids the site uses are kept, read from src/data/champions-data.json; an id with no
// Korean text yet is filled from INFO_FILL below where the games' text is known, and otherwise left out and listed.
//
//   node scripts/build-battle-info.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const OUTPUT = new URL("../src/data/battle-info-ko.json", import.meta.url);
const CHAMPIONS = new URL("../src/data/champions-data.json", import.meta.url);

export const toId = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
export const clean = (text) => text.replace(/[\n\r\f\u00ad]/g, " ").replace(/\s+/g, " ").trim();

// Scarlet and Violet print this for a move they dropped; it says nothing about the move, so an older game's text stands.
const UNUSABLE = /^사용할 수 없는 기술입니다/;

// What PokeAPI has no Korean for yet, quoted from the games, used only where PokeAPI has nothing (its text wins once it
// lands). Line breaks are joined like the rest.
// - Abilities: Legends Z-A's own text dump (github.com/CPokemon/plza-text, korean/common/tokuseiinfo.txt, by name; the four
//   Embody Aspects by number, 301 to 304, each naming its mask). Those Z-A lacks are github.com/reidlo5135/PokeSix
//   (src/data/bundled/names.json, "ability-effects", matched to the game text dumps by line) where it agrees word for word
//   with pokemon.fandom.com/ko/wiki/<Korean name> ("9세대 특성 설명", Champions rows included) or, for spicyspray, the
//   pokerogue Korean locale (github.com/pagefaultgames/pokerogue-locales, ko/ability.json); hospitality is the wiki's alone.
// - Moves: Scarlet and Violet's text as quoted by PokeSix ("move-effects"), each checked against the wiki ("기술 설명"),
//   the pokerogue locale (ko/move.json) and op.gg/ko/pokemon-champions/moves. These rest on PokeSix alone: infernalparade,
//   barbbarrage, mountaingale, triplearrows, direclaw, bleakwindstorm, chloroblast, esperwing, lunarblessing, powershift,
//   sandsearstorm, springtidestorm, syrupbomb, victorydance, wildboltstorm. Every other one agrees with at least one source.
// - Items: Legends Z-A's iteminfo.txt, by name (floettite and zygardite have their own wording there, not the Mega stone
//   sentence); auspiciousarmor and maliciousarmor, which Z-A lacks, are the wiki's Scarlet and Violet row ("도구 설명").
export const INFO_FILL = {
  moves: {
    icespinner: "발에 얇은 얼음을 두르고 빙글빙글 회전하며 부딪친다. 회전 운동에 의해 필드가 파괴된다.",
    hardpress: "팔이나 집게로 상대를 압박한다. 상대의 HP가 남아 있을수록 위력이 올라간다.",
    ragingbull: "분노해 날뛰는 성난소의 맹렬한 태클. 폼에 따라 기술의 타입이 달라지고 빛의장막이나 리플렉터 등도 파괴할 수 있다.",
    wavecrash: "물을 두르고 온몸으로 상대에게 부딪친다. 자신도 상당한 데미지를 입는다.",
    alluringvoice: "천사와도 같은 노랫소리로 상대를 공격한다. 그 턴에 능력이 올라간 포켓몬을 혼란 상태로 만든다.",
    infernalparade: "무수히 많은 불덩이로 공격한다. 화상 상태로 만들 때가 있다. 상대가 상태 이상인 경우 위력이 2배가 된다.",
    psychicnoise: "불쾌한 음파를 상대에게 날려서 공격한다. 2턴 동안 상대는 기술이나 특성 또는 지니고 있는 도구로 HP를 회복할 수 없게 된다.",
    chillyreception: "자리를 얼어붙게 만드는 개그를 하고 교대 포켓몬과 교체한다. 5턴 동안 눈을 내리게 한다.",
    barbbarrage: "무수히 많은 독침으로 공격한다. 상대를 독 상태로 만들 때가 있다. 상대가 독 상태인 경우 위력이 2배가 된다.",
    trailblaze: "풀숲에서 튀어나오듯이 공격한다. 경쾌한 발재간으로 자신의 스피드를 올린다.",
    shedtail: "자신의 HP를 깎아서 분신을 만든 뒤, 돌아와서 교대 포켓몬과 교체한다.",
    headlongrush: "온 힘을 다한 몸통박치기를 날린다. 자신의 방어와 특수방어가 떨어진다.",
    supercellslam: "몸에 전기를 두르고 상대를 덮친다. 빗나가면 자신이 데미지를 입는다.",
    aquacutter: "압력을 가한 물을 칼날처럼 분사해서 상대를 베어 가른다. 급소에 맞기 쉽다.",
    ceaselessedge: "조개껍질 검으로 공격한다. 조개껍질 파편은 압정이 되어 상대의 발밑에 흩어진다.",
    bittermalice: "등골이 서늘해지는 원념으로 공격해서 상대의 공격을 떨어뜨린다.",
    mountaingale: "빙산처럼 커다란 얼음덩어리를 부딪쳐서 공격한다. 상대를 풀죽게 만들 때가 있다.",
    triplearrows: "발 기술을 사용하고 3개의 화살을 동시에 발사한다. 상대의 방어를 떨어뜨리거나 풀죽게 만들 때가 있다. 급소에 맞기 쉽다.",
    psyshieldbash: "사념의 에너지를 두른 채로 상대에게 부딪친다. 자신의 방어를 올린다.",
    stoneaxe: "암석 도끼로 공격한다. 흩어진 암석 파편은 상대의 주위에 떠다니게 된다.",
    lastrespects: "동료의 한을 풀어 주기 위해 공격한다. 쓰러진 같은 편 포켓몬이 많을수록 기술의 위력이 올라간다.",
    direclaw: "치명적인 손톱으로 공격한다. 상대를 독, 마비, 잠듦 중 하나의 상태로 만들 때가 있다.",
    flowertrick: "숨겨진 장치가 있는 꽃다발을 상대에게 던져서 공격한다. 반드시 명중하며 급소에 맞는다.",
    torchsong: "활활 타오르는 불꽃을 노래하듯 뿜어서 상대를 태워 버린다. 자신의 특수공격을 올린다.",
    aquastep: "물 흐르듯 민첩하고 경쾌한 발재간으로 상대를 농락하며 데미지를 준다. 자신의 스피드를 올린다.",
    doubleshock: "전신의 전기를 모두 방출해서 큰 데미지를 준다. 자신의 전기타입이 없어진다.",
    revivalblessing: "자애로운 마음으로 기도를 하여 기절한 교대 포켓몬을 HP가 절반인 상태로 부활시킨다.",
    populationbomb: "여기저기서 동료들을 모아서 화려한 콤비네이션으로 공격한다. 1~10회 연속으로 공격한다.",
    tidyup: "압정뿌리기, 스텔스록, 끈적끈적네트, 독압정, 대타출동을 모두 정리한다. 자신의 공격과 스피드가 올라간다.",
    saltcure: "상대를 소금절이 상태로 만들어 매 턴 데미지를 준다. 강철타입이나 물타입에게 더 고통스럽다.",
    armorcannon: "자신의 갑옷을 활활 타오르는 탄환으로 발사해서 공격한다. 자신의 방어와 특수방어가 떨어진다.",
    bitterblade: "현세의 미련을 칼끝에 담아 베어 버린다. 입힌 데미지의 절반에 해당하는 HP를 회복할 수 있다.",
    luminacrash: "정신에도 작용하는 기묘한 빛을 발산해서 공격한다. 상대의 특수방어를 크게 떨어뜨린다.",
    gigatonhammer: "거대한 해머를 온몸으로 휘둘러서 공격한다. 이 기술은 2회 연속으로 쓸 수 없다.",
    jetpunch: "거센 물살을 주먹에 둘러 눈에 보이지 않는 속도로 펀치를 날린다. 반드시 선제공격할 수 있다.",
    ragefist: "분노를 에너지로 바꿔서 공격한다. 받은 공격의 횟수가 많을수록 기술의 위력이 올라간다.",
    twinbeam: "두 눈에서 불가사의한 광선을 발사해서 공격한다. 2회 연속으로 데미지를 준다.",
    kowtowcleave: "머리를 조아려 상대를 방심하게 만든 뒤에 베어 버린다. 공격은 반드시 명중한다.",
    glaiverush: "몸을 내던지는 무모한 돌격. 기술을 사용한 다음, 상대의 공격이 반드시 명중하고 데미지를 2배로 입게 된다.",
    makeitrain: "대량의 코인을 날려서 공격한다. 자신의 특수공격이 떨어진다. 배틀 후에 돈을 받을 수 있다.",
    matchagotcha: "휘저은 차를 대포처럼 발사해 준 데미지의 절반을 HP로 회복한다. 화상 상태로 만들 때도 있다.",
    ficklebeam: "광선을 발사해서 공격한다. 가끔 다른 머리도 협력해서 레이저를 발사하여 위력이 2배가 된다.",
    shelter: "피부를 강철 방패처럼 단단하게 만들어서 자신의 방어를 크게 올린다.",
    electroshot: "1턴째에 전기를 모아서 특수공격을 올리고 2턴째에 고압의 전기를 발사한다. 비가 오는 날씨일 때는 바로 발사할 수 있다.",
    pounce: "상대에게 달려들어 공격한다. 상대의 스피드를 떨어뜨린다.",
    snowscape: "5턴 동안 눈을 내리게 한다. 얼음타입의 방어가 올라간다.",
    axekick: "발꿈치를 들어 올린 뒤 내리찍어 공격한다. 상대를 혼란시킬 때가 있다. 빗나가면 자신이 데미지를 입는다.",
    bleakwindstorm: "심신을 모두 떨게 만드는 차갑고도 거친 바람으로 공격한다. 상대의 스피드를 떨어뜨릴 때가 있다.",
    bloodmoon: "피와 같이 붉은 보름달에서 혼신의 기백을 발사한다. 이 기술은 2회 연속으로 쓸 수 없다.",
    burningbulwark: "상대의 공격을 초고열의 털로 방어하는 동시에 접촉한 상대를 화상 상태로 만든다.",
    chillingwater: "상대의 기운이 빠질 정도로 차가운 물을 끼얹어서 공격한다. 상대의 공격을 떨어뜨린다.",
    chloroblast: "엽록소를 모은 뒤 발사하여 공격한다. 자신도 데미지를 입는다.",
    collisioncourse: "변형하며 거칠게 낙하한 다음 고대의 대폭발을 일으킨다. 약점인 상대에게는 위력이 더욱 올라간다.",
    comeuppance: "기술을 쓰기 전에 마지막으로 받은 기술의 데미지를 늘려서 기술을 쓴 상대에게 돌려준다.",
    doodle: "상대의 본질을 꿰뚫어 보고 베껴서 자신과 같은 편을 상대와 같은 특성으로 바꾼다.",
    dragoncheer: "용의 북돋움으로 사기를 높여서 같은 편의 기술이 급소에 맞기 쉬워진다. 드래곤타입이면 더욱더 사기가 북돋는다.",
    electrodrift: "변형하며 초고속으로 달려서 미지의 전격으로 상대를 관통한다. 약점인 상대에게는 위력이 더욱 올라간다.",
    esperwing: "오라로 강화한 날개로 베어 가른다. 급소에 맞기 쉽다. 자신의 스피드를 올린다.",
    filletaway: "자신의 HP를 깎아서 자신의 공격, 특수공격, 스피드를 크게 올린다.",
    hydrosteam: "펄펄 끓는 물을 기세 좋게 뿜어낸다. 햇살이 강할 때 기술의 위력이 떨어지기는커녕 1.5배가 된다.",
    hyperdrill: "뾰족한 신체 부위를 급속도로 회전시켜 관통한다. 방어나 판별 등도 무시할 수 있다.",
    ivycudgel: "덩굴을 휘감은 방망이로 때린다. 쓰고 있는 가면에 따라 타입이 바뀐다. 급소에 맞기 쉽다.",
    lunarblessing: "초승달에 기도를 하여 자신과 배틀에 나와 있는 같은 편의 HP와 모든 상태를 회복한다.",
    malignantchain: "독으로 된 사슬로 상대를 휘감은 뒤 독소를 흘려보내어 해치운다. 맹독 상태로 만들 때가 있다.",
    mightycleave: "머리에 축적된 빛으로 절단한다. 기술 방어를 무시하고 공격할 수 있다.",
    mysticalpower: "신비한 힘을 방출해서 공격한다. 자신의 특수공격이 올라간다.",
    orderup: "멋들어진 몸놀림으로 공격한다. 입속에 싸리용이 있으면 싸리용의 모습에 따라 능력이 올라간다.",
    powershift: "자신의 공격과 방어를 바꾼다.",
    psyblade: "실체가 없는 칼날로 상대를 베어 가른다. 일렉트릭필드 위에 있을 때 기술의 위력이 1.5배가 된다.",
    ragingfury: "2~3턴 동안 불꽃을 마구 뿜어 대며 난동을 부린다. 난동 부린 뒤에는 혼란에 빠진다.",
    ruination: "파멸적인 재앙에 휩쓸리게 하여 상대의 HP를 절반으로 만든다.",
    sandsearstorm: "뜨겁게 달궈진 모래와 강렬한 바람으로 상대를 둘러싸서 공격한다. 상대를 화상 상태로 만들 때가 있다.",
    silktrap: "실로 함정을 만들어 둘러친다. 상대의 공격을 막음과 동시에 접촉한 상대의 스피드를 떨어뜨린다.",
    spicyextract: "어마어마하게 매운 엑기스를 발사한다. 상대의 공격이 크게 오르고 방어는 크게 떨어진다.",
    spinout: "발에 부하를 걸어 격렬하게 회전하며 데미지를 준다. 자신의 스피드가 크게 떨어진다.",
    springtidestorm: "애증 섞인 강렬한 바람으로 상대를 둘러싸서 공격한다. 상대의 공격을 떨어뜨릴 때가 있다.",
    syrupbomb: "끈적끈적한 물엿을 폭발시킨다. 상대를 물엿범벅 상태로 만들어서 3턴 동안 계속 스피드를 떨어뜨린다.",
    tachyoncutter: "입자로 된 칼날을 연이어 발사해서 2회 연속으로 데미지를 준다. 공격은 반드시 명중한다.",
    takeheart: "기운을 고조시켜서 자신의 상태 이상을 회복하고 특수공격과 특수방어를 올린다.",
    temperflare: "자포자기하는 기세로 공격한다. 앞 턴에서 기술이 빗나갔다면 위력이 배가 된다.",
    terablast: "테라스탈 중이면, 테라스탈타입의 에너지를 방출해서 공격한다. 공격과 특수공격을 비교해서 높은 쪽으로 데미지를 준다.",
    terastarstorm: "결정의 힘을 내리쬐어 적을 없애 버린다. 테라파고스가 스텔라폼일 때 사용하면 모든 상대에게 데미지를 준다.",
    thunderclap: "상대보다 먼저 전격을 퍼붓는다. 상대가 쓴 기술이 공격 기술이 아니면 실패한다.",
    tripledive: "호흡이 척척 맞게 다이빙해서 상대에게 물보라를 끼얹는다. 3회 연속으로 데미지를 준다.",
    upperhand: "움직임에 반응하여 손바닥으로 밀쳐서 상대를 풀죽게 한다. 상대가 쓴 기술이 선제공격 기술이 아니면 실패한다.",
    victorydance: "승리를 부르는 춤을 격렬하게 춘다. 자신의 공격과 방어, 스피드를 올린다.",
    wildboltstorm: "폭풍을 일으키고 뇌운을 불러서 번개와 바람으로 매섭게 공격한다. 상대를 마비 상태로 만들 때가 있다.",
    mortalspin: "회전해서 상대를 공격한다. 조이기, 김밥말이, 씨뿌리기 등의 효과를 날려 버린다. 상대를 독 상태로 만든다.",
  },
  abilities: {
    sharpness: "상대를 베는 기술의 위력이 올라간다.",
    seedsower: "공격을 받으면 필드를 그래스필드로 만든다.",
    purifyingsalt: "깨끗한 소금에 의해 상태 이상이 되지 않는다. 고스트타입 기술의 데미지를 반감시킨다.",
    electromorphosis: "데미지를 받으면 충전 상태가 된다.",
    guarddog: "위협을 받으면 공격이 올라간다. 포켓몬을 교체시키는 기술이나 도구의 효과를 받지 않는다.",
    zerotohero: "지닌 포켓몬으로 돌아오면 마이티폼으로 변한다.",
    eartheater: "땅타입의 기술로 공격받으면 데미지를 받지 않고 회복한다.",
    toxicdebris: "물리 기술로 데미지를 받으면 상대의 발밑에 독압정을 뿌린다.",
    armortail: "머리를 감싸고 있는 수수께끼의 꼬리가 이쪽을 향한 선제 기술을 사용할 수 없게 한다.",
    supremeoverlord: "등장했을 때 지금까지 쓰러진 같은 편의 수가 많을수록 조금씩 공격과 특수공격이 올라간다.",
    thermalexchange: "불꽃타입 기술로 공격받으면 공격이 올라간다. 화상 상태가 되지 않는다.",
    goodasgold: "산화하지 않는 튼튼한 황금몸 덕분에 상대의 변화 기술의 영향을 받지 않는다.",
    angershell: "상대의 공격에 의해 HP가 절반이 되면 화가 나서 방어와 특수방어가 떨어지지만 공격, 특수공격, 스피드가 올라간다.",
    beadsofruin: "재앙을 부르는 곡옥의 힘으로 자신을 제외한 모든 포켓몬의 특수방어를 약하게 만든다.",
    commander: "등장했을 때 같은 편에 어써러셔가 있으면 입속에 들어가 안에서 지시를 내린다.",
    costar: "등장했을 때 같은 편의 능력 변화를 복사한다.",
    cudchew: "한 번에 한하여 나무열매를 먹으면 다음 턴이 끝날 때 위에서 꺼내서 또 먹는다.",
    dragonize: "노말타입의 기술이 드래곤타입이 된다. 위력이 조금 올라간다.",
    eelevate: "땅타입의 기술로 공격받지 않는다. 상대를 기절시켰을 때 자신의 가장 높은 능력이 올라간다.",
    embodyaspectcornerstone: "마음속에 깃든 추억의 힘으로 주춧돌의가면을 빛나게 하여 자신의 방어를 올린다.",
    embodyaspecthearthflame: "마음속에 깃든 추억의 힘으로 화덕의가면을 빛나게 하여 자신의 공격을 올린다.",
    embodyaspectteal: "마음속에 깃든 추억의 힘으로 벽록의가면을 빛나게 하여 자신의 스피드를 올린다.",
    embodyaspectwellspring: "마음속에 깃든 추억의 힘으로 우물의가면을 빛나게 하여 자신의 특수방어를 올린다.",
    hadronengine: "등장했을 때 일렉트릭필드를 전개한다. 일렉트릭필드일 때 미래 기관에 의해 특수공격이 강화된다.",
    lingeringaroma: "상대가 접촉하면 가시지 않는 향기가 상대에게 배어 버린다.",
    megasol: "기술을 사용할 때 쾌청 상태일 때와 동일한 효과를 얻는다.",
    mindseye: "노말타입과 격투타입 기술을 고스트타입에게 맞힐 수 있다. 상대의 회피율 변화를 무시하고 명중률도 떨어지지 않는다.",
    myceliummight: "변화 기술을 사용할 때 반드시 행동이 느려지지만 상대 특성에 방해받지 않는다.",
    opportunist: "상대의 능력이 올라가면 자신도 편승해서 똑같이 능력을 올린다.",
    orichalcumpulse: "등장했을 때 날씨를 맑음으로 만든다. 햇살이 강하면 고대의 고동에 의해 공격이 강화된다.",
    piercingdrill: "접촉 기술을 사용할 때 상대의 방어 효과를 무시하고 본래 데미지의 1/4만큼 데미지를 준다. 상대의 방어 효과 이외에는 발동된다.",
    poisonpuppeteer: "복숭악동의 기술에 의해 독 상태가 된 상대는 혼란 상태도 되어 버린다.",
    protosynthesis: "부스트에너지를 지니고 있거나 날씨가 맑을 때 가장 높은 능력이 올라간다.",
    quarkdrive: "부스트에너지를 지니고 있거나 일렉트릭필드일 때 가장 높은 능력이 올라간다.",
    rockypayload: "바위타입 기술의 위력이 올라간다.",
    spicyspray: "기술로 데미지를 입으면 상대를 화상 상태로 만든다.",
    supersweetsyrup: "처음 등장했을 때 감미로운 꿀의 향기를 흩뿌려서 상대의 회피율을 떨어뜨린다.",
    swordofruin: "재앙을 부르는 검의 힘으로 자신을 제외한 모든 포켓몬의 방어를 약하게 만든다.",
    tabletsofruin: "재앙을 부르는 목간의 힘으로 자신을 제외한 모든 포켓몬의 공격을 약하게 만든다.",
    teraformzero: "테라파고스가 스텔라폼이 되었을 때 숨겨진 힘에 의해 날씨와 필드의 영향을 모두 무효로 만든다.",
    terashell: "모든 타입의 힘이 담긴 등껍질이 HP가 꽉 찼을 때 받는 데미지를 모두 효과가 별로이게 만든다.",
    terashift: "등장했을 때 주위의 에너지를 흡수하여 테라스탈폼으로 변화한다.",
    toxicchain: "독소를 머금은 사슬의 힘으로 기술에 맞은 상대를 맹독 상태로 만들 때가 있다.",
    vesselofruin: "재앙을 부르는 그릇의 힘으로 자신을 제외한 모든 포켓몬의 특수공격을 약하게 만든다.",
    wellbakedbody: "불꽃타입 기술로 공격받으면 데미지를 받지 않고 방어가 크게 올라간다.",
    windpower: "바람 기술을 받으면 충전 상태가 된다.",
    windrider: "순풍이 불거나 바람 기술로 공격받으면 데미지를 받지 않고 공격이 올라간다.",
    hospitality: "등장했을 때 같은 편을 대접해서 HP를 조금 회복시킨다.",
  },
  items: {
    abilityshield: "귀엽고 개성적인 방패. 지니게 하면 상대에 의해 특성이 바뀌지 않는다.",
    adamantcrystal: "눈부시게 빛나는 큰 구슬. 디아루가에게 지니게 하면 힘이 넘쳐서 모습이 바뀐다.",
    auspiciousarmor: "어느 특정 포켓몬을 진화시키는 이상한 갑옷. 축복의 감정이 담겨 있다.",
    boosterenergy: "에너지가 가득한 캡슐. 어떤 특성을 가진 포켓몬에게 지니게 하면 그 힘을 증폭시킨다.",
    clearamulet: "투명하고 빛나는 참. 지니게 하면 상대의 기술이나 특성으로 능력이 떨어지지 않는다.",
    cornerstonemask: "결정이 장식되어 있는 목각 가면. 오거폰에게 지니게 하면 바위타입을 두르고 싸울 수 있다.",
    covertcloak: "상대의 눈을 속이는 후드 달린 망토. 지니게 하면 몸을 숨겨서 기술의 추가 효과를 받지 않게 된다.",
    griseouscore: "눈부시게 빛나는 큰 구슬. 기라티나에게 지니게 하면 힘이 넘쳐서 모습이 바뀐다.",
    hearthflamemask: "결정이 장식되어 있는 목각 가면. 오거폰에게 지니게 하면 불꽃타입을 두르고 싸울 수 있다.",
    loadeddice: "좋은 눈만 나오는 주사위. 지니게 하고 연속 기술을 사용하면 많은 횟수로 기술을 사용할 수 있다.",
    lustrousglobe: "눈부시게 빛나는 큰 구슬. 펄기아에게 지니게 하면 힘이 넘쳐서 모습이 바뀐다.",
    maliciousarmor: "어느 특정 포켓몬을 진화시키는 이상한 갑옷. 저주의 감정이 담겨 있다.",
    masterpieceteacup: "어느 특정 포켓몬을 진화시키는 이상한 찻잔. 이가 빠졌지만 차는 맛있어진다.",
    metalalloy: "어느 특정 포켓몬을 진화시키는 이상한 금속. 여러 겹으로 겹쳐져 있다.",
    mirrorherb: "지니게 한 포켓몬은 한 번에 한해 상대의 능력이 올랐을 때 흉내 내어 똑같이 능력을 올린다.",
    punchingglove: "주먹을 보호하는 글러브. 지니게 하면 펀치 기술의 위력이 오르고 상대에게 접촉하지 않는 펀치가 된다.",
    syrupyapple: "어느 특정 포켓몬을 진화시키는 이상한 사과. 엄청나게 꿀맛이다.",
    unremarkableteacup: "어느 특정 포켓몬을 진화시키는 이상한 찻잔. 깨졌지만 차는 맛있어진다.",
    wellspringmask: "결정이 장식되어 있는 목각 가면. 오거폰에게 지니게 하면 물타입을 두르고 싸울 수 있다.",
    floettite: "특별한 플라엣테에게 지니게 하면 배틀할 때 메가진화할 수 있는 신비한 메가스톤의 일종.",
    zygardite: "지가르데에게 지니게 하면 배틀할 때 퍼펙트폼 상태에서 메가진화할 수 있는 신비한 메가스톤의 일종.",
    fairyfeather: "빛에 비추면 희미하게 빛나는 깃털. 지니게 하면 페어리타입 기술의 위력이 올라간다.",
  },
};

// Mega stones PokeAPI does not know yet take the sentence every Mega stone prints, PokeAPI's and Legends Z-A's alike
// (garchompite, lucarionite, charizarditex; Z-A's new clefablite, victreebelite, chesnaughtite), with the Pokémon's
// Korean name in it. The Pokémon is the one whose Mega form requires the stone (champions-data.json pokedex). Crucibellite
// is left out: Crucibelle is a Create-A-Pokémon, in no game.
export const MEGA_STONE_FILL = ["raichunitex", "raichunitey", "clefablite", "victreebelite", "starminite", "dragoninite", "meganiumite",
  "feraligite", "chimechite", "absolitez", "staraptite", "garchompitez", "lucarionitez", "froslassite", "emboarite", "scraftinite",
  "eelektrossite", "chandelurite", "golurkite", "chesnaughtite", "delphoxite", "greninjite", "pyroarite", "meowsticite", "malamarite",
  "barbaracite", "dragalgite", "hawluchanite", "crabominite", "golisopite", "drampanite", "falinksite", "scovillainite", "glimmoranite",
  "baxcalibrite", "skarmorite", "excadrite", "scolipite", "darkranite", "heatranite", "magearnite", "tatsugirinite", "zeraorite"];
export const megaStoneText = (name) => `${name}에게 지니게 하면 배틀할 때 메가진화할 수 있는 신비한 메가스톤의 일종.`;

export function megaStoneFill(data) {
  const holder = {};
  for (const entry of Object.values(data.pokedex)) for (const item of [entry.requiredItem, ...(entry.requiredItems || [])]) if (item) holder[toId(item)] = entry.baseSpecies;
  const num = Object.fromEntries(Object.values(data.pokedex).map((entry) => [entry.name, entry.num]));
  return Object.fromEntries(MEGA_STONE_FILL.map((id) => {
    const name = data.speciesNames?.koreanById?.[num[holder[id]]];
    if (!name) throw new Error(`no Pokémon for ${id}`);
    return [id, megaStoneText(name)];
  }));
}

// RFC 4180: quoted fields may hold commas, line breaks and doubled quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((cells) => Object.fromEntries(head.map((key, k) => [key, cells[k] ?? ""])));
}

async function csv(name) {
  const response = await fetch(`${BASE}/${name}.csv`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${name}.csv: ${response.status}`);
  return parseCsv(await response.text());
}

async function main() {
  const [languages, versionGroups] = await Promise.all([csv("languages"), csv("version_groups")]);
  const ko = languages.find((row) => row.identifier === "ko")?.id;
  const en = languages.find((row) => row.identifier === "en")?.id;
  if (!ko || !en) throw new Error("no ko or en language in languages.csv");
  const order = new Map(versionGroups.map((row) => [row.id, Number(row.order)]));

  const data = JSON.parse(readFileSync(CHAMPIONS, "utf8"));
  const wanted = {
    moves: Object.keys(data.moves),
    abilities: [...new Set(Object.values(data.pokedex).flatMap((entry) => Object.values(entry.abilities || {})).map(toId))],
    items: Object.keys(data.items),
  };
  const sources = { moves: "move", abilities: "ability", items: "item" };
  const fill = { ...INFO_FILL, items: { ...INFO_FILL.items, ...megaStoneFill(data) } };

  const out = {};
  for (const [kind, one] of Object.entries(sources)) {
    const key = `${one}_id`;
    const [things, names, flavours] = await Promise.all([csv(kind), csv(`${one}_names`), csv(`${one}_flavor_text`)]);
    // Showdown follows the current English name, which can drift from PokeAPI's identifier (vice-grip is Vise Grip,
    // stick is Leek), so a thing answers to both.
    const idsOf = new Map(things.map((row) => [row.id, new Set([toId(row.identifier)])]));
    for (const row of names) if (row.local_language_id === en) idsOf.get(row[key])?.add(toId(row.name));
    const best = new Map(); // showdown id -> [version group order, text]
    for (const row of flavours) {
      if (row.language_id !== ko) continue;
      const text = clean(row.flavor_text);
      if (UNUSABLE.test(text)) continue;
      const rank = order.get(row.version_group_id) ?? Number(row.version_group_id);
      for (const id of idsOf.get(row[key]) || []) if (text && !(best.get(id)?.[0] >= rank)) best.set(id, [rank, text]);
    }
    const filled = wanted[kind].filter((id) => !best.has(id) && fill[kind][id]);
    for (const id of filled) best.set(id, [0, fill[kind][id]]);
    const found = wanted[kind].filter((id) => best.has(id)).sort();
    const missing = wanted[kind].filter((id) => !best.has(id)).sort();
    out[kind] = Object.fromEntries(found.map((id) => [id, best.get(id)[1]]));
    console.log(`${kind}: ${found.length} found (${filled.length} from INFO_FILL), ${missing.length} missing${missing.length ? `: ${missing.join(", ")}` : ""}`);
  }

  const json = `${JSON.stringify(out, null, 0)}\n`;
  writeFileSync(OUTPUT, json);
  console.log(`${fileURLToPath(OUTPUT)}: ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
