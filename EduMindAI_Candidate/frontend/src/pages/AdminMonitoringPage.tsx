import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  checkAiProvider, getMonitoringOverview,
  type AiProbe, type MonitoringDays, type MonitoringOverview,
} from "../services/adminMonitoringService";
import "./AdminMonitoringPage.css";

type Section = "overview" | "ai" | "documents";

const integer = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
function date(value: string | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateFormatter.format(parsed);
}
function formatInt(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? integer.format(value) : "—";
}
function statusLabel(value: string): string {
  const map: Record<string, string> = {
    online: "Hoạt động", offline: "Không kết nối", model_missing: "Thiếu model",
    not_checked: "Chưa kiểm tra", invalid_configuration: "Sai cấu hình",
    Ready: "Sẵn sàng", Queued: "Đang chờ", Processing: "Đang xử lý", Failed: "Thất bại",
  };
  return map[value] || value;
}
function requestLabel(value: string): string {
  return ({ chat: "Hỏi Gia sư AI", "quiz-generation": "Sinh đề thi AI", summarization: "Tóm tắt tài liệu" } as Record<string, string>)[value] || value;
}
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}
function TableLegend() {
  return <div className="am06-legend">
    <span><i className="am06-dot am06-dot--chat" /> Phản hồi chat đã lưu</span>
    <span><i className="am06-dot am06-dot--summary" /> Bản tóm tắt</span>
    <span><i className="am06-dot am06-dot--quiz" /> Đề thi được tạo</span>
    <span><i className="am06-dot am06-dot--attempt" /> Bài đã nộp</span>
  </div>;
}

