import React from "react";
import { useAdminActions } from "../components/index.js";
import {
  AnnEditor,
  ChampionEditor,
  LoginModal,
  MetaEditor,
  RoundsEditor,
  StandingsEditor,
  TitleItemEditor,
} from "./editors/AdminEditors.jsx";

export default function AdminModalHost({ modal, data, setModal, save, setAdmin, flash, normTeam }) {
  const { confirmAction, deleteWithUndo } = useAdminActions();
  /* 삭제 전 확인 + 10초 되돌리기를 공통으로 처리한다. */
  const removeItem = async ({ title, message, label, next, onDone }) => {
    const ok = await confirmAction({ title, message, danger: true });
    if (!ok) return;
    deleteWithUndo({ label, next });
    onDone && onDone();
  };
  if (!modal) return null;
  const close = () => setModal(null);

  if (modal.type === "login") {
    return (
      <LoginModal
        onClose={close}
        onSuccess={() => {
          setAdmin(true);
          close();
          flash("관리자 로그인 ✓");
        }}
      />
    );
  }

  if (modal.type === "meta") {
    return <MetaEditor meta={data.meta} onClose={close} onSave={(meta) => { save({ ...data, meta }); close(); }} />;
  }

  if (modal.type === "champion") {
    return (
      <ChampionEditor
        item={modal.item}
        normTeam={normTeam}
        onClose={close}
        onSave={(champion) => {
          const champions = modal.item
            ? data.champions.map((item) => item.id === champion.id ? champion : item)
            : [...data.champions, champion];
          save({ ...data, champions });
          close();
        }}
        onDelete={modal.item ? () => removeItem({
          title: "명예의 전당에서 삭제할까요?",
          message: `“${modal.item.name || "이 항목"}” 기록이 사라집니다. 삭제 후 10초 안에는 되돌릴 수 있습니다.`,
          label: "명예의 전당 항목을 삭제했습니다",
          next: { ...data, champions: data.champions.filter((item) => item.id !== modal.item.id) },
          onDone: close,
        }) : null}
      />
    );
  }

  if (modal.type === "title") {
    return (
      <TitleItemEditor
        groupKey={modal.groupKey}
        item={modal.item}
        onClose={close}
        onSave={(item) => {
          const titleGroups = data.titleGroups.map((group) => group.key !== modal.groupKey ? group : {
            ...group,
            items: modal.item ? group.items.map((entry) => entry.id === item.id ? item : entry) : [...group.items, item],
          });
          save({ ...data, titleGroups });
          close();
        }}
        onDelete={modal.item ? () => removeItem({
          title: "칭호를 삭제할까요?",
          message: `“${modal.item.name || "이 칭호"}”가 사라집니다. 삭제 후 10초 안에는 되돌릴 수 있습니다.`,
          label: "칭호를 삭제했습니다",
          next: {
            ...data,
            titleGroups: data.titleGroups.map((group) => group.key !== modal.groupKey ? group : {
              ...group,
              items: group.items.filter((entry) => entry.id !== modal.item.id),
            }),
          },
          onDone: close,
        }) : null}
      />
    );
  }

  if (modal.type === "ann") {
    return (
      <AnnEditor
        item={modal.item}
        onClose={close}
        onSave={(announcement) => {
          const announcements = modal.item
            ? data.announcements.map((item) => item.id === announcement.id ? announcement : item)
            : [announcement, ...data.announcements];
          save({ ...data, announcements });
          close();
        }}
        onDelete={modal.item ? () => removeItem({
          title: "공지를 삭제할까요?",
          message: `“${modal.item.title || "제목 없음"}” 공지와 신청서 응답이 함께 사라집니다. 삭제 후 10초 안에는 되돌릴 수 있습니다.`,
          label: "공지를 삭제했습니다",
          next: { ...data, announcements: data.announcements.filter((item) => item.id !== modal.item.id) },
          onDone: close,
        }) : null}
      />
    );
  }

  if (modal.type === "standings") {
    return <StandingsEditor title={modal.title} rows={modal.rows} onClose={close} onSave={(rows) => { save(modal.build(rows)); close(); }} />;
  }

  if (modal.type === "rounds") {
    return (
      <RoundsEditor
        title={modal.title}
        rounds={modal.rounds}
        simple={modal.simple}
        seasons={modal.seasons}
        onClose={close}
        onSave={(rounds) => { save(modal.build(rounds)); close(); }}
      />
    );
  }

  return null;
}
