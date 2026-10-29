
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getDocuments,
  type DocumentItem,
} from "../services/documentService";
import {
  getLearningProgress,
  type LearningProgress,
} from "../services/learningProgressService";
import "./HomePage.css";

// Danh sách tính năng giới thiệu trên Trang chủ
const features = [
  {
    icon: "▤",
    tag: "QUẢN LÝ KIẾN THỨC",
    title: "Kho tài liệu",
    desc: "Lưu trữ Word/PDF, theo dõi trạng thái xử lý và chuẩn bị kiến thức cho Gia sư AI.",
    to: "/app/documents",
    action: "Khám phá kho tài liệu",
  },
  {
    icon: "✦",
    tag: "HỌC CÙNG AI",
    title: "Gia sư AI",
    desc: "Đặt câu hỏi trên tài liệu đã xử lý và đối chiếu nội dung với trích dẫn nguồn.",
    to: "/app/ai-tutor",
    action: "Bắt đầu hỏi AI",
  },
  {
    icon: "◉",
    tag: "TỰ ĐÁNH GIÁ",
    title: "Luyện thi AI",
    desc: "Tạo bài luyện tập từ học liệu, làm trắc nghiệm và xem lại đáp án, lời giải.",
    to: "/app/quizzes",
    action: "Vào luyện thi",
  },
  {
    icon: "▧",
    tag: "TỔ CHỨC VIỆC HỌC",
    title: "Môn học",
    desc: "Khám phá danh sách môn học và xác định nhóm kiến thức cần học.",
    to: "/app/subjects",
    action: "Xem môn học",
  },
  {
    icon: "◇",
    tag: "HỌC CÓ KẾ HOẠCH",
    title: "Lộ trình học",
    desc: "Theo dõi kế hoạch và sắp xếp các hoạt động học tập có mục tiêu.",
    to: "/app/study-plan",
    action: "Mở lộ trình",
  },
  {
    icon: "▥",
    tag: "NHÌN LẠI TIẾN BỘ",
    title: "Kết quả học tập",
    desc: "Xem điểm số, lịch sử bài đã nộp và gợi ý nội dung cần ôn thêm.",
    to: "/app/progress",
    action: "Xem kết quả",
  },
];

// Hướng dẫn dành cho học viên mới
const steps = [
  {
    title: "Thêm tài liệu",
    desc: "Tải file Word hoặc PDF vào Kho tài liệu.",
    to: "/app/documents",
  },
  {
    title: "Đợi xử lý hoàn tất",
    desc: "Khi tài liệu ở trạng thái Ready, AI mới có dữ liệu để tra cứu.",
    to: "/app/documents",
  },
  {
    title: "Hỏi và làm rõ kiến thức",
    desc: "Đặt câu hỏi cụ thể, đọc câu trả lời và kiểm tra trích dẫn.",
    to: "/app/ai-tutor",
  },
  {
    title: "Luyện thi và xem kết quả",
    desc: "Làm bài trắc nghiệm, xem câu sai và theo dõi tiến độ.",
    to: "/app/quizzes",
  },
];

// Câu hỏi thường gặp về hệ thống
const faqs = [
  {
    question: "EduMindAI giúp tôi học như thế nào?",
    answer:
      "EduMindAI kết hợp kho tài liệu, hỏi đáp từ nội dung tài liệu, luyện thi và theo dõi kết quả trong một không gian học tập.",
  },
  {
    question: "Gia sư AI có trả lời mọi câu hỏi không?",
    answer:
      "Gia sư AI ưu tiên dữ liệu từ tài liệu bạn chọn. Nếu không đủ nguồn liên quan, hệ thống có thể báo chưa đủ dữ liệu thay vì tự tạo thông tin.",
  },
  {
    question: "Tại sao tài liệu chưa hỏi AI được?",
    answer:
      "Tài liệu cần được tải lên và xử lý/lập chỉ mục thành công. Bạn có thể kiểm tra trạng thái tại Kho tài liệu.",
  },
];

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Chưa rõ ngày"
    : date.toLocaleDateString("vi-VN");
};