export default function AdminMonitoringPage() {
  const [section, setSection] = useState<Section>("overview");
  const [days, setDays] = useState<MonitoringDays>(7);
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [probe, setProbe] = useState<AiProbe | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [probeError, setProbeError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getMonitoringOverview(days, controller.signal).then(result => {
      if (!controller.signal.aborted) { setOverview(result); setError(""); }
    }).catch(err => {
      if (!isAbort(err)) setError(message(err));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, refreshIndex]);

  useEffect(() => {
    const controller = new AbortController();
    checkAiProvider(controller.signal).then(setProbe).catch(err => {
      if (!isAbort(err)) setProbeError(message(err));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefreshIndex(i => i + 1);
    }, 60000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshIndex(v => v + 1);
  }, []);

  const refreshAi = useCallback(async () => {
    setChecking(true);
    setProbeError("");
    try { setProbe(await checkAiProvider()); }
    catch (err) { setProbeError(message(err)); }
    finally { setChecking(false); }
  }, []);

  const maxDaily = useMemo(() => {
    if (!overview) return 1;
    return Math.max(1, ...overview.timeline.map(x =>
      x.chatAnswers + x.summaries + x.quizzesCreated + x.attemptsSubmitted));
  }, [overview]);

  const doc = overview?.documents;
  const activity = overview?.activity;
  const runtime = overview?.runtime;
  const showWarning = !!doc && (doc.failed > 0 || doc.olderThanOneHourPending > 0 || doc.missingOwner > 0);

  return <div className="am06-page">
    <div className="am06-hero">
      <div>
        <div className="am06-eyebrow">EDUMIND AI / ADMIN-06</div>
        <h1>Giám sát AI &amp; hệ thống</h1>
        <p>Theo dõi dịch vụ AI, dữ liệu học tập và các tài liệu cần xử lý trên toàn hệ thống.</p>
        <div className="am06-hero-meta"><span>● Chỉ tài khoản Admin</span><span>● Số liệu từ API thật</span><span>● Không hiển thị nội dung riêng tư</span></div>
      </div>
      <div className="am06-hero-actions">
        <button type="button" className="am06-btn am06-btn--light" onClick={refresh} disabled={loading}>
          {loading ? "Đang tải..." : "↻ Làm mới"}
        </button>
        <span className="am06-updated">Cập nhật: {date(overview?.checkedAtUtc)}</span>
      </div>
    </div>

    <nav className="am06-tabs" aria-label="Các khu vực giám sát">
      {([
        ["overview", "Tổng quan"], ["ai", "Dịch vụ AI"], ["documents", "Cảnh báo tài liệu"],
      ] as const).map(([value, title]) => (
        <button type="button" key={value} aria-pressed={section === value}
          className={`am06-tab ${section === value ? "am06-tab--active" : ""}`}
          onClick={() => setSection(value)}>{title}</button>
      ))}
    </nav>

    <div className="am06-controls">
      <label>Khoảng thời gian biểu đồ
        <select value={days} onChange={e => { setDays(Number(e.target.value) as MonitoringDays); setLoading(true); }}>
          <option value={7}>7 ngày</option><option value={30}>30 ngày</option>
        </select>
      </label>
      <label className="am06-check"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Tự cập nhật mỗi 60 giây</label>
    </div>

    {error && <div className="am06-error" role="alert"><strong>Không tải được dữ liệu</strong><p>{error}</p><button type="button" onClick={refresh}>Thử lại</button></div>}
    {loading && !overview && <div className="am06-skeleton" role="status">Đang lấy số liệu giám sát từ Backend...</div>}

    {overview && <>
      {section === "overview" && <>
        <div className="am06-stats">
          {[
            ["Tài liệu", doc?.total, "Học liệu trong MySQL"],
            ["Tài liệu Ready", doc?.ready, "Đã sẵn sàng lập chỉ mục"],
            ["Phản hồi chat", activity?.savedAssistantReplies, "Đã được lưu trong MySQL"],
            ["Bản tóm tắt", activity?.savedSummaries, "Tổng số đã lưu"],
            ["Đề thi AI", activity?.generatedQuizzes, "Tổng số đề đã tạo"],
            ["Bài đã nộp", activity?.submittedAttempts, "Có kết quả luyện thi"],
          ].map(([label, value, description]) => <article className="am06-stat" key={String(label)}>
            <span>{label}</span><strong>{formatInt(value as number | undefined)}</strong><small>{description}</small>
          </article>)}
        </div>
        <div className="am06-grid">
          <section className="am06-panel am06-panel--wide">
            <div className="am06-panel-heading"><div><h2>Hoạt động đã lưu</h2><p>Số bản ghi theo ngày; không phải số token hoặc chi phí.</p></div><span>{days} ngày</span></div>
            <TableLegend />
            <div className="am06-chart" role="img" aria-label="Biểu đồ hoạt động chat, tóm tắt, đề thi và bài nộp">
              {overview.timeline.map(day => {
                const amounts = [day.chatAnswers, day.summaries, day.quizzesCreated, day.attemptsSubmitted];
                const total = amounts.reduce((a, b) => a + b, 0);
                return <div className="am06-chart-col" key={day.date} title={`${day.date}: ${total} hoạt động`}>
                  <div className="am06-bar-track" aria-hidden="true">
                    {amounts.map((n, idx) => <div key={idx} className={`am06-bar am06-bar--${idx}`}
                      style={{ height: `${(n / maxDaily) * 100}%` }} />)}
                  </div>
                  <span>{days === 7 ? day.date.slice(8) + "/" + day.date.slice(5, 7) : day.date.slice(8)}</span>
                </div>;
              })}
            </div>
            {overview.timeline.every(day => day.chatAnswers + day.summaries + day.quizzesCreated + day.attemptsSubmitted === 0) &&
              <p className="am06-muted">Chưa có hoạt động được lưu trong khoảng thời gian đã chọn.</p>}
          </section>
          <section className="am06-panel">
            <div className="am06-panel-heading"><div><h2>Tình trạng học liệu</h2><p>Trạng thái hiện tại của tài liệu</p></div></div>
            {[ ["Ready", doc?.ready], ["Queued", doc?.queued], ["Processing", doc?.processing], ["Failed", doc?.failed], ["Khác", doc?.other] ].map(([name, count]) =>
              <div className="am06-progress-row" key={name as string}>
                <div><span>{statusLabel(name as string)}</span><strong>{formatInt(count as number)}</strong></div>
                <div className="am06-progress-track"><div style={{ width: `${doc?.total ? (Number(count) / doc.total) * 100 : 0}%` }} /></div>
              </div>)}
            <p className="am06-panel-footer">{formatInt(doc?.indexedChunks)} đoạn trích xuất đã lưu · {formatInt(activity?.chatSessions)} cuộc chat</p>
          </section>
        </div>
        <section className={`am06-notice ${showWarning ? "am06-notice--warning" : ""}`}>
          <strong>{showWarning ? "Cần kiểm tra dữ liệu" : "Chưa thấy cảnh báo tài liệu"}</strong>
          <p>{doc?.failed ?? 0} tài liệu Failed · {doc?.olderThanOneHourPending ?? 0} tài liệu đang chờ/xử lý đã tải lên hơn 1 giờ · {doc?.missingOwner ?? 0} tài liệu thiếu chủ sở hữu.</p>
          <button type="button" onClick={() => setSection("documents")}>Xem danh sách cần xử lý →</button>
        </section>
      </>}

      {section === "ai" && <div className="am06-grid">
        <section className="am06-panel">
          <div className="am06-panel-heading"><div><h2>Trạng thái nhà cung cấp AI</h2><p>Kiểm tra không sinh nội dung và không sử dụng token</p></div></div>
          <div className="am06-provider"><span className="am06-muted">Nhà cung cấp</span><strong>{overview.provider}</strong></div>
          <div className="am06-provider"><span className="am06-muted">Model đang cấu hình</span><strong>{overview.configuredModel}</strong></div>
          <div className="am06-provider"><span className="am06-muted">Trạng thái</span><strong className={`am06-status am06-status--${probe?.status || "unknown"}`}>{probe ? statusLabel(probe.status) : "Chưa kiểm tra"}</strong></div>
          <div className="am06-provider"><span className="am06-muted">Số model Ollama</span><strong>{probe?.installedModelCount ?? "—"}</strong></div>
          <div className="am06-provider"><span className="am06-muted">Độ trễ kiểm tra</span><strong>{probe?.latencyMs == null ? "—" : `${probe.latencyMs} ms`}</strong></div>
          <p className="am06-muted">{probe?.note || "Chọn Kiểm tra AI để kiểm tra kết nối."}</p>
          {probeError && <p className="am06-inline-error" role="alert">{probeError}</p>}
          <button type="button" onClick={() => void refreshAi()} className="am06-btn am06-btn--primary" disabled={checking}>{checking ? "Đang kiểm tra..." : "↻ Kiểm tra AI"}</button>
          <p className="am06-caption">OpenAI được ghi “Chưa kiểm tra” để tránh gọi API có thể tính phí. Ollama chỉ được thử GET /api/tags ở địa chỉ loopback.</p>
        </section>
        <section className="am06-panel">
          <div className="am06-panel-heading"><div><h2>Thống kê request AI</h2><p>Đếm ở mức HTTP từ lúc Backend bắt đầu chạy</p></div></div>
          <div className="am06-metrics">
            <div><span>Tổng request</span><strong>{formatInt(runtime?.requests)}</strong></div>
            <div><span>HTTP thành công</span><strong>{formatInt(runtime?.success)}</strong></div>
            <div><span>HTTP lỗi</span><strong>{formatInt(runtime?.failed)}</strong></div>
            <div><span>Thời gian TB</span><strong>{formatInt(runtime?.averageDurationMs)} ms</strong></div>
          </div>
          <p className="am06-caption">Bộ đếm bắt đầu: {date(runtime?.startedAtUtc)}. Không phải thống kê token. Streaming có thể trả HTTP 200 dù sinh nội dung bị gián đoạn.</p>
          {runtime?.byCategory.length ? <div className="am06-list">
            {runtime.byCategory.map(item => <div className="am06-list-row" key={item.kind}>
              <strong>{requestLabel(item.kind)}</strong><span>{item.requests} lượt · {item.failed} lỗi · {item.averageDurationMs} ms TB</span>
            </div>)}
          </div> : <p className="am06-muted">Chưa ghi nhận request AI nào kể từ lần khởi động Backend.</p>}
        </section>
        <section className="am06-panel am06-panel--wide">
          <div className="am06-panel-heading"><div><h2>Lỗi HTTP AI gần đây</h2><p>Chỉ lưu loại chức năng, mã HTTP và thời gian — không lưu hội thoại</p></div></div>
          {runtime?.recentFailures.length ? <div className="am06-table-wrap"><table className="am06-table"><thead><tr><th>Chức năng</th><th>Mã HTTP</th><th>Thời gian</th></tr></thead>
            <tbody>{runtime.recentFailures.map((failure, i) => <tr key={`${failure.atUtc}-${i}`}><td>{requestLabel(failure.kind)}</td><td>{failure.status}</td><td>{date(failure.atUtc)}</td></tr>)}</tbody></table></div>
            : <p className="am06-muted">Chưa có lỗi HTTP AI nào được ghi nhận trong bộ nhớ.</p>}
        </section>
      </div>}

      {section === "documents" && <div className="am06-grid">
        <section className="am06-panel am06-panel--wide">
          <div className="am06-panel-heading"><div><h2>Tài liệu cần rà soát</h2><p>Tối đa 12 tài liệu Failed hoặc đang chờ/xử lý hơn 1 giờ từ lúc tải.</p></div>
            <Link to="/app/admin/documents" className="am06-link">Quản lý tài liệu →</Link></div>
          {overview.issues.length === 0 ? <div className="am06-empty">Không có tài liệu thuộc các nhóm cảnh báo hiện tại.</div>
            : <div className="am06-table-wrap"><table className="am06-table"><thead><tr><th>ID</th><th>Tên file</th><th>Trạng thái</th><th>Ngày tải</th></tr></thead><tbody>
              {overview.issues.map(issue => <tr key={issue.id}><td>#{issue.id}</td><td className="am06-filename">{issue.originalFileName}</td>
                <td><span className={`am06-status am06-status--${issue.status.toLowerCase()}`}>{statusLabel(issue.status)}</span></td><td>{date(issue.createdAtUtc)}</td></tr>)}
            </tbody></table></div>}
        </section>
        <section className="am06-panel am06-panel--wide">
          <h2>Hướng dẫn xử lý an toàn</h2>
          <div className="am06-guide">
            <div><strong>01 · Kiểm tra Failed</strong><p>Đối chiếu log Backend và chất lượng file. Việc xử lý lại vẫn cần tuân theo quyền sở hữu tài liệu.</p></div>
            <div><strong>02 · Kiểm tra Queued / Processing</strong><p>Kiểm tra dịch vụ chạy nền `DocumentIndexWorker`; số giờ tính từ lúc upload, không phải thời gian worker bắt đầu.</p></div>
            <div><strong>03 · Kiểm tra thiếu chủ sở hữu</strong><p>{formatInt(doc?.missingOwner)} tài liệu thiếu chủ; không tự gán hoặc xóa dữ liệu của học viên.</p></div>
          </div>
        </section>
      </div>}
    </>}

    <footer className="am06-footer">
      <strong>Phạm vi ADMIN-06:</strong> chỉ đọc và giám sát. Không tự khởi động lại AI, không xóa học liệu, không hiển thị thông tin đăng nhập, không thu thập token sử dụng.
      {overview && <p>{overview.methodology.note} {overview.methodology.statusNote}</p>}
    </footer>
  </div>;
}
