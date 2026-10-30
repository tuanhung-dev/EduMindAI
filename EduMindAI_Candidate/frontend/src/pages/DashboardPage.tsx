import { Link } from "react-router-dom";
import "./FocusHome.css";

const paths = [
  { title: "Học cân bằng", description: "Đọc tài liệu, hỏi Gia sư AI và làm bài kiểm tra hằng ngày." },
  { title: "Đọc hiểu tài liệu", description: "Tập trung các khái niệm, ví dụ và nội dung chưa hiểu." },
  { title: "Ôn thi tăng tốc", description: "Luyện đề, xem câu sai và ôn phần kiến thức yếu." },
];

export default function DashboardPage() {
  return (
    <div className="focus-home">
      <header className="focus-hero">
        <span className="focus-eyebrow">EDUMIND AI · HỌC TỪ TÀI LIỆU</span>
        <h1>Hai công cụ, một mục tiêu: học hiểu và làm bài tốt hơn.</h1>
        <p>Đưa tài liệu PDF hoặc Word vào EduMind AI, trao đổi với Gia sư AI để hiểu kiến thức, sau đó luyện thi và kiểm tra kết quả thực tế.</p>
        <div className="focus-actions">
          <Link className="focus-button focus-button-primary" to="/app/ai-tutor">✦ Vào Gia sư AI</Link>
          <Link className="focus-button focus-button-secondary" to="/app/quizzes">◉ Bắt đầu luyện thi</Link>
        </div>
      </header>
      <div className="focus-feature-grid">
        <article className="focus-feature">
          <div className="focus-feature-icon" aria-hidden="true">✦</div>
          <span>01 · HỌC VÀ HIỂU</span>
          <h2>Gia sư AI</h2>
          <p>Chọn tài liệu Word/PDF để hỏi đáp, giải thích thuật ngữ, tóm tắt và đối chiếu nguồn. Có thể tiếp tục hội thoại đã lưu.</p>
          <Link to="/app/documents">Thêm tài liệu →</Link>
          <Link to="/app/ai-tutor">Mở Gia sư AI →</Link>
        </article>
        <article className="focus-feature">
          <div className="focus-feature-icon" aria-hidden="true">◉</div>
          <span>02 · KIỂM TRA KIẾN THỨC</span>
          <h2>Luyện thi AI</h2>
          <p>Tạo đề theo tài liệu và chủ đề, chọn mức độ phù hợp, làm bài, chấm điểm và xem giải thích câu trả lời.</p>
          <Link to="/app/quizzes">Tạo và luyện đề →</Link>
          <Link to="/app/progress">Xem kết quả bài thi →</Link>
        </article>
      </div>
      <section className="focus-paths">
        <div className="focus-section-heading">
          <div><span className="focus-eyebrow">HỖ TRỢ VIỆC HỌC</span><h2>Chọn lộ trình phù hợp</h2></div>
          <Link to="/app/study-plan">Xem kế hoạch 7 ngày →</Link>
        </div>
        <div className="focus-path-grid">
          {paths.map((item, index) => (
            <article key={item.title} className="focus-path">
              <b>0{index + 1}</b><h3>{item.title}</h3><p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
