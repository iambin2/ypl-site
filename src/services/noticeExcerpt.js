/* 목록의 미리보기는 본문의 첫 문장이 뜻을 가질 때만: "1조", "2" 같은 조각은 보이지 않는다. 앞의 기호와 이모지는 뗀다.
   제목을 되풀이하는 첫 줄("제6회 챔피언스 시리즈" 아래의 "6회 챔피언스 시리즈 공지")은 건너뛴다. */
const bare=s=>String(s||"").replace(/공지|안내|제\s*(?=\d)|[^\p{L}\p{N}]/gu,"");
export function excerptOf(body,title=""){
  const t=bare(title);
  const line=String(body||"").split("\n").map(l=>l.replace(/^[^\p{L}\p{N}]+/u,"").trim())
    .find(l=>l&&!(t&&(bare(l).includes(t)||t.includes(bare(l)))))||"";
  return line.length>=12?line:"";
}
