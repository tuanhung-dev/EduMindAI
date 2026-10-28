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
import "./AiTutorPage.css";
import "./RagGroupA.css";

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
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [chatGroup, setChatGroup] = useState<"all" | "pinned">("all");
  const [selectedSource, setSelectedSource] = useState<AiAnswer["sources"][number] | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
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
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nextTurnRef = useRef(1);

  useEffect(() => {
    let live = true;
    getDocuments()
      .then(items => { if (live) setDocuments(items); })
      .catch(err => { if (live) setError(friendlyError(err, "Không tải được kho tài liệu.")); })
      .finally(() => { if (live) setLoadingDocs(false); });
    return () => { live = false; };
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

  // Lịch sử tóm tắt được lưu trên Backend; phần hội thoại hỏi đáp chỉ nằm trong tab hiện tại.
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
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns, asking, mode]);

  function chooseDocument(id: number) {
    if (busy) return;
    setSearchParams({ documentId: String(id) });
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
    if (prompt.length < 3 || prompt.length > 500) {
      setError("Câu hỏi cần dài từ 3 đến 500 ký tự."); return;
    }
    const turnId = nextTurnRef.current++;
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
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, []);

  function newConversation() {
    if (busy) return;
    setTurns([]); setActiveChatId(null); setQuestion(""); setError(""); setNotice(""); setSelectedSource(null);
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
    <section className={`em30-tutor ${selectedSource ? "emc-tutor-with-source" : ""}`} aria-label="Không gian Gia sư AI">
      <aside className="em30-docrail" aria-label="Tài liệu học tập">
        <div className="em30-rail-heading">
          <span className="em30-kicker">NGUỒN KIẾN THỨC</span>
          <h2>Tài liệu của bạn</h2>
          <p>Chọn PDF hoặc Word để Gia sư AI tham khảo khi trả lời.</p>
        </div>
        {loadingDocs ? <p className="em30-muted" role="status">Đang tải tài liệu…</p>
        : documents.length === 0 ? <div className="em30-empty-doc">
          <span aria-hidden="true">▤</span><strong>Chưa có tài liệu</strong>
          <p>Thêm PDF hoặc Word (.docx) vào thư viện để bắt đầu học cùng AI.</p>
          <Link to="/app/documents" className="em30-secondary-link">Tải tài liệu lên ↗</Link>
        </div> : <>
          <label htmlFor="em30-document" className="em30-label">Tài liệu đang sử dụng</label>
          <select id="em30-document" className="em30-select" disabled={busy} value={documentId ?? ""}
            onChange={e => chooseDocument(Number(e.target.value))}>
            {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
          </select>
          {mode === "ask" && documents.length > 1 && <fieldset className="emai-multidoc" disabled={busy}>
            <legend>Hỏi thêm từ tài liệu khác (tối đa 5)</legend>
            {documents.filter(doc => doc.id !== documentId).map(doc =>
              <label key={doc.id}><input type="checkbox" checked={additionalDocuments.includes(doc.id)}
                disabled={busy || (!additionalDocuments.includes(doc.id) && additionalDocuments.length >= 4) || doc.status.toLowerCase() !== "ready"}
                onChange={event => setAdditionalDocuments(old => event.target.checked
                  ? [...old, doc.id] : old.filter(id => id !== doc.id))} />
                <span title={doc.originalFileName}>{doc.originalFileName}</span>
              </label>)}
          </fieldset>}
          {selectedDocument && <div className="em30-file">
            <div className="em30-pdf-icon" aria-hidden="true">{isWord ? "DOCX" : "PDF"}</div>
            <div className="em30-file-info"><strong title={selectedDocument.originalFileName}>{selectedDocument.originalFileName}</strong>
              <small>{(selectedDocument.sizeBytes / 1024).toFixed(1)} KB</small></div>
          </div>}
          <div className={`em30-index-state ${ready ? "em30-is-ready" : ""}`}>
            <span className="em30-status-dot" aria-hidden="true" />
            <span>{ready ? "Đã sẵn sàng để hỏi" : "Cần xử lý tài liệu"}</span>
          </div>
          <button type="button" className="em30-index-btn" onClick={handleIndex} disabled={busy || !documentId}>
            {indexing ? "Đang xử lý tài liệu…" : ready ? "↻ Xử lý lại tài liệu" : "✦ Xử lý tài liệu"}
          </button>
          {documentId && <a className="em30-file-link" href={getDocumentFileUrl(documentId)} target="_blank" rel="noreferrer">{isWord ? "↗ Tải Word gốc" : "↗ Xem PDF gốc"}</a>}
          <p className="em30-muted em30-source-hint">Chỉ mục tài liệu giúp AI tìm các đoạn liên quan. Xử lý lại sẽ thay thế những đoạn đã lưu trước đó.</p>
        </>}
        <div className="em30-chat-history-rail emc-history">
          <div className="em30-section-title"><h3>◷ Lịch sử trò chuyện</h3><span>{chatSessions.length}</span></div>
          <label htmlFor="emc-chat-search" className="em30-sr-only">Tìm theo tên hội thoại</label>
          <div className="emc-search-row">
            <input ref={searchRef} id="emc-chat-search" type="search" value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Tìm hội thoại…" />
            <button ref={searchTriggerRef} type="button" title="Tìm hội thoại (Ctrl+K)" aria-label="Đặt con trỏ vào ô tìm hội thoại" onClick={() => searchRef.current?.focus()}>⌕</button>
          </div>
          <div className="emc-history-filters" role="group" aria-label="Lọc lịch sử">
            <button type="button" aria-pressed={chatGroup === "all"} className={chatGroup === "all" ? "selected" : ""} onClick={() => setChatGroup("all")}>Tất cả</button>
            <button type="button" aria-pressed={chatGroup === "pinned"} className={chatGroup === "pinned" ? "selected" : ""} onClick={() => setChatGroup("pinned")}>Đã ghim</button>
          </div>
          {loadingChats ? <p className="em30-muted" role="status">Đang tải hội thoại…</p>
          : chatSessions.length === 0 ? <p className="em30-muted">Chưa có hội thoại. Hãy đặt câu hỏi đầu tiên.</p>
          : historyGroups.length === 0 ? <p className="em30-muted">Không tìm thấy hội thoại phù hợp.</p>
          : <div className="em30-chat-history-list emc-history-list">{historyGroups.map(([groupName, chats]) => <section key={groupName} aria-label={groupName}>
            <h4 className="emc-history-group">{groupName}</h4>
            {chats.map(chat => <div className={`em30-chat-history-item emc-history-item ${activeChatId === chat.id ? "selected" : ""}`} key={chat.id}>
              {renamingChatId === chat.id ? <form className="emc-rename" onSubmit={e => { e.preventDefault(); void saveChatTitle(chat.id); }}>
                <label className="em30-sr-only" htmlFor={`emc-name-${chat.id}`}>Tên hội thoại</label>
                <input id={`emc-name-${chat.id}`} maxLength={180} autoFocus value={renamingTitle} onChange={e => setRenamingTitle(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRenamingChatId(null); } }} />
                <button type="submit" disabled={busy} aria-label="Lưu tên hội thoại">✓</button>
                <button type="button" onClick={() => setRenamingChatId(null)} aria-label="Hủy đổi tên">×</button>
              </form> : <>
                <button type="button" className="emc-history-open" disabled={busy || loadingChats} onClick={() => void openConversation(chat.id)} aria-current={activeChatId === chat.id ? "true" : undefined} title={chat.title}>{chat.isPinned ? "📌 " : ""}{chat.title}</button>
                <div className="emc-history-actions">
                  <button type="button" disabled={busy || loadingChats} aria-label={`Đổi tên ${chat.title}`} title="Đổi tên" onClick={() => { setRenamingChatId(chat.id); setRenamingTitle(chat.title); }}>✎</button>
                  <button type="button" disabled={busy || loadingChats} aria-label={chat.isPinned ? `Bỏ ghim ${chat.title}` : `Ghim ${chat.title}`} title={chat.isPinned ? "Bỏ ghim" : "Ghim"} onClick={() => void toggleChatPin(chat)}>{chat.isPinned ? "◇" : "♧"}</button>
                  <button type="button" disabled={busy || loadingChats} aria-label={`Xóa hội thoại ${chat.title}`} title="Xóa" onClick={() => void removeConversation(chat.id)}>×</button>
                </div>
              </>}
            </div>)}
          </section>)}</div>}
        </div>
        <div className="em30-rail-bottom">
          <span className="em30-rail-bottom-icon" aria-hidden="true">✦</span>
          <div><strong>AI học từ tài liệu</strong><small>Câu trả lời có thể sai. Hãy đối chiếu các trang nguồn.</small></div>
        </div>
      </aside>

      <div className="em30-workspace">
        <header className="em30-chat-header">
          <div className="em30-heading">
            <div className="em30-heading-icon" aria-hidden="true">✦</div>
            <div><span>EDUMIND ASSISTANT</span><h1>Gia sư AI</h1></div>
          </div>
          <div className="em30-header-actions">
            <span className="em30-model-chip"><span aria-hidden="true" /> Trả lời từ tài liệu</span>
            {mode === "ask" && <button type="button" className="em30-ghost-btn" onClick={newConversation} disabled={busy || loadingChats || (visibleTurns.length === 0 && !activeChatId)} title="Bắt đầu hội thoại mới (không xóa lịch sử trước đó)">＋ Cuộc trò chuyện mới</button>}
          </div>
        </header>
        <div className="em30-tabbar" role="group" aria-label="Chọn công cụ Gia sư AI">
          <button className={mode === "ask" ? "em30-tab active" : "em30-tab"} type="button" disabled={busy} onClick={() => switchMode("ask")}>✧ Hỏi đáp tài liệu</button>
          <button className={mode === "summary" ? "em30-tab active" : "em30-tab"} type="button" disabled={busy} onClick={() => switchMode("summary")}>▤ Tóm tắt PDF</button>
        </div>
        {error && <div className="em30-alert em30-alert-error" role="alert">{error}</div>}
        {notice && <div className="em30-alert em30-alert-ok" role="status">{notice}</div>}

        {mode === "ask" ? <>
          <div className="em30-chat-scroll" role="log" aria-label="Các câu hỏi và câu trả lời được lưu" aria-live="polite">
            {visibleTurns.length === 0 && <div className="em30-welcome">
              <div className="em30-welcome-mark" aria-hidden="true">✦</div>
              <span className="em30-kicker">KHÔNG GIAN HỌC TẬP CỦA BẠN</span>
              <h2>Hôm nay bạn muốn tìm hiểu điều gì?</h2>
              <p>Hỏi bất kỳ điều gì về tài liệu đã chọn. Mình sẽ giúp bạn tìm ý chính, giải thích khái niệm và chỉ ra nguồn tài liệu liên quan.</p>
              <div className="em30-suggestions">
                {prompts.map(item => <button key={item.question} type="button" disabled={busy || !documentId}
                  onClick={() => { setQuestion(item.question); composerRef.current?.focus(); }}>
                  <span className="em30-suggestion-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span><span className="em30-suggestion-arrow" aria-hidden="true">↗</span>
                </button>)}
              </div>
            </div>}
            {visibleTurns.length > 0 && <div className="em30-messages">
              {visibleTurns.map(turn => <div className="em30-turn" key={turn.id}>
                <div className="em30-user-row"><div className="em30-user-bubble">{turn.prompt}</div><span className="em30-user-avatar" aria-hidden="true">B</span></div>
                <div className="em30-assistant-row">
                  <span className="em30-ai-avatar" aria-hidden="true">✦</span>
                  <div className="em30-assistant-body">
                    <strong className="em30-ai-name">EduMind AI</strong>
                    {turn.result ? <>
                      <div className="em30-ai-content">{turn.result.answer}</div>
                      <button className="em30-copy" type="button" onClick={() => void copyContent(turn.result!.answer)}>▢ Sao chép trả lời</button>
                      <section className="em30-sources" aria-label="Nguồn tài liệu">
                        <h3>▤ Nguồn tham khảo trong tài liệu <span>{turn.result.sources.length}</span></h3>
                        {turn.result.sources.length ? <div className="em30-sources-list">
                          {turn.result.sources.map((source, i) => <div className="em30-source" key={`${source.pageNumber}-${source.chunkIndex}-${i}`}>
                            <div className="em30-source-top"><strong>{source.documentName ? `${source.documentName} · ` : ""}{source.citation ?? `${sourceLabel} ${source.pageNumber}`} · Đoạn {source.chunkIndex + 1}</strong>
                              <button className="emc-open-source" type="button" onClick={e => openSource({ ...source, documentId: source.documentId ?? documentId! }, e.currentTarget)}>Xem cạnh chat ↗</button></div>
                            <p>{source.excerpt}</p>
                          </div>)}
                        </div> : <p className="em30-muted">Không có đoạn nguồn phù hợp được trả về. Hãy kiểm tra câu trả lời trước khi sử dụng.</p>}
                      </section>
                    </> : turn.failure ? <div className="em30-answer-error" role="alert"><p>{turn.failure}</p>
                      <button type="button" disabled={busy} onClick={() => void sendPrompt(turn.prompt)}>↻ Thử lại câu hỏi</button>
                    </div> : <div className="em30-thinking" role="status">{turn.partial
                      ? <div className="em30-ai-content">{turn.partial}<span className="emai-cursor">▍</span></div>
                      : <><span className="em30-thinking-dots" aria-hidden="true">•••</span> Đang tìm thông tin trong tài liệu và tạo câu trả lời…</>}</div>}
                  </div>
                </div>
              </div>)}
            </div>}
            <div ref={chatEndRef} />
          </div>
          <div className="em30-composer-wrap">
            <form className="em30-composer" onSubmit={handleAsk}>
              <label className="em30-sr-only" htmlFor="em30-question">Nhập câu hỏi cho Gia sư AI</label>
              <textarea ref={composerRef} id="em30-question" rows={2} maxLength={500} value={question}
                disabled={busy || !documentId} onChange={e => setQuestion(e.target.value)} onKeyDown={handleComposerKeyDown}
                placeholder={documentId ? "Hỏi bất kỳ điều gì về tài liệu của bạn…" : "Chọn PDF hoặc Word trước để đặt câu hỏi"} />
              <div className="em30-composer-actions"><span>↵ Gửi · Shift+Enter xuống dòng <small>{question.length}/500</small></span>
                {asking && useStreaming
                  ? <button type="button" onClick={stopGeneration} aria-label="Dừng tạo câu trả lời" title="Dừng và không lưu phần đang tạo">■</button>
                  : <button type="submit" disabled={busy || !documentId || question.trim().length < 3} aria-label="Gửi câu hỏi">{asking ? "…" : "↑"}</button>}</div>
            </form>
            <label className="emai-stream-toggle"><input type="checkbox" checked={useStreaming} disabled={asking} onChange={e => setUseStreaming(e.target.checked)} />
              Trả lời từng phần (Ollama) · tắt nếu đang dùng OpenAI</label>
            <p>Gia sư AI nhớ các lượt gần đây trong từng cuộc trò chuyện và lưu lịch sử riêng vào MySQL. Nguồn Word được trích dẫn theo phần văn bản, không phải trang thực.</p>
          </div>
        </> : <div className="em30-summary-scroll">
          <div className="em30-summary-heading"><span className="em30-kicker">CHẾ ĐỘ TÓM TẮT</span><h2>Biến tài liệu thành ghi chú dễ học</h2>
            <p>Chọn độ dài tóm tắt, tạo bản mới hoặc mở lại bản đã lưu từ MySQL.</p></div>
          <div className="em30-summary-controls">
            <div><label className="em30-label" htmlFor="em30-level">Độ dài ghi chú</label>
              <select id="em30-level" className="em30-select" disabled={busy} value={summaryLevel} onChange={e => setSummaryLevel(e.target.value as "short" | "detailed")}>
                <option value="short">Ngắn gọn · Ý chính</option><option value="detailed">Chi tiết · Ôn tập sâu</option>
              </select></div>
            <button type="button" className="em30-primary" onClick={handleSummarize} disabled={busy || !documentId}>{summarizing ? "Đang tạo tóm tắt…" : "✦ Tạo bản tóm tắt mới"}</button>
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
        </div>}
      </div>
      {selectedSource && <button type="button" className="emc-source-backdrop" aria-label="Đóng phần xem nguồn" onClick={closeSource} />}
      {selectedSource && <DocumentSidePanel key={`${selectedSource.documentId}-${selectedSource.pageNumber}-${selectedSource.chunkIndex}`} source={selectedSource}
        document={documents.find(d => d.id === (selectedSource.documentId ?? documentId))} onClose={closeSource} />}
    </section>
  );
}
