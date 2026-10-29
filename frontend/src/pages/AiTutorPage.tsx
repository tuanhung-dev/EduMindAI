import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getDocuments, getDocumentFileUrl, isWordDocument, type DocumentItem } from "../services/documentService";
import {
  askDocument, streamAskDocument, indexDocument, summarizeDocument,
  getSavedSummaries, getSavedSummary, deleteSavedSummary,
  type AiAnswer, type AiSummary, type SavedSummaryItem,
} from "../services/aiTutorService";
import { getChats, getChat, deleteChat, renameChat, pinChat, type AiChatSession, type AiChatMessage } from "../services/aiChatService";
import DocumentSidePanel from "../components/DocumentSidePanel";
import TutorRichText from "../components/TutorRichText";
import "./AiTutorPage.css";
import "./RagGroupA.css";
import "./AiTutorChatGPT.css";
import "./AiTutorUnified.css";

const prompts = [
  { icon: "✧", label: "Tóm lược các kiến thức chính", question: "Tài liệu này đề cập đến những nội dung chính nào?" },
  { icon: "◎", label: "Giải thích một khái niệm", question: "Giải thích khái niệm quan trọng nhất trong tài liệu, kèm ví dụ dễ hiểu." },
  { icon: "▤", label: "Lập danh sách ôn tập", question: "Những kiến thức nào tôi nên ưu tiên ôn tập trước kỳ thi?" },
  { icon: "✎", label: "Tự kiểm tra kiến thức", question: "Hãy đưa ra 5 câu hỏi tự kiểm tra dựa trên tài liệu và gợi ý cách trả lời." },
];

type ChatTurn = { id: number; documentId: number; prompt: string; result?: AiAnswer; failure?: string; partial?: string };
type TutorMode = "ask" | "summary";

function toChatTurns(messages: AiChatMessage[], documentId: number): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ id: message.id, documentId, prompt: message.content });
    } else if (message.role === "assistant" && turns.length) {
      const last = turns[turns.length - 1];
      if (!last.result) {
        last.result = { documentId, answer: message.content, sources: Array.isArray(message.sources) ? message.sources : [] };
      }
    }
  }
  return turns;
}

function parseDocumentId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function humanDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ thời gian" : date.toLocaleString("vi-VN");
}

