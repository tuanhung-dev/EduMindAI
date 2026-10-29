
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSubjects } from "../hooks/useSubjects";
import type { Subject } from "../services/subjectService";
import "./SubjectsPage.css";

type StatusFilter = "all" | "active" | "inactive";
type SortMode = "name" | "code" | "newest";
type ViewMode = "grid" | "list";

const nameCollator = new Intl.Collator("vi-VN", {
  numeric: true,
  sensitivity: "base",
});

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN");

function formatDate(value: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// Thẻ hiển thị một môn học
function SubjectCard({
  subject,
  index,
}: {
  subject: Subject;
  index: number;
}) {
  const date = formatDate(subject.createdAtUtc);

  return (
    <article
      className={`esm-card ${
        !subject.isActive ? "esm-card--inactive" : ""
      }`}
    >
      <div className="esm-card__top">
        <span className="esm-card__symbol" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span
          className={`esm-status ${
            subject.isActive
              ? "esm-status--active"
              : "esm-status--inactive"
          }`}
        >
          <span className="esm-status__dot" aria-hidden="true" />
          {subject.isActive ? "Đang hoạt động" : "Tạm ẩn"}
        </span>
      </div>

      <div className="esm-card__content">
        <span className="esm-card__code">
          MÃ MÔN · {subject.code}
        </span>

        <h3>{subject.name}</h3>

        <p>
          {subject.description?.trim() ||
            "Chưa có mô tả cho môn học này. Bạn có thể khám phá tài liệu và các nội dung luyện tập hiện có."}
        </p>
      </div>

      <div className="esm-card__bottom">
        {date && (
          <span className="esm-card__date">
            Ngày thêm: {date}
          </span>
        )}

        {subject.isActive ? (
          <div className="esm-card__actions">
            <Link to="/app/documents">
              Kho tài liệu <span aria-hidden="true">↗</span>
            </Link>

            <Link
              to="/app/quizzes"
              className="esm-card__secondary"
            >
              Luyện thi <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : (
          <p className="esm-card__notice">
            Môn học đang tạm ẩn. Bạn có thể tham khảo
            các môn đang hoạt động khác.
          </p>
        )}
      </div>
    </article>
  );
}

export default function SubjectsPage() {
  const { subjects, loading, error, refresh } = useSubjects();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("name");
  const [view, setView] = useState<ViewMode>("grid");

  const activeCount = subjects.filter(
    (subject) => subject.isActive
  ).length;

  const inactiveCount = subjects.length - activeCount;

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());

    return subjects
      .filter((subject) => {
        const matchesStatus =
          status === "all" ||
          (status === "active"
            ? subject.isActive
            : !subject.isActive);

        const text = normalize(
          `${subject.code} ${subject.name} ${
            subject.description ?? ""
          }`
        );

        return matchesStatus &&
          (!keyword || text.includes(keyword));
      })
      .sort((a, b) => {
        if (sort === "code") {
          return nameCollator.compare(a.code, b.code);
        }

        if (sort === "newest") {
          return (
            (Date.parse(b.createdAtUtc) || 0) -
            (Date.parse(a.createdAtUtc) || 0)
          );
        }

        return nameCollator.compare(a.name, b.name);
      });
  }, [subjects, query, status, sort]);

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setSort("name");
  }

  return (
    <div className="esm-page">

      {/* 1. BANNER GIỚI THIỆU */}
      <header className="esm-hero">
        <div className="esm-hero__content">
          <span className="esm-eyebrow esm-eyebrow--light">
            EDUMIND AI · DANH MỤC HỌC TẬP
          </span>

          <h1>
            Khám phá môn học.
            <br />
            <span>Học đúng điều bạn cần.</span>
          </h1>

          <p>
            Tìm môn học theo tên hoặc mã, xem mô tả
            ngắn gọn và tiếp tục hành trình học với
            tài liệu, luyện thi cùng Gia sư AI.
          </p>

          <div className="esm-hero__actions">
            <a
              className="esm-btn esm-btn--white"
              href="#danh-sach-mon-hoc"
            >
              Khám phá môn học
              <span aria-hidden="true">↓</span>
            </a>

            <Link
              className="esm-btn esm-btn--ghost"
              to="/app/documents"
            >
              Xem kho tài liệu
              <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="esm-hero__highlights">
            <span>✓ Tìm nhanh theo mã môn</span>
            <span>✓ Thông tin rõ ràng</span>
            <span>✓ Học và luyện tập liền mạch</span>
          </div>
        </div>

        <div
          className="esm-hero__illustration"
          aria-hidden="true"
        >
          <div className="esm-illustration__back">✦</div>

          <div className="esm-illustration__book esm-illustration__book--top">
            <span>01</span>
            <strong>Khám phá kiến thức</strong>
            <small>Chọn môn học</small>
          </div>

          <div className="esm-illustration__book esm-illustration__book--bottom">
            <span>02</span>
            <strong>Học tập thông minh</strong>
            <small>Tài liệu · AI · Luyện thi</small>
          </div>
        </div>
      </header>

      {/* 2. THỐNG KÊ DANH MỤC */}
      <section
        className="esm-stats"
        aria-label="Thống kê danh mục môn học"
      >
        <div className="esm-stat">
          <span className="esm-stat__icon" aria-hidden="true">
            ▧
          </span>
          <div>
            <span>Tổng môn học</span>
            <strong>
              {loading || error ? "—" : subjects.length}
            </strong>
            <small>Trong danh mục hiện có</small>
          </div>
        </div>

        <div className="esm-stat">
          <span
            className="esm-stat__icon esm-stat__icon--active"
            aria-hidden="true"
          >
            ✓
          </span>
          <div>
            <span>Đang hoạt động</span>
            <strong>
              {loading || error ? "—" : activeCount}
            </strong>
            <small>Có thể khám phá ngay</small>
          </div>
        </div>

        <div className="esm-stat">
          <span
            className="esm-stat__icon esm-stat__icon--muted"
            aria-hidden="true"
          >
            ◷
          </span>
          <div>
            <span>Tạm ẩn</span>
            <strong>
              {loading || error ? "—" : inactiveCount}
            </strong>
            <small>Chưa mở trong danh mục</small>
          </div>
        </div>
      </section>

      {/* 3. THƯ VIỆN MÔN HỌC */}
      <section
        id="danh-sach-mon-hoc"
        className="esm-catalog"
        aria-labelledby="esm-catalog-title"
      >
        <div className="esm-heading">
          <div>
            <span className="esm-eyebrow">
              THƯ VIỆN MÔN HỌC
            </span>

            <h2 id="esm-catalog-title">
              Chọn môn học của bạn
            </h2>

            <p>
              Tìm theo tên, mã môn hoặc nội dung mô tả
              để nhanh chóng bắt đầu.
            </p>
          </div>

          <button
            type="button"
            className="esm-refresh"
            onClick={refresh}
            disabled={loading}
          >
            ↻ Làm mới
          </button>
        </div>

        {/* 4. TÌM KIẾM VÀ SẮP XẾP */}
        <div className="esm-toolbar">
          <div className="esm-search">
            <label htmlFor="esm-subject-search">
              Tìm kiếm môn học
            </label>

            <div className="esm-search__control">
              <span aria-hidden="true">⌕</span>

              <input
                id="esm-subject-search"
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Ví dụ: Toán, tiếng Anh, AI101..."
              />

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Xóa nội dung tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="esm-sort">
            <label htmlFor="esm-subject-sort">
              Sắp xếp theo
            </label>

            <select
              id="esm-subject-sort"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as SortMode)
              }
            >
              <option value="name">Tên A–Z</option>
              <option value="code">Mã môn A–Z</option>
              <option value="newest">
                Mới thêm gần đây
              </option>
            </select>
          </div>
        </div>

        {/* 5. BỘ LỌC TRẠNG THÁI */}
        <div className="esm-tools-bottom">
          <div
            className="esm-filter"
            role="group"
            aria-label="Lọc trạng thái môn học"
          >
            <button
              type="button"
              className={
                status === "all" ? "is-active" : ""
              }
              aria-pressed={status === "all"}
              onClick={() => setStatus("all")}
            >
              Tất cả
              <span>
                {loading || error ? "—" : subjects.length}
              </span>
            </button>

            <button
              type="button"
              className={
                status === "active" ? "is-active" : ""
              }
              aria-pressed={status === "active"}
              onClick={() => setStatus("active")}
            >
              Đang hoạt động
              <span>
                {loading || error ? "—" : activeCount}
              </span>
            </button>

            <button
              type="button"
              className={
                status === "inactive" ? "is-active" : ""
              }
              aria-pressed={status === "inactive"}
              onClick={() => setStatus("inactive")}
            >
              Tạm ẩn
              <span>
                {loading || error ? "—" : inactiveCount}
              </span>
            </button>
          </div>

          {/* 6. ĐỔI KIỂU HIỂN THỊ */}
          <div
            className="esm-view"
            role="group"
            aria-label="Kiểu hiển thị môn học"
          >
            <button
              type="button"
              aria-label="Dạng thẻ"
              title="Dạng thẻ"
              aria-pressed={view === "grid"}
              className={
                view === "grid" ? "is-active" : ""
              }
              onClick={() => setView("grid")}
            >
              ▦
            </button>

            <button
              type="button"
              aria-label="Dạng danh sách"
              title="Dạng danh sách"
              aria-pressed={view === "list"}
              className={
                view === "list" ? "is-active" : ""
              }
              onClick={() => setView("list")}
            >
              ☷
            </button>
          </div>
        </div>

        {/* 7. TRẠNG THÁI VÀ DANH SÁCH */}
        {loading ? (
          <div
            className="esm-feedback"
            role="status"
            aria-live="polite"
          >
            <div
              className="esm-spinner"
              aria-hidden="true"
            />
            <h3>Đang tải danh sách môn học...</h3>
            <p>EduMindAI đang cập nhật danh mục cho bạn.</p>
          </div>
        ) : error ? (
          <div
            className="esm-feedback esm-feedback--error"
            role="alert"
          >
            <span aria-hidden="true">!</span>
            <h3>Chưa tải được danh sách môn học</h3>
            <p>{error}</p>

            <button
              type="button"
              className="esm-btn esm-btn--primary"
              onClick={refresh}
            >
              Thử tải lại
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className="esm-feedback">
            <span aria-hidden="true">▧</span>
            <h3>Danh mục chưa có môn học</h3>
            <p>
              Khi quản trị viên thêm môn học, chúng
              sẽ xuất hiện tại đây.
            </p>

            <Link
              to="/app/documents"
              className="esm-btn esm-btn--primary"
            >
              Khám phá kho tài liệu
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="esm-feedback">
            <span aria-hidden="true">⌕</span>
            <h3>Không tìm thấy môn học phù hợp</h3>
            <p>
              Thử từ khóa ngắn hơn hoặc chọn
              trạng thái khác.
            </p>

            <button
              type="button"
              className="esm-btn esm-btn--primary"
              onClick={clearFilters}
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <>
            <div
              className="esm-result-count"
              role="status"
            >
              Hiển thị{" "}
              <strong>{filtered.length}</strong>
              {" / "}
              {subjects.length} môn học
            </div>

            <div
              className={`esm-grid ${
                view === "list" ? "esm-grid--list" : ""
              }`}
            >
              {filtered.map((subject, index) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  index={index}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* 8. HƯỚNG DẪN HỌC TẬP */}
      <section
        className="esm-learning"
        aria-labelledby="esm-learning-title"
      >
        <div className="esm-heading">
          <div>
            <span className="esm-eyebrow">
              BẠN CHƯA BIẾT BẮT ĐẦU TỪ ĐÂU?
            </span>

            <h2 id="esm-learning-title">
              Lộ trình học đơn giản
            </h2>

            <p>
              Ba bước giúp bạn tận dụng EduMindAI
              hiệu quả hơn.
            </p>
          </div>
        </div>

        <ol className="esm-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Chọn môn quan tâm</h3>
              <p>
                Tìm theo mã hoặc tên môn, đọc mô tả
                và xác định nội dung cần học.
              </p>
            </div>
          </li>

          <li>
            <span>02</span>
            <div>
              <h3>Học cùng tài liệu và AI</h3>
              <p>
                Mở kho tài liệu, tải Word/PDF và hỏi
                Gia sư AI về nội dung đã được xử lý.
              </p>
            </div>
          </li>

          <li>
            <span>03</span>
            <div>
              <h3>Luyện tập và cải thiện</h3>
              <p>
                Làm trắc nghiệm, xem lại kết quả
                và theo dõi tiến độ học tập.
              </p>
            </div>
          </li>
        </ol>

        <div className="esm-learning__actions">
          <Link to="/app/ai-tutor">
            ✦ Hỏi Gia sư AI
            <span aria-hidden="true">↗</span>
          </Link>

          <Link to="/app/quizzes">
            ◉ Đến Luyện thi AI
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <p className="esm-footnote">
        Lưu ý: nút “Kho tài liệu” và “Luyện thi”
        hiện mở các khu vực tương ứng; chưa tự lọc
        theo từng môn học vì API hiện tại chưa
        cung cấp bộ lọc liên kết môn học.
      </p>
    </div>
  );
}