const isReady = (status: string) =>
  status.toLowerCase() === "ready";

export default function DashboardPage() {
  const { user } = useAuth();

  const [documents, setDocuments] =
    useState<DocumentItem[] | null>(null);
  const [progress, setProgress] =
    useState<LearningProgress | null>(null);

  const [documentError, setDocumentError] = useState(false);
  const [progressError, setProgressError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Lấy dữ liệu thật từ hai API đã có trong frontend
  useEffect(() => {
    let active = true;

    const load = async () => {
      const [docsResult, progressResult] =
        await Promise.allSettled([
          getDocuments(),
          getLearningProgress(),
        ]);

      if (!active) return;

      setDocuments(
        docsResult.status === "fulfilled"
          ? docsResult.value
          : null
      );

      setProgress(
        progressResult.status === "fulfilled"
          ? progressResult.value
          : null
      );

      setDocumentError(docsResult.status === "rejected");
      setProgressError(progressResult.status === "rejected");
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const readyCount = documents?.filter((doc) =>
    isReady(doc.status)
  ).length;

  const recentDocs = [...(documents ?? [])]
    .sort(
      (a, b) =>
        new Date(b.createdAtUtc).getTime() -
        new Date(a.createdAtUtc).getTime()
    )
    .slice(0, 4);

  const displayName = user?.email?.split("@")[0] || "bạn";

  const averageScore = progress
    ? `${Math.round(progress.summary.averageScorePercent)}%`
    : "—";

  return (
    <div className="edh-home">
      {/* LỜI CHÀO */}
      <div className="edh-welcome">
        <div>
          <span className="edh-overline">
            KHÔNG GIAN HỌC TẬP · EDUMIND AI
          </span>
          <p>
            Xin chào, <strong>{displayName}</strong>{" "}
            <span aria-hidden="true">👋</span>
          </p>
        </div>

        <Link to="/app/account" className="edh-text-link">
          Quản lý tài khoản ↗
        </Link>
      </div>

      {/* BANNER GIỚI THIỆU */}
      <section
        className="edh-hero"
        aria-labelledby="edh-hero-title"
      >
        <div className="edh-hero-content">
          <span className="edh-hero-label">
            ✦ NỀN TẢNG HỌC TẬP THÔNG MINH
          </span>

          <h1 id="edh-hero-title">
            Tài liệu của bạn.
            <br />
            <span>Hành trình học của bạn.</span>
          </h1>

          <p>
            EduMindAI giúp bạn học từ Word/PDF, trò chuyện
            cùng Gia sư AI, luyện tập kiến thức và theo dõi
            sự tiến bộ — trong cùng một nơi.
          </p>

          <div className="edh-hero-actions">
            <Link
              to="/app/ai-tutor"
              className="edh-button edh-button-white"
            >
              ✦ Hỏi Gia sư AI ↗
            </Link>

            <Link
              to="/app/documents"
              className="edh-button edh-button-transparent"
            >
              Xem tài liệu
            </Link>
          </div>

          <div className="edh-hero-tags">
            <span>✓ Hỗ trợ Word/PDF</span>
            <span>✓ Hỏi đáp có nguồn</span>
            <span>✓ Luyện tập & đánh giá</span>
          </div>
        </div>

        {/* Hình minh họa luồng hoạt động */}
        <div className="edh-hero-visual" aria-hidden="true">
          <div className="edh-visual-card edh-visual-doc">
            <span>▤</span>
            <div>
              <b>Tài liệu học tập</b>
              <small>Word · PDF</small>
            </div>
            <span>✓</span>
          </div>

          <div className="edh-visual-connector" />

          <div className="edh-visual-card edh-visual-ai">
            <span>✦</span>
            <div>
              <b>Gia sư AI</b>
              <small>Hỏi đáp theo tài liệu</small>
            </div>
            <span>✧</span>
          </div>

          <div className="edh-visual-connector" />

          <div className="edh-visual-card edh-visual-result">
            <span>◉</span>
            <div>
              <b>Luyện tập & tiến độ</b>
              <small>Học · Kiểm tra · Cải thiện</small>
            </div>
            <span>↗</span>
          </div>
        </div>
      </section>

      {/* THỐNG KÊ HỌC TẬP */}
      <section
        className="edh-section"
        aria-labelledby="edh-stats-title"
      >
        <div className="edh-section-heading edh-section-heading-tight">
          <div>
            <span className="edh-overline">
              TỔNG QUAN CỦA BẠN
            </span>
            <h2 id="edh-stats-title">
              Góc học tập cá nhân
            </h2>
          </div>

          <button
            type="button"
            className="edh-refresh"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRefreshKey((value) => value + 1);
            }}
          >
            ↻ Làm mới
          </button>
        </div>

        <div className="edh-stats" aria-live="polite">
          <Link to="/app/documents" className="edh-stat">
            <span className="edh-stat-icon">▤</span>
            <span>Tài liệu đã tải</span>
            <strong>
              {loading ? "…" : (documents?.length ?? "—")}
            </strong>
            <small>
              {documentError
                ? "Không tải được dữ liệu"
                : "Từ kho học liệu"}
            </small>
          </Link>

          <Link to="/app/documents" className="edh-stat">
            <span className="edh-stat-icon">✓</span>
            <span>Sẵn sàng để hỏi</span>
            <strong>
              {loading ? "…" : (readyCount ?? "—")}
            </strong>
            <small>
              {documentError
                ? "Không tải được dữ liệu"
                : "Đã xử lý xong"}
            </small>
          </Link>

          <Link to="/app/progress" className="edh-stat">
            <span className="edh-stat-icon">◉</span>
            <span>Bài đã nộp</span>
            <strong>
              {loading
                ? "…"
                : (progress?.summary.completedAttempts ?? "—")}
            </strong>
            <small>
              {progressError
                ? "Không tải được dữ liệu"
                : "Từ lịch sử luyện thi"}
            </small>
          </Link>

          <Link to="/app/progress" className="edh-stat">
            <span className="edh-stat-icon">▥</span>
            <span>Điểm trung bình</span>
            <strong>
              {loading ? "…" : averageScore}
            </strong>
            <small>
              {progressError
                ? "Không tải được dữ liệu"
                : "Các bài đã nộp"}
            </small>
          </Link>
        </div>
      </section>

      {/* 6 CHỨC NĂNG CHÍNH */}
      <section
        className="edh-section"
        aria-labelledby="edh-feature-title"
      >
        <div className="edh-section-heading">
          <div>
            <span className="edh-overline">
              KHÁM PHÁ EDUMIND AI
            </span>
            <h2 id="edh-feature-title">
              Bạn có thể làm gì tại đây?
            </h2>
            <p>
              Chọn một tính năng phù hợp với mục tiêu
              học tập của bạn.
            </p>
          </div>
        </div>

        <div className="edh-feature-grid">
          {features.map((feature) => (
            <Link
              to={feature.to}
              className="edh-feature"
              key={feature.to}
            >
              <span
                className="edh-feature-icon"
                aria-hidden="true"
              >
                {feature.icon}
              </span>

              <span className="edh-feature-tag">
                {feature.tag}
              </span>

              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>

              <span className="edh-feature-action">
                {feature.action}
                <span aria-hidden="true">↗</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* HƯỚNG DẪN VÀ TÀI LIỆU GẦN ĐÂY */}
      <div className="edh-columns">
        <section
          className="edh-panel"
          aria-labelledby="edh-guide-title"
        >
          <div className="edh-section-heading">
            <div>
              <span className="edh-overline">
                HƯỚNG DẪN DÀNH CHO NGƯỜI MỚI
              </span>
              <h2 id="edh-guide-title">
                Bắt đầu chỉ với 4 bước
              </h2>
            </div>
          </div>

          <ol className="edh-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="edh-step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div>
                  <strong>{step.title}</strong>
                  <p>{step.desc}</p>
                </div>

                <Link
                  to={step.to}
                  aria-label={`Đi đến ${step.title}`}
                >
                  ↗
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="edh-panel"
          aria-labelledby="edh-recent-title"
        >
          <div className="edh-section-heading">
            <div>
              <span className="edh-overline">
                TIẾP TỤC VIỆC HỌC
              </span>
              <h2 id="edh-recent-title">
                Tài liệu gần đây
              </h2>
            </div>

            <Link
              className="edh-text-link"
              to="/app/documents"
            >
              Xem tất cả ↗
            </Link>
          </div>

          {loading ? (
            <p role="status" className="edh-state">
              Đang tải tài liệu...
            </p>
          ) : documentError ? (
            <div className="edh-state" role="status">
              Chưa tải được danh sách tài liệu.{" "}
              <Link to="/app/documents">
                Mở Kho tài liệu ↗
              </Link>
            </div>
          ) : recentDocs.length === 0 ? (
            <div className="edh-empty">
              <span aria-hidden="true">▤</span>
              <strong>Chưa có tài liệu nào</strong>
              <p>
                Tải tài liệu đầu tiên lên để bắt đầu học
                cùng AI.
              </p>
              <Link
                className="edh-button edh-button-green"
                to="/app/documents"
              >
                ＋ Thêm tài liệu
              </Link>
            </div>
          ) : (
            <ul className="edh-recent-list">
              {recentDocs.map((doc) => (
                <li key={doc.id}>
                  <span
                    className="edh-file-icon"
                    aria-hidden="true"
                  >
                    {doc.originalFileName
                      .toLowerCase()
                      .endsWith(".docx")
                      ? "W"
                      : "PDF"}
                  </span>

                  <div>
                    <strong title={doc.originalFileName}>
                      {doc.originalFileName}
                    </strong>

                    <small>
                      {formatDate(doc.createdAtUtc)}
                      {" · "}
                      <span
                        className={
                          isReady(doc.status)
                            ? "edh-ready"
                            : ""
                        }
                      >
                        {isReady(doc.status)
                          ? "Sẵn sàng"
                          : doc.status}
                      </span>
                    </small>
                  </div>

                  <Link
                    to="/app/documents"
                    aria-label={`Xem tài liệu ${doc.originalFileName}`}
                  >
                    ↗
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* DANH SÁCH CÂU HỎI THƯỜNG GẶP */}
      <section
        className="edh-section edh-faq"
        aria-labelledby="edh-faq-title"
      >
        <div className="edh-section-heading">
          <div>
            <span className="edh-overline">
              HIỂU HƠN VỀ NỀN TẢNG
            </span>
            <h2 id="edh-faq-title">
              Câu hỏi thường gặp
            </h2>
          </div>
        </div>

        <div className="edh-faq-grid">
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <span aria-hidden="true">＋</span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* KÊU GỌI HÀNH ĐỘNG */}
      <section
        className="edh-bottom-cta"
        aria-label="Bắt đầu học cùng EduMindAI"
      >
        <div>
          <span className="edh-overline">
            SẴN SÀNG HỌC TẬP?
          </span>
          <h2>Mỗi câu hỏi là một bước tiến.</h2>
          <p>
            Mở tài liệu của bạn và bắt đầu hành trình
            học tập ngay hôm nay.
          </p>
        </div>

        <Link
          className="edh-button edh-button-white"
          to="/app/ai-tutor"
        >
          ✦ Trò chuyện với Gia sư AI ↗
        </Link>
      </section>
    </div>
  );
}
