import { Link } from "react-router-dom";
export default function NotFoundPage() {
  return <main className="emw-notfound">
    <span className="emw-notfound-icon" aria-hidden="true">✦</span>
    <p className="emw-eyebrow">EDUMIND AI · 404</p>
    <h1>Không tìm thấy trang</h1>
    <p>Đường dẫn này không tồn tại hoặc đã được chuyển. Bạn có thể trở về không gian học tập để tiếp tục.</p>
    <Link to="/app" className="emw-button emw-button-primary">← Về trang bắt đầu</Link>
  </main>;
}
