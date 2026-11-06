import React from "react";
import { Lead, Row } from "./Board.jsx";
import { isNewNotice } from "./seenNotices.js";
import { dotDate, formatDate } from "../../services/dateFormat.js";

/* 공지는 어디서나 한 모양이다: 홈과 공지 목록이 같은 큰 판과 같은 64 행을 쓴다(DESIGN.md "Composing a screen" 11). */
/* 목록의 첫 공지(첫 쪽, 검색 없음)는 홈과 같은 큰 판으로 선다: 날짜가 월과 일의 디스플레이로 켜진다 */
export const NoticeLead=({a,onOpen})=>{
  const d=dotDate(a.date), fresh=isNewNotice(a);
  return <Lead date={d?.day} title={a.title} lamp={fresh&&"새 글"} line={[a.pinned&&"고정",d&&`${d.weekday}요일`].filter(Boolean).join(", ")}
    label={`${a.title}, ${formatDate(a.date)}${fresh?", 새 글":""}`} onClick={onOpen}/>;
};
export const NoticeRow=({a,onOpen})=>{
  const d=dotDate(a.date), fresh=isNewNotice(a);
  return <Row title={a.title} line={<>{a.pinned&&<><b className="nw-pin">고정</b>, </>}{d?<><span className="num">{d.day}</span> {d.weekday}</>:formatDate(a.date)}</>} lamp={fresh&&"새 글"} label={fresh?`${a.title}, ${formatDate(a.date)}, 새 글`:undefined} onClick={onOpen}/>;
};
