import React from "react";

/* Site icons, drawn for this site on a 24 grid (DESIGN.md "Icons"): 1.5 stroke, square caps, mitred corners, no curves where a
   corner will do. Sizes 16, 20, 24. An icon only says what words cannot. An unknown name draws nothing. */
const P = {
  arrow: "M4.5 12h15M13.5 6l6 6-6 6",
  back: "M14.5 6l-6 6 6 6",
  chevl: "M14.5 6l-6 6 6 6",
  chevr: "M9.5 6l6 6-6 6",
  chev: "M6 9.5l6 6 6-6",
  up: "M12 19.5v-15M6 10.5l6-6 6 6",
  down: "M12 4.5v15M6 13.5l6 6 6-6",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  search: "M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15 15l5 5",
  ext: "M13.5 4.5h6v6M19.5 4.5l-9 9M10.5 6h-6v13.5H18v-6",
  alert: "M4.5 4.5h15v15h-15zM12 7.5v6M12 15.5V17",
  info: "M4.5 4.5h15v15h-15zM12 10.5V17M12 7v1.5",
  trash: "M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  download: "M12 4.5v10M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14",
  login: "M13 5.5h6.5v13H13M4.5 12h10M11 8.5l3.5 3.5-3.5 3.5",
  logout: "M11 5.5H4.5v13H11M9.5 12h10M16 8.5l3.5 3.5-3.5 3.5",
  lock: "M5.5 10.5h13v9h-13zM8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3",
  link: "M10.5 7.5l2-2h6v6l-2 2M13.5 16.5l-2 2h-6v-6l2-2M9.5 14.5l5-5",
  form: "M5.5 3.5h13v17h-13zM9 8.5h6M9 12h6M9 15.5h3.5",
  edit: "M14.5 5.5l4 4L9 19H5v-4zM12.5 7.5l4 4",
  image: "M4 5h16v14H4zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5",
  bell: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5zM4.5 16.5h15M10 19.5h4",
  drag: "M6 9.5h12M6 14.5h12",
  trophy: "M7.5 4.5h9v6l-2 3h-5l-2-3zM7.5 6.5h-3v3l3 2M16.5 6.5h3v3l-3 2M12 13.5V18M8.5 19.5h7",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8",
  moon: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z",
  home: "M4 10.5L12 4l8 6.5V20h-5.5v-6h-5v6H4z",
  news: "M5.5 3.5h13v17h-13zM9 8.5h6M9 12h6M9 15.5h3.5",
  bracket: "M3.5 6H9v12H3.5M9 12h5.5M14.5 8.5h6v7h-6z",
  records: "M4 12h4v8H4zM10 5h4v15h-4zM16 9h4v11h-4z",
  /* three filled squares, like lamps */
  more: "M4.5 10.5h3v3h-3zM10.5 10.5h3v3h-3zM16.5 10.5h3v3h-3z",
};
const FILLED = new Set(["more"]);

export default function Icon({ n, size = 16, className = "", style }) {
  const d = P[n];
  if (!d) return null;
  const fill = FILLED.has(n);
  return (
    <svg className={"ic" + (className ? " " + className : "")} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}
      fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter">
      <path d={d} />
    </svg>
  );
}
