import { useEffect, useState, type FormEvent } from "react";
import { getSubjects, type Subject } from "../services/subjectService";
import { authenticatedFetch } from "../services/authService";
import WorkspaceHeader from "../components/WorkspaceHeader";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  async function reload() { setSubjects(await getSubjects()); }
  useEffect(() => {
    let active = true;
    getSubjects().then(items => { if (active) setSubjects(items); })
      .catch(() => { if (active) setError("Không tải được môn học."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const response = await authenticatedFetch("/api/subjects", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), name: name.trim(), description: "", isActive: true }) });
      if (!response.ok) throw new Error(`Không thể tạo môn học (HTTP ${response.status}).`);
      setCode(""); setName(""); await reload(); setNotice("Đã tạo môn học mới.");
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi khi tạo môn học."); }
    finally { setBusy(false); }
  }
  async function toggle(subject: Subject) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await authenticatedFetch(`/api/subjects/${subject.id}`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: subject.code, name: subject.name, description: subject.description, isActive: !subject.isActive }) });
      if (!response.ok) throw new Error(`Không cập nhật được (HTTP ${response.status}).`);
      await reload(); setNotice(`Đã ${subject.isActive ? "ẩn" : "hiện"} môn học ${subject.code}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Không cập nhật được."); }
    finally { setBusy(false); }
  }
  const filtered = subjects.filter(s => `${s.name} ${s.code}`.toLocaleLowerCase("vi-VN").includes(search.trim().toLocaleLowerCase("vi-VN")));
  return <section className="emw-admin-subjects">
    <WorkspaceHeader eyebrow="QUẢN TRỊ HỆ THỐNG" title="Quản trị môn học" icon="▧"
      description="Tạo môn học và điều chỉnh trạng thái hiển thị. Chỉ tài khoản Admin được thực hiện thay đổi." />
    {error && <p role="alert" className="emw-alert emw-alert-error">{error}</p>}
    {notice && <p role="status" className="emw-alert emw-alert-success">{notice}</p>}
    <div className="emw-admin-subjects-grid">
      <section className="emw-panel emw-admin-subjects-create">
        <span className="emw-eyebrow">THÊM MÔN HỌC</span><h2>Tạo môn học mới</h2>
        <p>Môn mới sẽ hiển thị cho học viên khi được kích hoạt.</p>
        <form onSubmit={create}>
          <label htmlFor="emw-subject-code">Mã môn học</label>
          <input id="emw-subject-code" placeholder="Ví dụ: AI101" required minLength={2} maxLength={20} value={code} onChange={e => setCode(e.target.value)} />
          <label htmlFor="emw-subject-name">Tên môn học</label>
          <input id="emw-subject-name" placeholder="Nhập tên môn học" required maxLength={150} value={name} onChange={e => setName(e.target.value)} />
          <button className="emw-button emw-button-primary" type="submit" disabled={busy}>{busy ? "Đang xử lý…" : "＋ Thêm môn học"}</button>
        </form>
      </section>
      <section className="emw-panel emw-admin-subjects-list">
        <div className="emw-section-title"><div><span className="emw-eyebrow">DANH SÁCH</span><h2>Tất cả môn học</h2></div><span className="emw-result-count">{subjects.length} môn</span></div>
        <label htmlFor="emw-admin-subject-search" className="emw-search-field"><span aria-hidden="true">⌕</span><input type="search" id="emw-admin-subject-search" placeholder="Tìm tên hoặc mã môn..." value={search} onChange={e => setSearch(e.target.value)} /></label>
        {loading ? <p role="status" className="emw-state">Đang tải môn học…</p> : filtered.length ? <div className="emw-admin-subject-rows">
          {filtered.map(s => <div key={s.id} className="emw-admin-subject-row"><div><span className="emw-eyebrow">{s.code}</span><strong>{s.name}</strong><small>{s.isActive ? "Đang hoạt động" : "Đã ẩn"}</small></div><button type="button" className="emw-button emw-button-outline" disabled={busy} onClick={() => void toggle(s)}>{s.isActive ? "Ẩn môn" : "Hiện môn"}</button></div>)}
        </div> : <div className="emw-state">Không có môn học phù hợp.</div>}
      </section>
    </div>
  </section>;
}
