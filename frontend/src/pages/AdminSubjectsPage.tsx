import { useEffect, useState, type FormEvent } from "react";
import { getSubjects, type Subject } from "../services/subjectService";
import { authenticatedFetch } from "../services/authService";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function reload() { setSubjects(await getSubjects()); }
  useEffect(() => {
    let active = true;
    getSubjects().then((items) => { if (active) setSubjects(items); })
      .catch(() => { if (active) setError("Không tải được môn học."); });
    return () => { active = false; };
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await authenticatedFetch("/api/subjects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), name: name.trim(), description: "", isActive: true }),
      });
      if (!response.ok) throw new Error(`Không thể tạo môn học (HTTP ${response.status}).`);
      setCode(""); setName(""); await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi khi tạo môn học."); }
    finally { setBusy(false); }
  }
  async function toggle(subject: Subject) {
    setError(""); setBusy(true);
    try {
      const response = await authenticatedFetch(`/api/subjects/${subject.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: subject.code, name: subject.name,
          description: subject.description, isActive: !subject.isActive }),
      });
      if (!response.ok) throw new Error(`Không cập nhật được (HTTP ${response.status}).`);
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Không cập nhật được."); }
    finally { setBusy(false); }
  }
  return <div className="page-content" style={{ maxWidth: 850 }}>
    <h1>Quản trị môn học</h1><p>Chỉ tài khoản có vai trò Admin mới được thêm hoặc thay đổi môn học.</p>
    {error && <p role="alert" style={{ color: "#ae1d35" }}>{error}</p>}
    <form onSubmit={create} style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "24px 0" }}>
      <input aria-label="Mã môn học" placeholder="Mã môn (VD: AI101)" required minLength={2} maxLength={20}
        value={code} onChange={(e) => setCode(e.target.value)} />
      <input aria-label="Tên môn học" placeholder="Tên môn học" required maxLength={150}
        value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={busy}>Thêm môn</button>
    </form>
    <div style={{ display: "grid", gap: 10 }}>
      {subjects.map((subject) => <div key={subject.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", background: "#fff", padding: 14, borderRadius: 12 }}>
        <div><strong>{subject.code} — {subject.name}</strong><p>{subject.isActive ? "Đang hoạt động" : "Đã ẩn"}</p></div>
        <button type="button" disabled={busy} onClick={() => void toggle(subject)}>{subject.isActive ? "Ẩn" : "Hiện"}</button>
      </div>)}
    </div>
  </div>;
}
