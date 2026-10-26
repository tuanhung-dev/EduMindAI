
import { useState } from "react";
import { useSubjects } from "../hooks/useSubjects";

export default function SubjectsPage() {
  const { subjects, loading, error, refresh } = useSubjects();
  const [search, setSearch] = useState("");

  const filteredSubjects = subjects.filter((subject) => {
    const keyword = search.toLowerCase().trim();

    return (
      subject.name.toLowerCase().includes(keyword) ||
      subject.code.toLowerCase().includes(keyword)
    );
  });

  return (
    <div>
      <div className="section-heading">
        <div>
          <span className="section-eyebrow">KHÁM PHÁ KIẾN THỨC</span>
          <h2>Danh sách môn học</h2>
          <p>
            Những môn học đang được quản lý trên EduMind AI.
          </p>
        </div>

        <button
          type="button"
          className="outline-button"
          onClick={refresh}
          disabled={loading}
        >
          ↻ Làm mới
        </button>
      </div>

      <div className="panel">
        <input
          type="search"
          className="search-input"
          placeholder="Tìm kiếm tên hoặc mã môn học..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {loading && <p>Đang tải danh sách môn học...</p>}

        {error && (
          <div className="error-box">
            {error}
            <button type="button" onClick={refresh}>
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="course-grid">
              {filteredSubjects.map((subject) => (
                <div key={subject.id} className="course-card">
                  <div className="course-top">
                    <span className="course-icon">📚</span>
                    <span
                      className={
                        subject.isActive
                          ? "status active-status"
                          : "status inactive-status"
                      }
                    >
                      {subject.isActive ? "Hoạt động" : "Tạm ẩn"}
                    </span>
                  </div>

                  <span className="subject-code">
                    {subject.code}
                  </span>
                  <h3>{subject.name}</h3>
                  <p>
                    {subject.description || "Chưa có mô tả."}
                  </p>
                </div>
              ))}
            </div>

            {filteredSubjects.length === 0 && (
              <p>Không tìm thấy môn học phù hợp.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