function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function AiTutorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [mode, setMode] = useState<TutorMode>("ask");
  const [question, setQuestion] = useState("");
  const [additionalDocuments, setAdditionalDocuments] = useState<number[]>([]);
  const [useStreaming, setUseStreaming] = useState(true);
  const stopStreamRef = useRef<AbortController | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [chatSessions, setChatSessions] = useState<AiChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [chatGroup, setChatGroup] = useState<"all" | "pinned">("all");
 const [historyOpen, setHistoryOpen] = useState(() =>
  typeof window === "undefined" ||
  !window.matchMedia("(max-width: 1100px)").matches
);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
  const [sourceExpanded, setSourceExpanded] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<AiAnswer["sources"][number] | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [summaryLevel, setSummaryLevel] = useState<"short" | "detailed">("short");
  const [savedSummaries, setSavedSummaries] = useState<SavedSummaryItem[]>([]);
  const [historyForDocument, setHistoryForDocument] = useState<number | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [editingHistory, setEditingHistory] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const documentPanelRef = useRef<HTMLElement>(null);
  const nextTurnRef = useRef(-1);

  // Tải danh sách tài liệu khi mở Gia sư AI.
  // Nếu bỏ useEffect này, loadingDocs sẽ luôn là true và form chat bị khóa.
  useEffect(() => {
    let active = true;
    getDocuments()
      .then(items => {
        if (active) setDocuments(items);
      })
      .catch(err => {
        if (active) setError(friendlyError(err, "Không tải được kho tài liệu."));
      })
      .finally(() => {
        if (active) setLoadingDocs(false);
      });
    return () => { active = false; };
  }, []);

  const requested = parseDocumentId(searchParams.get("documentId"));
  const documentId = documents.some(d => d.id === requested) ? requested : (documents[0]?.id ?? null);
  const selectedDocument = documents.find(d => d.id === documentId);
  const busy = loadingDocs || indexing || asking || summarizing || editingHistory;
  const ready = selectedDocument?.status.toLowerCase() === "ready";
  const isWord = selectedDocument ? isWordDocument(selectedDocument) : false;
  const sourceLabel = isWord ? "Phần" : "Trang";
  const visibleTurns = turns.filter(turn => turn.documentId === documentId);
  const closeSource = useCallback(() => {
    setSelectedSource(null);
    window.requestAnimationFrame(() => sourceTriggerRef.current?.focus());
  }, []);
  function openSource(source: AiAnswer["sources"][number], trigger: HTMLButtonElement) {
    sourceTriggerRef.current = trigger;
    setSelectedSource(source);
  }
  const historyGroups = useMemo(() => {
    const query = chatSearch.trim().toLocaleLowerCase("vi-VN");
    const items = chatSessions.filter(chat => (chatGroup === "all" || chat.isPinned) && chat.title.toLocaleLowerCase("vi-VN").includes(query));
    const toUtcTimestamp = (value: string) => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
    const sorted = [...items].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || toUtcTimestamp(b.updatedAtUtc) - toUtcTimestamp(a.updatedAtUtc));
    const today = new Date();
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const groups = new Map<string, AiChatSession[]>();
    for (const chat of sorted) {
      const timestamp = toUtcTimestamp(chat.updatedAtUtc);
      const group = chat.isPinned ? "Đã ghim" : timestamp >= midnight ? "Hôm nay" : timestamp >= midnight - 7 * 86400000 ? "7 ngày gần đây" : "Cũ hơn";
      groups.set(group, [...(groups.get(group) ?? []), chat]);
    }
    return Array.from(groups.entries());
  }, [chatSessions, chatGroup, chatSearch]);
  const activeSummary = summary?.documentId === documentId ? summary : null;

  // Lịch sử tóm tắt và hội thoại được lưu ở Backend theo tài liệu.
  useEffect(() => {
    if (!documentId) return;
    let live = true;
    getSavedSummaries(documentId)
      .then(items => { if (live) { setSavedSummaries(items); setHistoryForDocument(documentId); } })
      .catch(() => { if (live) { setSavedSummaries([]); setHistoryForDocument(documentId); } });
    return () => { live = false; };
  }, [documentId]);

  // Loading a PDF/Word also restores the newest saved chat for that document.
  useEffect(() => {
    if (!documentId) return;
    let active = true;
    getChats(documentId).then(async sessions => {
      if (!active) return;
      setChatSessions(sessions);
      if (sessions.length) {
        const detail = await getChat(sessions[0].id);
        if (active) {
          setActiveChatId(detail.id);
          setTurns(toChatTurns(detail.messages, documentId));
        }
      } else if (active) {
        setActiveChatId(null); setTurns([]);
      }
    }).catch(err => {
      if (active) { setChatSessions([]); setError(friendlyError(err, "Không tải được lịch sử chat.")); }
    }).finally(() => { if (active) setLoadingChats(false); });
    return () => { active = false; };
  }, [documentId]);

  async function refreshHistory() {
    if (!documentId) return;
    setChatSessions(await getChats(documentId));
  }

  async function saveChatTitle(id: number) {
    const title = renamingTitle.trim();
    if (title.length < 1 || title.length > 180) { setError("Tên hội thoại phải từ 1 đến 180 ký tự."); return; }
    setEditingHistory(true); setError("");
    try {
      await renameChat(id, title);
      await refreshHistory();
      setRenamingChatId(null); setNotice("Đã đổi tên hội thoại.");
    } catch (e) { setError(friendlyError(e, "Không đổi được tên hội thoại.")); }
    finally { setEditingHistory(false); }
  }

  async function toggleChatPin(chat: AiChatSession) {
    if (busy || loadingChats) return;
    setEditingHistory(true); setError("");
    try {
      await pinChat(chat.id, !chat.isPinned);
      await refreshHistory();
      setNotice(chat.isPinned ? "Đã bỏ ghim." : "Đã ghim hội thoại.");
    } catch (e) { setError(friendlyError(e, "Không thay đổi được trạng thái ghim.")); }
    finally { setEditingHistory(false); }
  }

  async function openConversation(id: number) {
    if (busy || loadingChats) return;
    setLoadingChats(true); setError("");
    try {
      const detail = await getChat(id);
      if (detail.documentId !== documentId) throw new Error("Cuộc trò chuyện không thuộc tài liệu này.");
      setActiveChatId(id);
      setTurns(toChatTurns(detail.messages, detail.documentId));
      setMode("ask");
      if (window.matchMedia("(max-width: 1100px)").matches) setHistoryOpen(false);
    } catch (err) { setError(friendlyError(err, "Không mở được lịch sử hội thoại.")); }
    finally { setLoadingChats(false); }
  }

  async function removeConversation(id: number) {
    if (busy || loadingChats || !window.confirm("Xóa vĩnh viễn cuộc trò chuyện này?")) return;
    setLoadingChats(true);
    try {
      await deleteChat(id);
      setChatSessions(items => items.filter(item => item.id !== id));
      if (activeChatId === id) { setActiveChatId(null); setTurns([]); }
      setNotice("Đã xóa cuộc trò chuyện.");
    } catch (err) { setError(friendlyError(err, "Không xóa được cuộc trò chuyện.")); }
    finally { setLoadingChats(false); }
  }

  useEffect(() => {
    if (mode === "ask" && turns.length > 0) {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [turns, asking, mode]);

  function chooseDocument(id: number) {
    if (busy) return;
    setSearchParams({ documentId: String(id) });
    setDocumentPanelOpen(false);
    setSelectedSource(null); setChatSearch(""); setRenamingChatId(null);
    setTurns([]);
    setActiveChatId(null); setChatSessions([]); setLoadingChats(true);
    setQuestion("");
    setAdditionalDocuments([]);
    setSummary(null);
    setHistoryForDocument(null);
    setSavedSummaries([]);
    setError("");
    setNotice("");
  }

  function switchMode(value: TutorMode) {
    if (busy) return;
    setMode(value);
    setError("");
    setNotice("");
  }

  async function handleIndex() {
    if (!documentId || busy) return;
    setError(""); setNotice(""); setIndexing(true);
    try {
      const result = await indexDocument(documentId);
      setDocuments(items => items.map(d => d.id === documentId ? { ...d, status: result.status } : d));
      setTurns([]); setSummary(null);
      setNotice(`Đã xử lý ${result.totalPages} trang và ${result.chunkCount} đoạn nội dung. Bạn có thể hỏi Gia sư AI.`);
    } catch (err) { setError(friendlyError(err, "Không thể lập chỉ mục PDF.")); }
    finally { setIndexing(false); }
  }

  async function sendPrompt(value: string) {
    const prompt = value.trim();
    if (!documentId || busy) return;
    if (!ready) { setError("Tài liệu chưa sẵn sàng. Hãy xử lý tài liệu trước khi hỏi."); setDocumentPanelOpen(true); return; }
    if (prompt.length < 3 || prompt.length > 500) {
      setError("Câu hỏi cần dài từ 3 đến 500 ký tự."); return;
    }
    const turnId = nextTurnRef.current--;
    const ids = [documentId, ...additionalDocuments.filter(id => id !== documentId)];
    const controller = new AbortController();
    stopStreamRef.current = controller;
    setTurns(items => [...items, { id: turnId, documentId, prompt }].slice(-30));
    setAsking(true); setError(""); setNotice(""); setQuestion("");
    try {
      const result = useStreaming
        ? await streamAskDocument(documentId, prompt, activeChatId, ids,
            delta => setTurns(items => items.map(item => item.id === turnId
              ? { ...item, partial: (item.partial ?? "") + delta } : item)), controller.signal)
        : await askDocument(documentId, prompt, activeChatId, ids);
      if (result.chatId) setActiveChatId(result.chatId);
      setTurns(items => items.map(item => item.id === turnId ? { ...item, result, partial: undefined } : item));
      try { setChatSessions(await getChats(documentId)); }
      catch { setNotice("Đã lưu trả lời nhưng chưa tải lại được danh sách hội thoại."); }
    } catch (err) {
      const message = controller.signal.aborted ? "Bạn đã dừng tạo câu trả lời; lượt này không được lưu." :
        friendlyError(err, "Gia sư AI không trả lời được. Bạn có thể thử lại.");
      setTurns(items => items.map(item => item.id === turnId ? { ...item, failure: message, partial: undefined } : item));
    } finally {
      stopStreamRef.current = null;
      setAsking(false);
    }
  }

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [question, mode]);

  useEffect(() => {
    if (!historyOpen || documentPanelOpen) return;
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setHistoryOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [documentPanelOpen, historyOpen]);

  useEffect(() => {
    if (!documentPanelOpen) return;
    const panel = documentPanelRef.current;
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    function handlePanelKeys(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDocumentPanelOpen(false);
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      )).filter(item => item.getClientRects().length > 0);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    }
    document.addEventListener("keydown", handlePanelKeys);
    return () => { document.removeEventListener("keydown", handlePanelKeys); restoreFocus?.focus(); };
  }, [documentPanelOpen]);

  function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(question);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendPrompt(question);
    }
  }

  function stopGeneration() { stopStreamRef.current?.abort(); }

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        // Ctrl+K searches the currently selected document's conversation history.
        event.preventDefault();
        setHistoryOpen(true);
        window.requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, []);

  function newConversation() {
    if (busy) return;
    setTurns([]); setActiveChatId(null); setQuestion(""); setError(""); setNotice(""); setSelectedSource(null); setDocumentPanelOpen(false); setSourceExpanded(null);
    composerRef.current?.focus();
  }

  async function copyContent(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice("Đã sao chép nội dung."); setError(""); }
    catch { setError("Không thể sao chép. Hãy chọn văn bản và sao chép thủ công."); }
  }

  async function handleSummarize() {
    if (!documentId || busy) return;
    setError(""); setNotice(""); setSummarizing(true);
    try {
      const created = await summarizeDocument(documentId, summaryLevel);
      setSummary(created);
      try {
        const items = await getSavedSummaries(documentId);
        setSavedSummaries(items); setHistoryForDocument(documentId);
        setNotice("Đã tạo và lưu bản tóm tắt vào MySQL.");
      } catch { setNotice("Tóm tắt đã tạo, nhưng chưa thể làm mới danh sách lịch sử."); }
    } catch (err) { setError(friendlyError(err, "Không thể tóm tắt PDF.")); }
    finally { setSummarizing(false); }
  }

  async function openSavedSummary(id: number) {
    if (!documentId || busy) return;
    setEditingHistory(true); setError(""); setNotice("");
    try {
      const result = await getSavedSummary(documentId, id);
      setSummary(result); setSummaryLevel(result.level);
      setNotice("Đã mở bản tóm tắt được lưu trong MySQL.");
    } catch (err) { setError(friendlyError(err, "Không thể mở bản tóm tắt.")); }
    finally { setEditingHistory(false); }
  }

  async function removeSavedSummary(id: number) {
    if (!documentId || busy || !window.confirm("Xóa vĩnh viễn bản tóm tắt này?")) return;
    setEditingHistory(true); setError(""); setNotice("");
    try {
      await deleteSavedSummary(documentId, id);
      setSavedSummaries(items => items.filter(item => item.id !== id));
      if (summary?.id === id) setSummary(null);
      setNotice("Đã xóa bản tóm tắt.");
    } catch (err) { setError(friendlyError(err, "Không thể xóa bản tóm tắt.")); }
    finally { setEditingHistory(false); }
  }

  function downloadSummary() {
    if (!activeSummary) return;
    const content = ["EDUMIND AI – TÓM TẮT TÀI LIỆU", `Tài liệu: ${selectedDocument?.originalFileName ?? "tài liệu"}`,
      `Chế độ: ${activeSummary.level}`, `Lưu ý: ${activeSummary.coverage.note}`, "", activeSummary.summary].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `EduMindAI-TomTat-${documentId ?? "PDF"}.txt`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="emai-page">
      <header className="emai-page-header">
        <div className="emai-page-heading">
          <span className="emai-eyebrow">EDUMIND AI · TRỢ LÝ HỌC TẬP</span>
          <h1>Gia sư AI</h1>
          <p>
            Hỏi đáp như một cuộc trò chuyện, dựa trên tài liệu Word/PDF
            và kiểm tra nguồn ngay trong EduMindAI.
          </p>
        </div>
        <div className="emai-page-actions">
          <span className={`emai-ready-chip ${ready ? "is-ready" : ""}`}>
            <span aria-hidden="true">●</span>
            {ready ? "Sẵn sàng để hỏi" : "Cần chọn / xử lý tài liệu"}
          </span>
          <Link className="emai-docs-link" to="/app/documents">
            ▤ Kho tài liệu ↗
          </Link>
        </div>
      </header>

      <section className={`em30-tutor emgpt-shell ${historyOpen ? "emgpt-history-open" : "emgpt-history-closed"} ${selectedSource ? "emc-tutor-with-source" : ""}`}
      aria-label="Không gian Gia sư AI">
      {historyOpen && <button type="button" className="emgpt-history-backdrop" onClick={() => setHistoryOpen(false)} aria-label="Đóng lịch sử hội thoại" />}
      <aside className="emgpt-sidebar" aria-label="Lịch sử hội thoại">
        <div className="emgpt-sidebar-head">
          <div className="emai-history-title">
            <span className="emai-history-icon" aria-hidden="true">☷</span>
            <div>
              <strong>Lịch sử hội thoại</strong>
              <small>Theo tài liệu đang chọn</small>
            </div>
          </div>
          <button type="button" className="emgpt-icon-btn emgpt-close-sidebar" aria-label="Thu gọn lịch sử" title="Thu gọn lịch sử" onClick={() => setHistoryOpen(false)}>×</button>
        </div>
        <button type="button" className="emgpt-new-chat" onClick={() => { newConversation(); if (window.matchMedia("(max-width: 1100px)").matches) setHistoryOpen(false); }} disabled={busy}>
          <span aria-hidden="true">✎</span> Cuộc trò chuyện mới <span aria-hidden="true">＋</span>
        </button>
        <button type="button" className="emgpt-menu-action" onClick={() => {
          setDocumentPanelOpen(true);
          if (window.matchMedia("(max-width: 1100px)").matches) setHistoryOpen(false);
        }}>
          <span aria-hidden="true">▤</span> Đổi tài liệu tham khảo <span className="emgpt-menu-count">{documents.length}</span>
        </button>
        <div className="emgpt-history-zone">
          <div className="emgpt-history-caption"><span>ĐOẠN CHAT</span><small>{chatSessions.length}</small></div>
          <label className="em30-sr-only" htmlFor="emgpt-search">Tìm kiếm hội thoại trong tài liệu</label>
          <div className="emgpt-search">
            <span aria-hidden="true">⌕</span>
            <input ref={searchRef} id="emgpt-search" type="search" value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Tìm trong lịch sử…" />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="emgpt-history-filters" role="group" aria-label="Lọc lịch sử">
            <button type="button" aria-pressed={chatGroup === "all"} className={chatGroup === "all" ? "selected" : ""} onClick={() => setChatGroup("all")}>Tất cả</button>
            <button type="button" aria-pressed={chatGroup === "pinned"} className={chatGroup === "pinned" ? "selected" : ""} onClick={() => setChatGroup("pinned")}>Đã ghim</button>
          </div>
          <div className="emgpt-history-scroll">
            {loadingChats ? <p className="emgpt-side-empty" role="status">Đang tải hội thoại…</p>
            : chatSessions.length === 0 ? <p className="emgpt-side-empty">Hội thoại của tài liệu này sẽ xuất hiện ở đây.</p>
            : historyGroups.length === 0 ? <p className="emgpt-side-empty">Không tìm thấy hội thoại.</p>
            : historyGroups.map(([groupName, chats]) => <section key={groupName} aria-label={groupName} className="emgpt-history-group">
              <h3>{groupName}</h3>
              {chats.map(chat => <div className={`emgpt-history-item ${activeChatId === chat.id ? "selected" : ""}`} key={chat.id}>
                {renamingChatId === chat.id ? <form className="emgpt-rename" onSubmit={e => { e.preventDefault(); void saveChatTitle(chat.id); }}>
                  <label className="em30-sr-only" htmlFor={`emgpt-name-${chat.id}`}>Tên hội thoại</label>
                  <input id={`emgpt-name-${chat.id}`} autoFocus maxLength={180} value={renamingTitle} onChange={e => setRenamingTitle(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRenamingChatId(null); } }} />
                  <button type="submit" disabled={busy} aria-label="Lưu tên hội thoại">✓</button>
                  <button type="button" onClick={() => setRenamingChatId(null)} aria-label="Hủy đổi tên">×</button>
                </form> : <>
                  <button type="button" className="emgpt-history-entry-button" disabled={busy || loadingChats} onClick={() => void openConversation(chat.id)} aria-current={activeChatId === chat.id ? "true" : undefined} title={chat.title}>
                    <span className="emgpt-history-icon" aria-hidden="true">{chat.isPinned ? "♧" : "▤"}</span><span>{chat.title}</span>
                  </button>
                  <div className="emgpt-history-menu">
                    <button type="button" disabled={busy || loadingChats} title="Đổi tên" aria-label={`Đổi tên ${chat.title}`} onClick={() => { setRenamingChatId(chat.id); setRenamingTitle(chat.title); }}>✎</button>
                    <button type="button" disabled={busy || loadingChats} title={chat.isPinned ? "Bỏ ghim" : "Ghim"} aria-label={chat.isPinned ? `Bỏ ghim ${chat.title}` : `Ghim ${chat.title}`} onClick={() => void toggleChatPin(chat)}>{chat.isPinned ? "◇" : "♧"}</button>
                    <button type="button" disabled={busy || loadingChats} title="Xóa" aria-label={`Xóa ${chat.title}`} onClick={() => void removeConversation(chat.id)}>×</button>
                  </div>
                </>}
              </div>)}
            </section>)}
          </div>
        </div>
        <div className="emgpt-sidebar-foot"><span className="emgpt-avatar" aria-hidden="true">AI</span><div><strong>Gia sư theo tài liệu</strong><small>Lịch sử được lưu trên tài khoản</small></div></div>
      </aside>

      <main className="emgpt-main" aria-label="Trò chuyện với Gia sư AI">
        <header className="emgpt-header">
          <div className="emgpt-header-left">
            <button type="button" className="emgpt-icon-btn" aria-label={historyOpen ? "Đóng lịch sử" : "Mở lịch sử"} aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)} title="Bật/tắt lịch sử">☰</button>
            <div className="emgpt-header-heading">
              <h2>Trò chuyện với AI</h2>
              <span className="emgpt-header-version">Hỏi đáp dựa trên tài liệu · có dẫn nguồn</span>
            </div>
          </div>
          <div className="emgpt-header-right">
            <button type="button" className="emgpt-document-trigger" onClick={() => setDocumentPanelOpen(true)} title="Chọn hoặc xử lý tài liệu">
              <span aria-hidden="true">▤</span><span className="emgpt-document-label">{selectedDocument?.originalFileName ?? "Chọn tài liệu"}</span>
              <span className={`emgpt-mini-dot ${ready ? "ready" : ""}`} aria-hidden="true" />
              <span aria-hidden="true">⌄</span>
            </button>
            <button type="button" className="emgpt-icon-btn emgpt-header-new" onClick={newConversation} disabled={busy} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới">✎</button>
          </div>
        </header>
        <div className="emgpt-mode-row" role="group" aria-label="Chọn chế độ làm việc">
          <button type="button" className={mode === "ask" ? "selected" : ""} aria-pressed={mode === "ask"} disabled={busy} onClick={() => switchMode("ask")}>✧ Trò chuyện</button>
          <button type="button" className={mode === "summary" ? "selected" : ""} aria-pressed={mode === "summary"} disabled={busy} onClick={() => switchMode("summary")}>▤ Tóm tắt tài liệu</button>
          <span className="emgpt-mode-spacer" />
          <span className="emgpt-mode-help">{ready ? "● Tài liệu đã sẵn sàng" : "○ Chưa sẵn sàng"}</span>
        </div>
        {error && <div className="emgpt-inline-alert is-error" role="alert"><span>{error}</span><button type="button" aria-label="Đóng thông báo lỗi" onClick={() => setError("")}>×</button></div>}
        {notice && <div className="emgpt-inline-alert is-notice" role="status"><span>{notice}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setNotice("")}>×</button></div>}
        {mode === "ask" ? <>
          <div ref={chatScrollRef} className="emgpt-conversation-scroll" role="log" aria-label="Lịch sử câu hỏi và câu trả lời">
            {visibleTurns.length === 0 && <div className="emgpt-welcome">
              <div className="emgpt-welcome-orb" aria-hidden="true">✦</div>
              <p className="emgpt-overline">BẠN ĐANG HỌC CÙNG EDUMIND AI</p>
              <h2>Bạn muốn tìm hiểu điều gì?</h2>
              <p className="emgpt-welcome-description">Hỏi, khám phá và ôn tập thông minh dựa trên tài liệu của bạn. Mình sẽ chỉ rõ nguồn trích dẫn để bạn dễ kiểm chứng.</p>
              <div className="emgpt-prompt-grid">
                {prompts.map(item => <button type="button" key={item.question} disabled={busy || !ready} onClick={() => { setQuestion(item.question); composerRef.current?.focus(); }}>
                  <span className="emgpt-prompt-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span><span className="emgpt-prompt-arrow" aria-hidden="true">↗</span>
                </button>)}
              </div>
              {!ready && <button type="button" className="emgpt-welcome-doc" onClick={() => setDocumentPanelOpen(true)}>▤ Chọn hoặc xử lý tài liệu để bắt đầu</button>}
            </div>}
            {visibleTurns.length > 0 && <div className="emgpt-thread">
              {visibleTurns.map(turn => <article className="emgpt-turn" key={turn.id}>
                <div className="emgpt-user-message"><div className="emgpt-user-bubble">{turn.prompt}</div></div>
                <div className="emgpt-ai-message">
                  <div className="emgpt-ai-mark" aria-label="EduMind AI">✦</div>
                  <div className="emgpt-ai-text">
                    {turn.result ? <>
                      <TutorRichText text={turn.result.answer} />
                      <div className="emgpt-answer-tools">
                        <button type="button" title="Sao chép câu trả lời" onClick={() => void copyContent(turn.result!.answer)}>▢ Sao chép</button>
                        {turn.result.sources.length > 0 && <button type="button" aria-expanded={sourceExpanded === turn.id} onClick={() => setSourceExpanded(sourceExpanded === turn.id ? null : turn.id)}>▤ Nguồn trích dẫn ({turn.result.sources.length}) {sourceExpanded === turn.id ? "⌃" : "⌄"}</button>}
                      </div>
                      {sourceExpanded === turn.id && <section className="emgpt-citations" aria-label="Các đoạn tài liệu được trích dẫn">
                        {turn.result.sources.map((source, i) => <div className="emgpt-citation" key={`${source.documentId}-${source.pageNumber}-${source.chunkIndex}-${i}`}>
                          <div className="emgpt-citation-head"><strong>{source.citation ?? `${sourceLabel} ${source.pageNumber}`} · Đoạn {source.chunkIndex + 1}</strong>
                            <button type="button" onClick={e => openSource({ ...source, documentId: source.documentId ?? documentId! }, e.currentTarget)}>Xem nguồn ↗</button></div>
                          <small title={source.documentName}>{source.documentName ?? selectedDocument?.originalFileName}</small><p>{source.excerpt}</p>
                        </div>)}
                      </section>}
                    </> : turn.failure ? <div className="emgpt-answer-failure" role="alert"><strong>Chưa thể tạo câu trả lời</strong><p>{turn.failure}</p><button type="button" disabled={busy} onClick={() => void sendPrompt(turn.prompt)}>↻ Thử lại</button></div>
                    : <div className="emgpt-response-wait" role="status" aria-label="Đang tạo câu trả lời">
                      {turn.partial ? <><TutorRichText text={turn.partial} /><span className="emai-cursor">▍</span></> : <><span className="emgpt-loader" aria-hidden="true"><i /><i /><i /></span> Đang phân tích tài liệu…</>}
                    </div>}
                  </div>
                </div>
              </article>)}
            </div>}
            <div ref={chatEndRef} />
          </div>
          <div className="emgpt-composer-area">
            <form className="emgpt-composer" onSubmit={handleAsk}>
              <label htmlFor="emgpt-question" className="em30-sr-only">Nhập câu hỏi về tài liệu</label>
              <textarea ref={composerRef} id="emgpt-question" rows={1} maxLength={500} value={question}
                disabled={busy || !ready} onChange={e => setQuestion(e.target.value)} onKeyDown={handleComposerKeyDown}
                placeholder={loadingDocs ? "Đang tải tài liệu…" : !documentId ? "Chọn tài liệu để bắt đầu…" : !ready ? "Hãy xử lý tài liệu trước khi hỏi…" : "Nhắn tin cho EduMind AI…"} />
              <div className="emgpt-composer-bottom">
                <div className="emgpt-composer-options">
                  <button type="button" className="emgpt-add-doc" onClick={() => setDocumentPanelOpen(true)} aria-label="Chọn tài liệu" title="Chọn nguồn tài liệu">＋</button>
                  {selectedDocument && <button type="button" className="emgpt-attachment-pill" onClick={() => setDocumentPanelOpen(true)} title={selectedDocument.originalFileName}>
                    ▤ <span>{selectedDocument.originalFileName}</span> <span className={ready ? "emgpt-pill-ready" : "emgpt-pill-warn"}>●</span>
                  </button>}
                  {additionalDocuments.length > 0 && <span className="emgpt-extra-docs">+{additionalDocuments.length} tài liệu</span>}
                </div>
                <div className="emgpt-composer-right">
                  <span className="emgpt-char-count">{question.length}/500</span>
                  {asking && useStreaming ? <button type="button" className="emgpt-send-btn" onClick={stopGeneration} aria-label="Dừng tạo câu trả lời" title="Dừng tạo">■</button>
                    : <button type="submit" className="emgpt-send-btn" disabled={busy || !ready || question.trim().length < 3} aria-label="Gửi câu hỏi" title="Gửi câu hỏi">↑</button>}
                </div>
              </div>
            </form>
            <div className="emgpt-composer-footer"><label><input type="checkbox" checked={useStreaming} disabled={asking} onChange={e => setUseStreaming(e.target.checked)} /> Trả lời từng phần</label><span>Enter để gửi · Shift+Enter xuống dòng · AI có thể mắc lỗi, hãy kiểm tra nguồn.</span></div>
          </div>
        </> : <div className="em30-summary-scroll">
          <div className="em30-summary-heading"><span className="em30-kicker">CHẾ ĐỘ TÓM TẮT</span><h2>Biến tài liệu thành ghi chú dễ học</h2>
            <p>Chọn độ dài tóm tắt, tạo bản mới hoặc mở lại bản đã lưu từ MySQL.</p></div>
          <div className="em30-summary-controls">
            <div><label className="em30-label" htmlFor="em30-level">Độ dài ghi chú</label>
              <select id="em30-level" className="em30-select" disabled={busy} value={summaryLevel} onChange={e => setSummaryLevel(e.target.value as "short" | "detailed")}>
                <option value="short">Ngắn gọn · Ý chính</option><option value="detailed">Chi tiết · Ôn tập sâu</option>
              </select></div>
            <button type="button" className="em30-primary" onClick={handleSummarize} disabled={busy || !ready}>{summarizing ? "Đang tạo tóm tắt…" : "✦ Tạo bản tóm tắt mới"}</button>
          </div>
          {summarizing && <div className="em30-thinking" role="status">AI đang đọc và tổng hợp nội dung. Với tài liệu dài, quá trình này có thể mất vài phút.</div>}
          <section className="em30-history"><div className="em30-section-title"><h3>◷ Lịch sử tóm tắt</h3><span>{historyForDocument === documentId ? savedSummaries.length : 0} bản</span></div>
            {historyForDocument !== documentId ? <p className="em30-muted">Đang tải lịch sử…</p> : savedSummaries.length === 0 ? <p className="em30-muted">Chưa có bản tóm tắt nào cho tài liệu này.</p>
            : <ul>{savedSummaries.map(item => <li key={item.id}>
              <div><strong>{item.level === "short" ? "Tóm tắt ngắn gọn" : "Tóm tắt chi tiết"}</strong><small>{humanDate(item.createdAtUtc)} {item.isPartial ? "· Một phần tài liệu" : ""}</small></div>
              <div className="em30-history-actions"><button type="button" disabled={busy} onClick={() => void openSavedSummary(item.id)}>Xem lại</button>
                <button type="button" className="danger" disabled={busy} onClick={() => void removeSavedSummary(item.id)}>Xóa</button></div>
            </li>)}</ul>}
          </section>
          {activeSummary ? <article className="em30-summary-result" aria-live="polite">
            <div className="em30-section-title"><h3>✦ Nội dung tóm tắt {activeSummary.id ? `#${activeSummary.id}` : ""}</h3>
              <div className="em30-summary-result-actions"><button type="button" onClick={() => void copyContent(activeSummary.summary)}>▢ Sao chép</button><button type="button" onClick={downloadSummary}>↓ Tải .txt</button></div></div>
            {activeSummary.coverage.isPartial && <div className="em30-alert em30-alert-warning">Bản tóm tắt dùng {activeSummary.coverage.sampledChunks}/{activeSummary.coverage.totalChunks} đoạn, không bao phủ toàn bộ tài liệu.</div>}
            <div className="em30-summary-text">{activeSummary.summary}</div>
            <p className="em30-muted">{activeSummary.coverage.note}</p>
            <section className="em30-sources"><h3>▤ Những đoạn tài liệu được sử dụng <span>{activeSummary.sources.length}</span></h3>
              <div className="em30-sources-list">{activeSummary.sources.map((source, i) => <div className="em30-source" key={`${source.pageNumber}-${source.chunkIndex}-${i}`}>
                <div className="em30-source-top"><strong>{sourceLabel} {source.pageNumber} · Đoạn {source.chunkIndex + 1}</strong>
                  <button className="emc-open-source" type="button" onClick={e => openSource({ ...source, documentId: documentId! }, e.currentTarget)}>{isWord ? "Xem đoạn Word" : "Xem cạnh tóm tắt"} ↗</button></div>
                <p>{source.excerpt}</p></div>)}</div>
            </section>
          </article> : <div className="em30-summary-placeholder"><span aria-hidden="true">▤</span><strong>Ghi chú học tập sẽ xuất hiện tại đây</strong><p>Bản tóm tắt mới cũng được lưu vào lịch sử MySQL để bạn xem lại.</p></div>}
        </div> }
      </main>

      {documentPanelOpen && <div className="emgpt-doc-overlay">
        <button type="button" className="emgpt-doc-scrim" aria-label="Đóng danh sách tài liệu" onClick={() => setDocumentPanelOpen(false)} />
        <aside ref={documentPanelRef} className="emgpt-doc-panel" role="dialog" aria-modal="true" aria-label="Chọn tài liệu kiến thức">
          <div className="emgpt-doc-head"><div><span>NGUỒN KIẾN THỨC</span><h2>Tài liệu của bạn</h2><p>Gia sư AI chỉ trả lời dựa trên nội dung đã xử lý.</p></div>
            <button type="button" className="emgpt-icon-btn" onClick={() => setDocumentPanelOpen(false)} aria-label="Đóng danh sách tài liệu">×</button></div>
          {loadingDocs ? <p className="em30-muted" role="status">Đang tải danh sách…</p>
          : documents.length === 0 ? <div className="emgpt-no-document"><strong>Chưa có tài liệu</strong><p>Hãy tải file Word hoặc PDF lên kho tài liệu trước khi đặt câu hỏi.</p><Link to="/app/documents">Đến kho tài liệu ↗</Link></div>
          : <>
            <label className="emgpt-field-label" htmlFor="emgpt-document">Tài liệu chính</label>
            <select id="emgpt-document" className="em30-select" value={documentId ?? ""} disabled={busy} onChange={e => chooseDocument(Number(e.target.value))}>
              {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
            </select>
            {selectedDocument && <div className="emgpt-selected-document">
              <span className="emgpt-doc-icon">{isWord ? "DOCX" : "PDF"}</span>
              <div><strong title={selectedDocument.originalFileName}>{selectedDocument.originalFileName}</strong><small>{(selectedDocument.sizeBytes / 1024).toFixed(1)} KB</small></div>
            </div>}
            <div className={`emgpt-doc-status ${ready ? "ready" : ""}`}><span aria-hidden="true">●</span>{ready ? "Đã sẵn sàng để hỏi" : "Cần xử lý tài liệu"}</div>
            <button type="button" className="em30-index-btn" disabled={busy || !documentId} onClick={() => void handleIndex()}>{indexing ? "Đang xử lý…" : ready ? "↻ Xử lý lại tài liệu" : "✦ Xử lý tài liệu"}</button>
            {documentId && <a className="emgpt-original-link" href={getDocumentFileUrl(documentId)} target="_blank" rel="noreferrer">{isWord ? "↗ Mở file Word gốc" : "↗ Xem file PDF gốc"}</a>}
            {mode === "ask" && documents.length > 1 && <fieldset className="emgpt-multidoc" disabled={busy}>
              <legend>Thêm tài liệu tham khảo (tối đa 5)</legend>
              {documents.filter(doc => doc.id !== documentId).map(doc => <label key={doc.id}>
                <input type="checkbox" checked={additionalDocuments.includes(doc.id)}
                  disabled={busy || (!additionalDocuments.includes(doc.id) && additionalDocuments.length >= 4) || doc.status.toLowerCase() !== "ready"}
                  onChange={event => setAdditionalDocuments(old => event.target.checked ? [...old, doc.id] : old.filter(id => id !== doc.id))} />
                <span title={doc.originalFileName}>{doc.originalFileName}</span>
                <small>{doc.status.toLowerCase() === "ready" ? "Sẵn sàng" : "Chưa xử lý"}</small>
              </label>)}
            </fieldset>}
            <p className="emgpt-doc-note">Xử lý lại sẽ thay thế chỉ mục đã lưu. Bạn có thể tải lên tài liệu khác trong <Link to="/app/documents">Kho tài liệu</Link>.</p>
          </>}
        </aside>
      </div>}
      {selectedSource && <button type="button" className="emc-source-backdrop" aria-label="Đóng phần xem nguồn" onClick={closeSource} />}
      {selectedSource && <DocumentSidePanel key={`${selectedSource.documentId}-${selectedSource.pageNumber}-${selectedSource.chunkIndex}`} source={selectedSource}
        document={documents.find(d => d.id === (selectedSource.documentId ?? documentId))} onClose={closeSource} />}
      </section>
    </div>
  );
}
