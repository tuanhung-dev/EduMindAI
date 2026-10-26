
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLearningProgress, type LearningSummary } from "../services/learningProgressService";
import { useSubjects } from "../hooks/useSubjects";

export default function DashboardPage() {
  const { subjects, loading, error, refresh } = useSubjects();
  const [learning, setLearning] = useState<LearningSummary | null>(null);
  const [learningError, setLearningError] = useState("");
  useEffect(() => {
    let active = true;
    getLearningProgress().then((result) => { if (active) setLearning(result.summary); })
      .catch((reason: unknown) => { if (active) setLearningError(reason instanceof Error ? reason.message : "Không tải được số liệu học tập."); });
    return () => { active = false; };
  }, []);

  const activeCount = subjects.filter(
    (subject) => subject.isActive
  ).length;

  return (
    <div>
      <section className="welcome-banner">
        <div>
          <span className="eyebrow">✦ AI LEARNING PLATFORM</span>
          <h1>Chào mừng đến EduMind AI</h1>
          <p>
            Biến tài liệu thành kiến thức. Học thông minh
            hơn với Gia sư AI và hệ thống luyện thi
            cá nhân hóa.
          </p>
          <Link to="/app/documents" className="hero-button">
            Khám phá kho tài liệu →
          </Link>
        </div>

        <div className="banner-decoration">✦</div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">▦</div>
          <p>Tổng môn học</p>
          <h2>{loading ? "..." : error ? "—" : subjects.length}</h2>
          <small>Dữ liệu từ MySQL</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">✓</div>
          <p>Môn học hoạt động</p>
          <h2>{loading ? "..." : error ? "—" : activeCount}</h2>
          <small>Đang được kích hoạt</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">✦</div>
          <p>Bài trắc nghiệm đã nộp</p>
          <h2>{learning ? learning.completedAttempts : "—"}</h2>
          <small>{learning ? `Điểm trung bình ${learning.averageScorePercent.toFixed(1)}%` : "Từ lịch sử làm bài"}</small>
        </div>
      </section>

      {error && (
        <div className="error-box">
          {error}
          <button type="button" onClick={refresh}>
            Thử lại
          </button>
        </div>
      )}

      {learningError && (
        <div className="error-box">Không tải được thống kê học tập: {learningError}</div>
      )}

      <div className="section-heading">
        <div>
          <span className="section-eyebrow">KHÔNG GIAN CỦA BẠN</span>
          <h2>Bắt đầu học tập</h2>
          <p>Chọn một tính năng để tiếp tục.</p>
        </div>
      </div>

      <section className="feature-grid">
        <Link to="/app/documents" className="feature-card">
          <div className="feature-icon">📄</div>
          <h3>Kho tài liệu</h3>
          <p>
            Quản lý và học tập từ các tài liệu PDF.
          </p>
          <span>Khám phá →</span>
        </Link>

        <Link to="/app/ai-tutor" className="feature-card">
          <div className="feature-icon">🧠</div>
          <h3>Gia sư AI</h3>
          <p>
            Hỏi đáp, tóm tắt và giải thích kiến thức.
          </p>
          <span>Khám phá →</span>
        </Link>

        <Link to="/app/quizzes" className="feature-card">
          <div className="feature-icon">📝</div>
          <h3>Luyện thi AI</h3>
          <p>
            Tạo đề trắc nghiệm từ tài liệu học tập.
          </p>
          <span>Khám phá →</span>
        </Link>
        <Link to="/app/progress" className="feature-card">
          <div className="feature-icon">📈</div>
          <h3>Tiến độ học tập</h3>
          <p>Xem biểu đồ điểm, lịch sử bài thi và gợi ý ôn tập theo PDF.</p>
          <span>Xem tiến độ →</span>
        </Link>
      </section>
    </div>
  );
}
