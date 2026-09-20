import React, { lazy, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { bracketRouteSearch, readInitialAppView } from "./services/appRouting.js";
import { loadSiteData, saveSiteData } from "./services/siteDataService.js";
import HomePage from "./pages/HomePage.jsx";
import { SiteHeader, SiteFooter, NAV_ITEMS, SiteDialogHost, useExitAnimation } from "./components/index.js";
import { BrandMark } from "./components/layout/SiteHeader.jsx";
import AdminModeBar from "./admin/AdminModeBar.jsx";
import LazyContent from "./components/common/LazyContent.jsx";

const AboutPage = lazy(() => import("./pages/AboutPage.jsx"));
const BoardPage = lazy(() => import("./pages/BoardPage.jsx"));
const BracketsPage = lazy(() => import("./pages/BracketsPage.jsx"));
const ChampionsPage = lazy(() => import("./pages/ChampionsPage.jsx"));
const NewsPage = lazy(() => import("./pages/NewsPage.jsx"));
const RecordsPage = lazy(() => import("./pages/RecordsPage.jsx"));
const TeamBuilderPage = lazy(() => import("./pages/TeamBuilderPage.jsx"));
const TitlesPage = lazy(() => import("./pages/TitlesPage.jsx"));
const AdminModalHost = lazy(() => import("./admin/AdminModalHost.jsx"));

/* =========================================================================
   YPL — Yonsei Pokemon League  v5 (미니멀 리디자인 / 남색 포인트)
   방문자 조회, 관리자 편집, window.storage(shared) 영구저장
   ========================================================================= */
const uid = () => Math.random().toString(36).slice(2, 9);

/* (로고 이미지 제거됨) */
/* (로고 이미지 제거됨) */
/* (로고 이미지 제거됨) */
const IMPORTED = {"rankings": [{"key": "era2", "label": "YPL", "rows": [{"name": "정두호", "win": 3, "ru": 5, "top4": 0, "points": 370}, {"name": "이종우", "win": 2, "ru": 2, "top4": 3, "points": 190}, {"name": "김현민", "win": 2, "ru": 3, "top4": 0, "points": 170}, {"name": "이준영", "win": 1, "ru": 0, "top4": 3, "points": 120}, {"name": "김원의", "win": 2, "ru": 0, "top4": 1, "points": 95}, {"name": "이제빈", "win": 1, "ru": 0, "top4": 6, "points": 90}, {"name": "허진욱", "win": 0, "ru": 0, "top4": 4, "points": 50}, {"name": "임소동", "win": 2, "ru": 0, "top4": 0, "points": 45}, {"name": "천승은", "win": 0, "ru": 1, "top4": 0, "points": 40}, {"name": "송하준", "win": 1, "ru": 0, "top4": 1, "points": 40}, {"name": "이병재", "win": 0, "ru": 1, "top4": 0, "points": 40}, {"name": "정재현", "win": 1, "ru": 0, "top4": 0, "points": 30}, {"name": "선동연", "win": 1, "ru": 0, "top4": 0, "points": 25}, {"name": "이종찬", "win": 1, "ru": 0, "top4": 0, "points": 25}, {"name": "이상준", "win": 0, "ru": 0, "top4": 1, "points": 20}, {"name": "김채운", "win": 1, "ru": 0, "top4": 0, "points": 20}, {"name": "성기성", "win": 1, "ru": 0, "top4": 0, "points": 20}, {"name": "신동헌", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "조윤호", "win": 0, "ru": 0, "top4": 1, "points": 20}, {"name": "김장현", "win": 0, "ru": 0, "top4": 1, "points": 20}, {"name": "구태욱", "win": 0, "ru": 0, "top4": 1, "points": 20}, {"name": "이재원", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "김무현", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "김태건", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "김인구", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "손우진", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "김유진", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "강고균", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "이진우", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "이원준", "win": 0, "ru": 0, "top4": 0, "points": 0}, {"name": "김호연", "win": 0, "ru": 0, "top4": 0, "points": 0}]}, {"key": "era1", "label": "클래식", "rows": [{"name": "정두호", "win": 4, "ru": 2, "top4": 6, "points": 290}, {"name": "허진욱", "win": 4, "ru": 0, "top4": 4, "points": 205}, {"name": "이종우", "win": 3, "ru": 2, "top4": 5, "points": 200}, {"name": "이제빈", "win": 2, "ru": 2, "top4": 5, "points": 190}, {"name": "임준하", "win": 2, "ru": 3, "top4": 1, "points": 155}, {"name": "이준영", "win": 1, "ru": 5, "top4": 2, "points": 150}, {"name": "이병재", "win": 2, "ru": 1, "top4": 4, "points": 140}, {"name": "김철수", "win": 1, "ru": 1, "top4": 4, "points": 105}, {"name": "김다온", "win": 2, "ru": 0, "top4": 0, "points": 100}, {"name": "원석호", "win": 1, "ru": 1, "top4": 2, "points": 90}, {"name": "김현민", "win": 1, "ru": 1, "top4": 2, "points": 90}, {"name": "김진헌", "win": 2, "ru": 0, "top4": 4, "points": 90}, {"name": "김지승", "win": 1, "ru": 1, "top4": 1, "points": 80}, {"name": "김원의", "win": 0, "ru": 2, "top4": 4, "points": 80}, {"name": "송수아", "win": 2, "ru": 0, "top4": 0, "points": 70}, {"name": "김장현", "win": 2, "ru": 0, "top4": 1, "points": 70}, {"name": "조윤호", "win": 1, "ru": 0, "top4": 1, "points": 60}, {"name": "경재우", "win": 1, "ru": 0, "top4": 1, "points": 50}, {"name": "김한빈", "win": 0, "ru": 2, "top4": 0, "points": 40}, {"name": "신동헌", "win": 0, "ru": 1, "top4": 1, "points": 30}, {"name": "이상우", "win": 0, "ru": 2, "top4": 0, "points": 30}, {"name": "최재혁", "win": 0, "ru": 1, "top4": 4, "points": 30}, {"name": "이동하", "win": 0, "ru": 1, "top4": 1, "points": 25}, {"name": "박상준", "win": 1, "ru": 0, "top4": 0, "points": 20}, {"name": "한수호", "win": 0, "ru": 0, "top4": 2, "points": 20}, {"name": "이시우", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "이원준", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "정재현", "win": 0, "ru": 0, "top4": 2, "points": 20}, {"name": "이동하", "win": 0, "ru": 1, "top4": 1, "points": 20}, {"name": "서경표", "win": 1, "ru": 0, "top4": 0, "points": 15}, {"name": "남현모", "win": 0, "ru": 1, "top4": 1, "points": 15}, {"name": "송원준", "win": 1, "ru": 0, "top4": 0, "points": 10}, {"name": "이재원", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "류지오", "win": 0, "ru": 0, "top4": 0, "points": 0}, {"name": "김다연", "win": 0, "ru": 1, "top4": 0, "points": 0}, {"name": "조형준", "win": 0, "ru": 1, "top4": 0, "points": 0}, {"name": "김주윤", "win": 0, "ru": 1, "top4": 0, "points": 0}, {"name": "천승은", "win": 0, "ru": 0, "top4": 1, "points": 0}, {"name": "윤태희", "win": 0, "ru": 0, "top4": 1, "points": 0}, {"name": "송하준", "win": 0, "ru": 0, "top4": 0, "points": 0}]}], "seasons": [{"name": "클래식 시즌 1", "rows": [{"name": "이제빈", "win": 1, "ru": 1, "top4": 2, "points": 90}, {"name": "정두호", "win": 1, "ru": 1, "top4": 0, "points": 70}, {"name": "허진욱", "win": 1, "ru": 0, "top4": 2, "points": 70}, {"name": "이종우", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "이병재", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "김다온", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "김한빈", "win": 0, "ru": 2, "top4": 0, "points": 40}, {"name": "신동헌", "win": 0, "ru": 1, "top4": 1, "points": 30}, {"name": "김원의", "win": 0, "ru": 0, "top4": 3, "points": 30}, {"name": "김철수", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "한수호", "win": 0, "ru": 0, "top4": 2, "points": 20}, {"name": "원석호", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "김현민", "win": 0, "ru": 0, "top4": 1, "points": 10}]}, {"name": "클래식 시즌 2", "rows": [{"name": "임준하", "win": 1, "ru": 2, "top4": 1, "points": 100}, {"name": "원석호", "win": 1, "ru": 1, "top4": 1, "points": 80}, {"name": "이병재", "win": 1, "ru": 0, "top4": 2, "points": 70}, {"name": "김철수", "win": 1, "ru": 0, "top4": 1, "points": 60}, {"name": "김다온", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "김지승", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "이종우", "win": 0, "ru": 1, "top4": 2, "points": 40}, {"name": "이제빈", "win": 0, "ru": 1, "top4": 1, "points": 30}, {"name": "김원의", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "정두호", "win": 0, "ru": 0, "top4": 2, "points": 20}, {"name": "허진욱", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "이준영", "win": 0, "ru": 0, "top4": 1, "points": 10}]}, {"name": "클래식 시즌 3", "rows": [{"name": "이준영", "win": 1, "ru": 3, "top4": 0, "points": 100}, {"name": "정두호", "win": 1, "ru": 0, "top4": 2, "points": 70}, {"name": "임준하", "win": 1, "ru": 1, "top4": 0, "points": 55}, {"name": "허진욱", "win": 1, "ru": 0, "top4": 1, "points": 55}, {"name": "김현민", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "송수아", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "김진헌", "win": 1, "ru": 0, "top4": 2, "points": 30}, {"name": "이상우", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "이종우", "win": 1, "ru": 0, "top4": 1, "points": 20}, {"name": "서경표", "win": 1, "ru": 0, "top4": 0, "points": 15}, {"name": "김철수", "win": 0, "ru": 0, "top4": 2, "points": 15}, {"name": "이병재", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "정재현", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "이재원", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "김장현", "win": 1, "ru": 0, "top4": 0, "points": 10}, {"name": "송원준", "win": 1, "ru": 0, "top4": 0, "points": 10}, {"name": "이동하", "win": 0, "ru": 0, "top4": 1, "points": 5}, {"name": "남현모", "win": 0, "ru": 0, "top4": 1, "points": 5}]}, {"name": "클래식 시즌 4", "rows": [{"name": "김장현", "win": 1, "ru": 0, "top4": 1, "points": 60}, {"name": "김진헌", "win": 1, "ru": 0, "top4": 1, "points": 60}, {"name": "정두호", "win": 1, "ru": 0, "top4": 1, "points": 50}, {"name": "경재우", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "조윤호", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "최재혁", "win": 0, "ru": 0, "top4": 4, "points": 30}, {"name": "허진욱", "win": 1, "ru": 0, "top4": 0, "points": 20}, {"name": "이준영", "win": 0, "ru": 1, "top4": 1, "points": 20}, {"name": "이시우", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "송수아", "win": 1, "ru": 0, "top4": 0, "points": 20}, {"name": "박상준", "win": 1, "ru": 0, "top4": 0, "points": 20}, {"name": "김현민", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "김지승", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "이원준", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "이동하", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "이종우", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "이상우", "win": 0, "ru": 1, "top4": 0, "points": 10}, {"name": "남현모", "win": 0, "ru": 1, "top4": 0, "points": 10}]}, {"name": "YPL 시즌 1", "rows": [{"name": "김현민", "win": 1, "ru": 0, "top4": 0, "points": 30}, {"name": "정재현", "win": 1, "ru": 0, "top4": 0, "points": 30}, {"name": "이종우", "win": 1, "ru": 1, "top4": 0, "points": 20}, {"name": "신동헌", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "이제빈", "win": 2, "ru": 0, "top4": 1, "points": 10}, {"name": "이재원", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "허진욱", "win": 2, "ru": 0, "top4": 1, "points": 10}, {"name": "김원의", "win": 1, "ru": 0, "top4": 1, "points": 10}]}, {"name": "YPL 시즌 2", "rows": [{"name": "정두호", "win": 1, "ru": 0, "top4": 0, "points": 60}, {"name": "김현민", "win": 0, "ru": 1, "top4": 0, "points": 40}, {"name": "이상준", "win": 0, "ru": 0, "top4": 1, "points": 20}, {"name": "이제빈", "win": 0, "ru": 0, "top4": 1, "points": 20}, {"name": "김원의", "win": 0, "ru": 0, "top4": 0, "points": 25}, {"name": "선동연", "win": 0, "ru": 0, "top4": 0, "points": 25}, {"name": "임소동", "win": 0, "ru": 0, "top4": 0, "points": 25}, {"name": "이종찬", "win": 0, "ru": 0, "top4": 0, "points": 25}, {"name": "이종우", "win": 0, "ru": 0, "top4": 0, "points": 10}, {"name": "김유진", "win": 0, "ru": 0, "top4": 0, "points": 10}, {"name": "강고균", "win": 0, "ru": 0, "top4": 0, "points": 10}, {"name": "이진우", "win": 0, "ru": 0, "top4": 0, "points": 10}]}], "tournaments": [{"key": "pycup", "label": "클래식 파이컵", "color": "#9FB3C8", "rounds": [{"date": "2023.05", "round": "1", "win": "김다온", "ru": "김한빈", "sf": ["이제빈", "허진욱"], "rule": "랜덤 배틀"}, {"date": "2023.06", "round": "2", "win": "정두호", "ru": "이제빈", "sf": ["김원의", "허진욱"], "rule": "NPC 배틀 1"}, {"date": "2023.07", "round": "3", "win": "이제빈", "ru": "김한빈", "sf": ["한수호", "김원의"], "rule": "4세대 NPC컵"}, {"date": "2023.08", "round": "4", "win": "허진욱", "ru": "정두호", "sf": ["김현민", "원석호"], "rule": "로또 배틀"}, {"date": "2023.09", "round": "5", "win": "이병재", "ru": "김철수", "sf": ["신동헌", "한수호"], "rule": "NPC 배틀 2"}, {"date": "2023.10", "round": "6", "win": "이종우", "ru": "신동헌", "sf": ["이제빈", "김원의"], "rule": "드래프트"}, {"date": "2023.11", "round": "1시즌 챔피언스 시리즈", "win": "정두호", "ru": "이종우", "sf": ["이병재", "이제빈"], "rule": ""}, {"date": "2023.11", "round": "7", "win": "김다온", "ru": "임준하", "sf": ["정두호", "이병재"], "rule": "NPC 배틀 3"}, {"date": "2023.12", "round": "8", "win": "이병재", "ru": "이제빈", "sf": ["이종우", "원석호"], "rule": "스위치 63배틀"}, {"date": "2024.01", "round": "9", "win": "임준하", "ru": "원석호", "sf": ["김철수", "이제빈"], "rule": "미션 배틀"}, {"date": "2024.02", "round": "10", "win": "김철수", "ru": "김원의", "sf": ["이병재", "정두호"], "rule": "VGC 2023"}, {"date": "2024.03", "round": "11", "win": "원석호", "ru": "임준하", "sf": ["허진욱", "이종우"], "rule": "NPC 배틀 4"}, {"date": "2024.04", "round": "12", "win": "김지승", "ru": "이종우", "sf": ["이준영", "임준하"], "rule": "6세대 배틀"}, {"date": "2024.04", "round": "2시즌 챔피언스 시리즈", "win": "이종우", "ru": "김원의", "sf": ["김지승", "김철수"], "rule": ""}, {"date": "2024.05", "round": "13", "win": "김현민", "ru": "이준영", "sf": ["정두호", "이병재"], "rule": "LC컵"}, {"date": "2024.06", "round": "14", "win": "정두호", "ru": "이준영", "sf": ["정재현", "김진헌"], "rule": "최애, 빌리겠습니다."}, {"date": "2024.07", "round": "15", "win": "임준하", "ru": "이준영", "sf": ["허진욱", "김철수"], "rule": "멀티 배틀"}, {"date": "2024.07", "round": "", "win": "서경표", "ru": "이재원", "sf": ["이동하", "남현모"], "rule": "멀티 배틀"}, {"date": "2024.08", "round": "16", "win": "허진욱", "ru": "임준하", "sf": ["정두호", "이종우"], "rule": "초전설전"}, {"date": "2024.09", "round": "17", "win": "이준영", "ru": "이상우", "sf": ["김철수", "김진헌"], "rule": "5세대 NPC컵"}, {"date": "2024.10", "round": "18", "win": "송수아", "ru": "이병재", "sf": [], "rule": "리그전"}, {"date": "2024.10", "round": "", "win": "이종우", "ru": "김다연", "sf": [], "rule": ""}, {"date": "2024.10", "round": "", "win": "김진헌", "ru": "조형준", "sf": [], "rule": ""}, {"date": "2024.10", "round": "", "win": "김장현", "ru": "김주윤", "sf": [], "rule": ""}, {"date": "2024.10", "round": "", "win": "송원준", "ru": "최재혁", "sf": [], "rule": ""}, {"date": "2024.11", "round": "3시즌 챔피언스 시리즈", "win": "허진욱", "ru": "이준영", "sf": ["정두호", "김현민"], "rule": ""}, {"date": "2024.11", "round": "19", "win": "김진헌", "ru": "김지승", "sf": ["김장현", "김원의"], "rule": "최애몬, 빌리겠습니다."}, {"date": "2024.12", "round": "20", "win": "김장현", "ru": "이시우", "sf": ["최재혁", "이준영"], "rule": "VGC 2024 Reg H"}, {"date": "2025.01", "round": "21", "win": "정두호", "ru": "김현민", "sf": ["최재혁", "이종우"], "rule": "15달러 챌린지"}, {"date": "2025.02", "round": "22", "win": "허진욱", "ru": "이준영", "sf": ["정두호", "김진헌"], "rule": "NPC 랜덤뽑기 팀전"}, {"date": "2025.02", "round": "", "win": "박상준", "ru": "남현모", "sf": ["경재우", "최재혁"], "rule": ""}, {"date": "2025.02", "round": "", "win": "송수아", "ru": "이상우", "sf": ["천승은", "윤태희"], "rule": ""}, {"date": "2025.03", "round": "23", "win": "경재우", "ru": "이원준", "sf": ["최재혁", "이제빈"], "rule": "BW2 스토리"}, {"date": "2025.04", "round": "24", "win": "조윤호", "ru": "이동하", "sf": ["정재현", "김진헌"], "rule": "NPC 배틀 5"}, {"date": "2025.05", "round": "4시즌 챔피언스 시리즈", "win": "이제빈", "ru": "정두호", "sf": ["조윤호", "이종우"], "rule": ""}]}, {"key": "pylite", "label": "파이컵 라이트", "color": "#BFD2E2", "rounds": [{"date": "2024.10", "round": "1", "win": "김지승"}, {"date": "2025.01", "round": "2", "win": "정두호"}, {"date": "2025.02", "round": "3", "win": "정두호"}, {"date": "2025.02", "round": "", "win": "이제빈"}, {"date": "2025.02", "round": "", "win": "류지오"}, {"date": "2025.03", "round": "4", "win": "송하준"}]}, {"key": "master", "label": "마스터 리그", "color": "#2FA2D8", "rounds": [{"date": "2025.06", "round": "1", "win": "김현민", "ru": "이종우", "sf": ["이제빈", "허진욱"], "rule": "VGC Reg I 팀전"}, {"date": "2025.06", "round": "", "win": "정재현", "ru": "신동헌", "sf": ["이재원", "김원의"], "rule": ""}, {"date": "2025.07", "round": "2", "win": "이준영", "ru": "정두호", "sf": ["이제빈", "조윤호"], "rule": "모노타입"}, {"date": "2025.08.02", "round": "3", "win": "김현민", "ru": "정두호", "sf": ["이준영", "이종우"], "rule": "갓챠!"}, {"date": "2025.09", "round": "4", "win": "관동 레즈", "ru": "알로라 가디언즈", "sf": [], "rule": "6세대 63 팀전", "winMembers": ["이제빈", "송하준", "김채운", "성기성", "임소동"], "ruMembers": ["정두호", "김무현", "김태건", "김인구", "손우진"], "team": true}, {"date": "2025.10", "round": "5", "win": "이종우", "ru": "정두호", "sf": ["송하준", "이준영"], "rule": "NPC 대회"}, {"date": "2025.11.26", "round": "6", "win": "이종우", "ru": "천승은", "sf": ["김장현", "이제빈"], "rule": "모험! 미르시티!"}, {"date": "2026.01.27", "round": "7", "win": "정두호", "ru": "이병재", "sf": ["이준영", "허진욱"], "rule": "배틀! 언더독 라이징!"}, {"date": "2026.02.21", "round": "1", "win": "정두호", "ru": "김현민", "sf": ["이종우", "이제빈"], "rule": "챔피언스리그"}, {"date": "2026.03.21", "round": "8", "win": "정두호", "ru": "김현민", "sf": ["이상준", "이제빈"], "rule": "데스티니 컵"}, {"date": "2026.04.12", "round": "9", "win": "성도 울브즈", "ru": "칼로스 제니스", "sf": [], "rule": "7세대 63 팀전", "winMembers": ["김원의", "선동연", "임소동", "이종찬"], "ruMembers": ["이종우", "김유진", "강고균", "이진우"], "team": true}, {"date": "2026.05.02", "round": "10", "win": "김원의", "ru": "정두호", "sf": ["구태욱", "허진욱"], "rule": "VGC M-A Champions"}]}, {"key": "rookie", "label": "루키 리그", "color": "#5BC8B0", "rounds": [{"date": "2025.07", "round": "2", "win": "천승은"}, {"date": "2025.08.02", "round": "3", "win": "김원의"}, {"date": "2025.10.25", "round": "4", "win": "이원준"}, {"date": "2025.11.26", "round": "6", "win": "이상우"}, {"date": "2026.01.27", "round": "7", "win": "이상준"}, {"date": "2026.03.15", "round": "8", "win": "김호연"}, {"date": "2026.05.02", "round": "10", "win": "손우진"}]}], "pokecup": {"rows": [{"name": "이시우", "win": 1, "ru": 1, "top4": 0, "points": 70}, {"name": "박상준", "win": 1, "ru": 0, "top4": 1, "points": 60}, {"name": "이병재", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "정재현", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "남현모", "win": 0, "ru": 1, "top4": 0, "points": 20}, {"name": "정두호", "win": 0, "ru": 1, "top4": 2, "points": 40}, {"name": "허진욱", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "곽준우", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "이재원", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "곽준우", "win": 1, "ru": 0, "top4": 0, "points": 50}, {"name": "김진헌", "win": 0, "ru": 0, "top4": 1, "points": 10}, {"name": "김민재", "win": 0, "ru": 0, "top4": 1, "points": 10}], "rounds": [{"date": "2024년 11월", "round": "1"}, {"date": "2024년 12월", "round": "2"}, {"date": "2025.01", "round": "3"}, {"date": "2025.02", "round": "4"}]}};
/* 포켓몬 이미지: 팀전 엔트리에서만 쓰이므로 최초 사용 시점까지 평가를 미룹니다(초기 로딩 최적화) */
/* ============================== 시드 ============================== */
const SEED = {
  meta: {
    fullName: "Yonsei Pokémon League",
    tagline: "포켓몬 센터 연세점 공식 배틀 리그",
    intro: "포센연이 운영하는 자체 배틀 리그. 모든 트레이너의 성적과 칭호, 명예의 전당을 한 곳에 기록합니다.",
    currentChampion: "정두호", currentChampionGen: "5대",
  },
  champions: [
    { id:uid(), gen:"초대", season:1, slabel:"CLASSIC SEASON 1", name:"정두호", team:["이어롭","픽시","해피너스","다투곰(블러드문)","무장조","더시마사리"] },
    { id:uid(), gen:"2대", season:2, slabel:"CLASSIC SEASON 2", name:"이종우", team:["번치코","어래곤","타부자고","껍질몬","모토마","클레피"] },
    { id:uid(), gen:"3대", season:3, slabel:"CLASSIC SEASON 3", name:"허진욱", team:["코터스","꿰뚫는화염","날뛰는우레","굽이치는물결","드레디어(히스이)","쉐이미(스카이폼)"] },
    { id:uid(), gen:"4대", season:4, slabel:"CLASSIC SEASON 4", name:"이제빈", team:["오거폰(물)","아머까오","드닐레이브","루카리오","윈디","눈설왕"] },
    { id:uid(), gen:"5대", season:5, slabel:"YPL SEASON 1", name:"정두호", team:["맘복치","오롱털","다투곰","그우린차","썬더볼트","파밀리쥐"] },
  ],
  titleGroups: [
    { id:uid(), key:"champion", name:"역대 챔피언", icon:"👑", desc:"챔피언스 시리즈 우승", items:[
      {id:uid(),name:"초대 챔피언",holders:["정두호"]},{id:uid(),name:"2대 챔피언",holders:["이종우"]},
      {id:uid(),name:"3대 챔피언",holders:["허진욱"]},{id:uid(),name:"4대 챔피언",holders:["이제빈"]},
      {id:uid(),name:"5대 챔피언",holders:["정두호"]} ]},
    { id:uid(), key:"type", name:"타입 엑스퍼트", icon:"⚡", desc:"같은 타입만 사용해서 개인전 4강 이상 진출", items:[
      {id:uid(),name:"노말 엑스퍼트",holders:["정두호","김진헌"]},{id:uid(),name:"격투 엑스퍼트",holders:[]},
      {id:uid(),name:"비행 엑스퍼트",holders:["조윤호"]},{id:uid(),name:"독 엑스퍼트",holders:["이원준"]},
      {id:uid(),name:"땅 엑스퍼트",holders:["김철수","정두호"]},{id:uid(),name:"바위 엑스퍼트",holders:["이제빈"]},
      {id:uid(),name:"벌레 엑스퍼트",holders:["이제빈"]},{id:uid(),name:"고스트 엑스퍼트",holders:["이준영"]},
      {id:uid(),name:"강철 엑스퍼트",holders:[]},{id:uid(),name:"불꽃 엑스퍼트",holders:[]},
      {id:uid(),name:"물 엑스퍼트",holders:["이준영"]},{id:uid(),name:"풀 엑스퍼트",holders:["장서영"]},
      {id:uid(),name:"전기 엑스퍼트",holders:[]},{id:uid(),name:"에스퍼 엑스퍼트",holders:["이제빈","천승은"]},
      {id:uid(),name:"얼음 엑스퍼트",holders:[]},{id:uid(),name:"드래곤 엑스퍼트",holders:[]},
      {id:uid(),name:"악 엑스퍼트",holders:[]},{id:uid(),name:"페어리 엑스퍼트",holders:["김다온","김원의"]} ]},
    { id:uid(), key:"region", name:"지방 엘리트", icon:"🗺️", desc:"같은 세대의 포켓몬만 사용해서 개인전 4강 이상 진출 (리전폼은 해당 지역 세대 기준)", items:[
      {id:uid(),name:"관동 엘리트",holders:[]},{id:uid(),name:"성도 엘리트",holders:["이제빈"]},
      {id:uid(),name:"호연 엘리트",holders:[]},{id:uid(),name:"신오 엘리트",holders:[]},
      {id:uid(),name:"히스이 엘리트",holders:["김장현"]},{id:uid(),name:"하나 엘리트",holders:["임준하","정두호"]},
      {id:uid(),name:"칼로스 엘리트",holders:[]},{id:uid(),name:"알로라 엘리트",holders:["임준하"]},
      {id:uid(),name:"가라르 엘리트",holders:[]},{id:uid(),name:"팔데아 엘리트",holders:[]} ]},
    { id:uid(), key:"partner", name:"파트너", icon:"🤝", desc:"같은 포켓몬으로 2회 이상 우승", items:[
      {id:uid(),name:"이병재",holders:["찌르호크"]},
      {id:uid(),name:"정두호",holders:["이어롭","픽시","해피너스","다투곰"]},
      {id:uid(),name:"이종우",holders:["마릴리","이어롭","텅비드"]} ]},
    { id:uid(), key:"etc", name:"기타 칭호", icon:"🎖️", desc:"특수 조건을 달성한 트레이너에게 주어지는 칭호", items:[
      {id:uid(),name:"슈퍼루키",desc:"루키 리그 우승",holders:["천승은","김원의","이원준","이상준","김호연","손우진"]},
      {id:uid(),name:"버스드라이버",desc:"전승으로 팀전 우승",holders:["송수아"]} ]},
    { id:uid(), key:"event", name:"이벤트 칭호", icon:"🎉", desc:"파이컵 라이트 등 이벤트 대회 우승", items:[
      {id:uid(),name:"끝말잇기",holders:["김지승"]},{id:uid(),name:"몽키매직",holders:["정두호"]},
      {id:uid(),name:"전화기",holders:["정두호","이제빈","류지오"]},{id:uid(),name:"초신성",holders:["송하준"]},
      {id:uid(),name:"메가진화의 계승자",holders:["이종우"]},{id:uid(),name:"RED",holders:["구태욱"]} ]},
  ],
  announcements: [],
  brackets: [],
  board: [],
  ...IMPORTED,
};

/* 저장된(Supabase) 데이터의 일부 텍스트를 최신 표기로 교정 — 로드 시 메모리에서 적용 */
function normalizeData(d){
  if(!d || typeof d!=="object") return d;
  const labelFix={"파이컵 Lite":"파이컵 라이트","PY-CUP Lite":"파이컵 라이트","파이컵 lite":"파이컵 라이트"};
  const groupDesc={champion:"챔피언스 시리즈 우승",partner:"같은 포켓몬으로 2회 이상 우승",event:"파이컵 라이트 등 이벤트 대회 우승"};
  const tournaments=Array.isArray(d.tournaments)?d.tournaments.map(t=>t&&labelFix[t.label]?{...t,label:labelFix[t.label]}:t):d.tournaments;
  const titleGroups=Array.isArray(d.titleGroups)?d.titleGroups.map(g=>g&&groupDesc[g.key]?{...g,desc:groupDesc[g.key]}:g):d.titleGroups;
  const brackets=Array.isArray(d.brackets)?d.brackets:[];
  const board=Array.isArray(d.board)?d.board:[];
  return {...d,tournaments,titleGroups,brackets,board};
}

/* ============================== 공통 ============================== */

/* 토스트 — 떠 있는 층의 공통 규칙대로 나타날 때처럼 사라질 때도 움직인다. */
function Toast({ text }){
  const ref=useRef(null);
  useExitAnimation(ref,{ replacedBy:".toast" });
  return <div className="toast" ref={ref} role="status" aria-live="polite">{text}</div>;
}

/* ============================== 앱 ============================== */
export default function App() {
  const [data,setData]=useState(null); const [view,setView]=useState(()=>readInitialAppView(window.location.search));
  const [admin,setAdmin]=useState(false); const [toast,setToast]=useState(null); const [modal,setModal]=useState(null); const toastTimer=useRef(0);
  const [scrolled,setScrolled]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{(async()=>setData(normalizeData((await loadSiteData())||SEED)))();},[]);
  const [noAnim,setNoAnim]=useState(false);
  const switchTheme=useCallback(()=>{
    // 낮↔밤은 화면 전체가 한 번에 겹쳐 넘어간다(View Transitions).
    // 이때는 no-anim 이 필요 없다 — 전환 자체가 화면 전체의 스냅샷을 겹쳐 주므로
    // 요소들이 각자 다른 속도로 색을 바꾸는 모습이 애초에 보이지 않는다.
    if(typeof document.startViewTransition==="function"
       && !(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)){
      document.startViewTransition(()=>flushSync(()=>setDark(d=>!d)));
      return;
    }
    // View Transitions 가 없는 브라우저에서는 전환을 잠시 끄고 한 번에 바꾼다.
    // 되돌리는 일을 rAF 에만 맡기면, 탭이 가려져 rAF 가 멈춘 사이에 눌렸을 때
    // no-anim 이 그대로 굳어 사이트의 모든 움직임이 죽는다. 타이머로 함께 건다.
    setNoAnim(true);
    setDark(d=>!d);
    const clear=()=>setNoAnim(false);
    window.requestAnimationFrame(()=>window.requestAnimationFrame(clear));
    window.setTimeout(clear,120);
  },[]);
  const [dark,setDark]=useState(()=>{
    try{ const v=localStorage.getItem("ypl-theme");
      if(v==="dark") return true; if(v==="light") return false;
      return !!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
    }catch(e){ return false; }
  });
  /* 테마는 <html> 에 건다 — 페이지, 오버스크롤 영역, 스크롤바, 브라우저 주소창 색이 한 바탕을 쓴다.
     레이아웃 단계에서 바꿔야 View Transition 의 새 스냅샷에 반영된다. */
  useLayoutEffect(()=>{
    const root=document.documentElement;
    root.dataset.theme=dark?"dark":"light";
    root.style.colorScheme=dark?"dark":"light";
    document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute("content",dark?"#000000":"#FFFFFF"));
  },[dark]);
  useEffect(()=>{ try{ localStorage.setItem("ypl-theme", dark?"dark":"light"); }catch(e){} },[dark]);
  useEffect(()=>{let last=null,raf=0;const f=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const v=window.scrollY>20;if(v!==last){last=v;setScrolled(v);}});};f();window.addEventListener("scroll",f,{passive:true});return()=>{window.removeEventListener("scroll",f);if(raf)cancelAnimationFrame(raf);};},[]);
  /* 탭 제목 — 모든 화면이 "YPL" 하나였습니다. 뒤로 가기 목록과 브라우저 탭에서
     어디에 있었는지 구분되지 않아, 열어 둔 탭이 여러 개면 찾을 수가 없었습니다. */
  useEffect(()=>{
    const label=(NAV_ITEMS.find(([key])=>key===view)||[])[1];
    document.title=label?`${label} | YPL`:"YPL — Yonsei Pokémon League";
  },[view]);
  useEffect(()=>{
    const onPopState=()=>setView(readInitialAppView(window.location.search));
    window.addEventListener("popstate",onPopState);
    return ()=>window.removeEventListener("popstate",onPopState);
  },[]);
  const go=useCallback((v, options={})=>{
    if((v==="builder"||v==="bracket")&&options.eventId){
      const url=new URL(window.location.href);
      url.search= v==="builder" ? `view=builder&eventId=${encodeURIComponent(options.eventId)}` : bracketRouteSearch(options.eventId, window.location.search).slice(1);
      window.history.pushState({view:v,eventId:options.eventId},"",url);
    }else{
      // 모든 탭이 주소에 남는다 — 새로고침, 뒤로 가기, 링크 공유 모두 같은 화면으로 돌아온다.
      const url=new URL(window.location.href);
      url.searchParams.delete("eventId");
      if(v==="home") url.searchParams.delete("view"); else url.searchParams.set("view",v);
      if(url.href!==window.location.href) window.history.pushState({view:v},"",url);
    }
    // 탭이 바뀌면 내용이 통째로 교체된다. 부드럽게 "굴러 올라가는" 스크롤은
    // 새 페이지가 이미 그려진 뒤에 도착해 화면이 두 번 움직이는 것처럼 보인다.
    // 자리를 먼저 맨 위로 옮겨 두고, 등장 애니메이션이 처음부터 보이게 한다.
    setView(v);setMenuOpen(false);window.scrollTo({top:0,behavior:"auto"});
  },[]);
  // 토스트는 매번 온전히 1.8초 보인다. 앞 토스트의 타이머가 새 토스트를 일찍 지우지 않게 하나만 둔다.
  const flash=useCallback((m)=>{window.clearTimeout(toastTimer.current);setToast({id:Date.now()+Math.random(),text:m});toastTimer.current=window.setTimeout(()=>setToast(null),1800);},[]);
  const save=useCallback(async(next)=>{const sanitized={...next,brackets:Array.isArray(next?.brackets)?next.brackets.filter(b=>b?.projection?.source!=="normalized"):next?.brackets};setData(sanitized);const ok=await saveSiteData(sanitized);flash(ok?"저장했습니다":"메모리에만 반영됐습니다");return ok;},[flash]);
  const submitForm=useCallback(async(annId,payload)=>{
    const announcement=(data.announcements||[]).find(a=>a.id===annId);
    const form=announcement?.form||{};
    const answers=payload?.answers&&typeof payload.answers==="object"?payload.answers:payload;

    if(form.eventId){
      try{
        const { submitEventApplication } = await import("./services/normalizedCompetitionService.js");
        await submitEventApplication({
          eventId:form.eventId,
          registrationName:payload?.registrationName||"",
          registrationData:{
            answers:answers||{},
            announcementId:annId,
          },
        });
        flash("신청을 접수했습니다");
        return true;
      }catch(error){
        flash(error?.message||"신청 저장에 실패했습니다.");
        return false;
      }
    }

    // 기존 legacy 신청서는 기존 저장 방식을 유지한다.
    // 동시 제출로 인한 응답 유실 방지:
    // 최신 데이터를 다시 읽어 내 응답을 덧붙여 저장한 뒤, 저장 결과를 재확인.
    // 다른 사람의 저장에 덮여 내 응답이 사라졌으면 자동으로 다시 시도한다.
    const resp={id:uid(),createdAt:new Date().toISOString(),answers:answers||{}};
    const attach=(base)=>{
      const announcements=(base.announcements||[]).map(a=>{
        if(a.id!==annId) return a;
        const cur=((a.form||{}).responses)||[];
        if(cur.some(r=>r.id===resp.id)) return a;
        return {...a,form:{...(a.form||{}),responses:[...cur,resp]}};
      });
      return {...base,announcements};
    };
    let ok=false;
    const hasMine=(d)=>{ const a=(d.announcements||[]).find(x=>x.id===annId); return (((a||{}).form||{}).responses||[]).some(r=>r.id===resp.id); };
    for(let attempt=0;attempt<8;attempt++){
      const fresh=normalizeData((await loadSiteData())||data);
      const next=attach(fresh);
      setData(next);
      ok=await saveSiteData(next);
      if(!ok) break;
      // 저장 확인: 뒤늦게 남의 저장에 덮이는 경우까지 잡기 위해 두 번 연속 확인
      await new Promise(r=>setTimeout(r,120+Math.random()*180));
      const c1=normalizeData((await loadSiteData())||next);
      if(hasMine(c1)){
        await new Promise(r=>setTimeout(r,200+Math.random()*250));
        const c2=normalizeData((await loadSiteData())||c1);
        if(hasMine(c2)){ setData(c2); flash("신청을 접수했습니다"); return true; }
      }
      await new Promise(r=>setTimeout(r,150+Math.random()*400*(attempt+1))); // 랜덤 백오프로 동시 충돌 분산
    }
    flash(ok?"신청 저장을 확인하지 못했습니다. 다시 시도해주세요.":"메모리에만 반영됨");
    return false;
  },[data,flash]);
  const refresh=useCallback(async()=>{ const fresh=await loadSiteData(); if(fresh) setData(normalizeData(fresh)); },[]);
  if(!data) return <div className="boot" role="status" aria-live="polite"><div className="boot-in"><BrandMark size={44}/><span className="boot-bar" aria-hidden="true"/><span className="loading-txt">불러오는 중</span></div></div>;
  return (
    <div className={"ypl"+(noAnim?" no-anim":"")}>
      {/* 키보드로 들어온 사람은 매번 헤더 전체를 지나야 본문에 닿았다. */}
      <a className="skip-link" href="#ypl-main">본문으로 건너뛰기</a>
      <SiteHeader
        view={view}
        onNavigate={go}
        dark={dark}
        onToggleTheme={switchTheme}
        scrolled={scrolled}
        menuOpen={menuOpen}
        onToggleMenu={()=>setMenuOpen(o=>!o)}
        admin={admin}
        onAdminClick={()=>{admin?setAdmin(false):setModal({type:"login"});setMenuOpen(false);}}
      />
      {admin&&<AdminModeBar/>}

      <div className="wrap"><main className="page" id="ypl-main" tabIndex={-1} key={view}>
        <LazyContent>
        {view==="home"&&<HomePage data={data} go={go} admin={admin}/>}
        {view==="about"&&<AboutPage/>}
        {view==="news"&&<NewsPage data={data} admin={admin} setModal={setModal} save={save} submitForm={submitForm} refresh={refresh} go={go}/>}
        {view==="board"&&<BoardPage data={data} admin={admin} save={save} flash={flash}/>}
        {view==="records"&&<RecordsPage data={data} admin={admin} setModal={setModal} save={save}/>}
        {view==="bracket"&&<BracketsPage data={data} admin={admin} save={save} flash={flash} refresh={refresh}/>}
        {view==="builder"&&<TeamBuilderPage/>}
        {view==="titles"&&<TitlesPage data={data} admin={admin} setModal={setModal}/>}
        {view==="champions"&&<ChampionsPage data={data} admin={admin} setModal={setModal} go={go}/>}
        </LazyContent>
      </main>
      </div>
      <SiteFooter onNavigate={go} tagline={data.meta&&data.meta.tagline}/>

      {toast&&<Toast key={toast.id} text={toast.text}/>}
      <SiteDialogHost/>

      {modal&&<LazyContent key={modal.type} onClose={()=>setModal(null)}><AdminModalHost
        modal={modal}
        data={data}
        setModal={setModal}
        save={save}
        setAdmin={setAdmin}
        flash={flash}
      /></LazyContent>}
    </div>
  );
}
