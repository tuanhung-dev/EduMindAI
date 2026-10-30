/**
 * EduMindAI - static / smoke audit by Excel task FE-001..FE-013.
 * Safe: GET/OPTIONS only; never writes DB, uploads, signs in or calls AI.
 * Requires Node.js 20+; no external packages for static/API probes.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../..');
const tasks = Array.from({ length: 13 }, (_, i) => `FE-${String(i + 1).padStart(3, '0')}`);
const name = {
  'FE-001': 'Khởi tạo React + TypeScript + Vite',
  'FE-002': 'Router / Sidebar / Header / 404',
  'FE-003': 'Đăng nhập / đăng ký',
  'FE-004': 'API Client / phiên đăng nhập',
  'FE-005': 'Danh sách môn học',
  'FE-006': 'Upload tài liệu',
  'FE-007': 'Chi tiết tài liệu',
  'FE-008': 'Tóm tắt và Chat RAG',
  'FE-009': 'Làm bài Quiz',
  'FE-010': 'Kết quả Quiz',
  'FE-011': 'Lịch sử và tiến độ',
  'FE-012': 'Loading / lỗi / responsive',
  'FE-013': 'Production build / CORS / route refresh',
};
const manual = {
  'FE-001': [
    'npm ci và npm run dev khởi động thành công; mở trang trên trình duyệt.',
    'Network cho thấy request API sử dụng đúng VITE_API_BASE_URL.',
  ],
  'FE-002': [
    'Kiểm tra /login, /app/subjects, /app/documents và đường dẫn không tồn tại.',
    'Chưa đăng nhập phải về /login; Student không được vào /app/admin.',
    'Console trình duyệt không có lỗi nghiêm trọng.',
  ],
  'FE-003': [
    'Nhập email không hợp lệ, mật khẩu yếu, xác nhận sai: thấy thông báo tương ứng.',
    'Đăng ký tài khoản thử nghiệm, đăng nhập đúng và sai: loading/lỗi hiển thị rõ.',
    'DevTools > Application: không lưu mật khẩu thô trong localStorage/sessionStorage.',
  ],
  'FE-004': [
    'Đăng nhập và xem Network: Authorization: Bearer <token> trên API cần xác thực.',
    'Hết hạn phiên (401) xử lý đúng; gọi API không đủ quyền (403) có thông báo.',
    'Mất kết nối/HTTP 500 không làm vỡ giao diện.',
  ],
  'FE-005': [
    'Trang Môn học hiển thị dữ liệu thật từ GET /api/subjects.',
    'Tìm theo tên/mã; thử API trả [] và khi API lỗi để xác nhận empty/error state.',
  ],
  'FE-006': [
    'Upload PDF hợp lệ và kiểm tra danh sách cập nhật sau upload.',
    'Thử file sai định dạng, file 0 byte, file vượt giới hạn; xem thông báo lỗi.',
    'Đối chiếu Pending/Processing/Ready/Failed với phản hồi API.',
  ],
  'FE-007': [
    'Mở /app/documents/<id>: tên/môn/dung lượng/ngày/trạng thái đúng.',
    'Với Processing/Failed/Uploaded: xác minh KHÔNG có request hỏi AI trong Network.',
    'Với Ready: mở Hỏi AI; kiểm tra xem PDF và preview trích xuất Word/PDF.',
  ],
  'FE-008': [
    'Chỉ dùng tài liệu Ready, yêu cầu tóm tắt và hỏi câu có đáp án trong tài liệu.',
    'Đối chiếu nguồn/trang/citation với response RAG thực tế.',
    'Tắt Ollama/AI trong môi trường test: thông báo lỗi xuất hiện, trang không vỡ.',
    'Kiểm tra AI provider đang dùng để tránh phát sinh phí API ngoài ý muốn.',
  ],
  'FE-009': [
    'Chọn radio A/B/C/D và xác nhận không chọn đồng thời 2 đáp án cùng câu.',
    'Trong Network, POST nộp bài chỉ gửi answers[].questionId và selectedOption.',
    'Không gửi correctOption; thử bỏ trống và nhấn nộp 2 lần.',
  ],
  'FE-010': [
    'Nộp bài test và xem GET /api/attempts/<id> trong Network.',
    'Đối chiếu scorePercent, correctCount, totalQuestions trong JSON với giao diện.',
    'Kiểm tra đúng/sai, explanation và nguồn trang (nếu Backend trả).',
  ],
  'FE-011': [
    'Tài khoản có lượt thi: số bài nộp và điểm TB phải khớp GET /api/learning/progress.',
    'Tài khoản chưa làm bài: hiển thị empty state, không hiện số liệu giả.',
  ],
  'FE-012': [
    'Giả lập mạng chậm / mất mạng / HTTP 403/429/500: không kẹt loading vô hạn.',
    'Xem ở 1366x768 và 390x844: không tràn ngang, nút quan trọng thao tác được.',
    'Toast / loading / empty state / thông báo lỗi rõ ràng trên toàn bộ các luồng P0.',
  ],
  'FE-013': [
    'npm run lint và npm run build chạy thành công trên Windows.',
    'CORS thử qua trình duyệt từ frontend thật, không chỉ qua TCP/OPTIONS.',
    'Sau khi deploy, F5 /app/documents, /app/progress, /app/admin không bị 404 server.',
    'Kiểm tra VITE_API_BASE_URL trong bản production, không chứa API key/secret.',
  ],
};

function usage() {
  console.log(`\nEduMindAI - kiem tra theo tung task FE\n\n` +
`Cach dung:\n` +
`  node scripts/fe-check/check-fe.mjs FE-001\n` +
`  node scripts/fe-check/check-fe.mjs FE-009\n` +
`  node scripts/fe-check/check-fe.mjs --all\n` +
`  node scripts/fe-check/check-fe.mjs FE-013 --api http://localhost:5080 --web http://localhost:5173\n` +
`  node scripts/fe-check/check-fe.mjs FE-007 --api http://localhost:5080 --document-id 1\n` +
`  node scripts/fe-check/check-fe.mjs FE-010 --api http://localhost:5080 --attempt-id 1\n` +
`  (Chay lint/build FE-013, bo qua bang --no-build)\n` +
`\nOptional: EDUMIND_TEST_TOKEN trong bien moi truong de thu GET can dang nhap.\n` +
`Khong ghi token vao file hoac commit. Khong co request POST/PUT/DELETE.\n`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }
let selected = args.find(x => /^FE-\d{3}$/i.test(x))?.toUpperCase();
if (args.includes('--all')) selected = 'ALL';
if (!selected || (selected !== 'ALL' && !tasks.includes(selected))) {
  usage(); process.exit(2);
}
function argValue(key) {
  const ix = args.indexOf(key);
  if (ix < 0) return null;
  if (!args[ix + 1] || args[ix + 1].startsWith('--')) throw new Error(`Thieu gia tri cho ${key}`);
  return args[ix + 1];
}
const apiUrl = argValue('--api');
const webUrl = argValue('--web');
const documentId = argValue('--document-id');
const attemptId = argValue('--attempt-id');
const origin = argValue('--origin') || webUrl || 'http://localhost:5173';
const noBuild = args.includes('--no-build');
const token = (process.env.EDUMIND_TEST_TOKEN || '').trim();
for (const id of [documentId, attemptId].filter(Boolean)) {
  if (!/^[1-9]\d*$/.test(id)) throw new Error('ID phai la so nguyen duong.');
}
for (const [label, value] of [['--api', apiUrl], ['--web', webUrl], ['--origin', origin]]) {
  if (value) { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} phai la http/https`); }
}

const results = {};
let active = '';
function add(status, label, evidence = '') {
  results[active].checks.push({ status, label, evidence });
  const icon = { PASS: 'OK', FAIL: 'FAIL', REVIEW: 'REVIEW', SKIP: 'SKIP' }[status];
  console.log(`  [${icon}] ${label}${evidence ? ` — ${evidence}` : ''}`);
}
function read(rel) {
  const file = path.join(frontend, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
function exists(rel, label) {
  const found = fs.existsSync(path.join(frontend, rel));
  add(found ? 'PASS' : 'FAIL', label, rel);
}
function pattern(rel, re, label) {
  const src = read(rel);
  if (src === null) return add('FAIL', label, `Khong tim thay ${rel}`);
  add(re.test(src) ? 'PASS' : 'FAIL', label, rel);
}
function everyPattern(rel, patterns, label) {
  const src = read(rel);
  if (src === null) return add('FAIL', label, `Khong tim thay ${rel}`);
  const missing = patterns.filter(re => !re.test(src));
  add(missing.length ? 'FAIL' : 'PASS', label, missing.length ? `Thieu ${missing.length} dau hieu trong ${rel}` : rel);
}
function runNpm(command) {
  if (noBuild) { add('SKIP', `npm run ${command}`, 'Da bo qua voi --no-build'); return null; }
  if (!fs.existsSync(path.join(frontend, 'node_modules'))) {
    add('SKIP', `npm run ${command}`, 'Chua co node_modules; chay npm ci truoc'); return null;
  }
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  console.log(`  Dang chay npm run ${command}...`);
  const r = spawnSync(cmd, ['run', command], {
    cwd: frontend, encoding: 'utf8', timeout: 180000,
    shell: process.platform === 'win32',
  });
  const output = `${r.stdout || ''}\n${r.stderr || ''}`;
  const tail = output.trim().split(/\r?\n/).slice(-10).join('\n');
  if (r.status !== 0) console.log('  LOG CUOI:\n' + tail);
  add(r.status === 0 ? 'PASS' : 'FAIL', `npm run ${command}`, r.error?.message || `exit=${r.status ?? 'timeout'}`);
  return r.status === 0;
}
function urlJoin(base, endpoint) { return `${base.replace(/\/+$/, '')}${endpoint}`; }
async function request(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(6000), redirect: 'manual' });
}
async function readOnlyGet(endpoint, label, validate = null) {
  if (!apiUrl) return add('SKIP', label, 'Them --api de thu HTTP GET');
  if (!token) return add('SKIP', label, 'Chua co EDUMIND_TEST_TOKEN; khong tu dang nhap');
  try {
    const r = await request(urlJoin(apiUrl, endpoint), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (r.status !== 200) return add('FAIL', label, `GET ${endpoint}: HTTP ${r.status}`);
    if (!validate) return add('PASS', label, `GET ${endpoint}: HTTP 200`);
    const data = await r.json();
    const ok = validate(data);
    add(ok ? 'PASS' : 'FAIL', label, ok ? `GET ${endpoint}: JSON hop le` : `GET ${endpoint}: JSON thieu truong`);
  } catch (e) { add('FAIL', label, `GET ${endpoint}: ${e.message}`); }
}
async function testWeb(urlPath, label) {
  if (!webUrl) return add('SKIP', label, 'Them --web de kiem tra server FE');
  try {
    const r = await request(urlJoin(webUrl, urlPath));
    const body = await r.text();
    const ok = r.status === 200 && /<html\b|<!doctype html/i.test(body) && /id=["']root["']/.test(body);
    add(ok ? 'PASS' : 'FAIL', label, `${urlPath}: HTTP ${r.status} (${r.headers.get('content-type') || '-'})`);
  } catch (e) { add('FAIL', label, `${urlPath}: ${e.message}`); }
}
async function checkCors() {
  if (!apiUrl) return add('SKIP', 'CORS preflight (OPTIONS)', 'Them --api');
  try {
    const r = await request(urlJoin(apiUrl, '/api/auth/me'), { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization',
    } });
    const allowedOrigin = r.headers.get('access-control-allow-origin') || '';
    const allowedMethods = r.headers.get('access-control-allow-methods') || '';
    const allowedHeaders = r.headers.get('access-control-allow-headers') || '';
    const ok = r.ok && (allowedOrigin === origin || allowedOrigin === '*') &&
       /\bGET\b/i.test(allowedMethods) && /authorization/i.test(allowedHeaders);
    add(ok ? 'PASS' : 'FAIL', 'CORS preflight (OPTIONS)', `HTTP ${r.status}; origin=${allowedOrigin || '<thieu>'}; method=${allowedMethods || '<thieu>'}; headers=${allowedHeaders || '<thieu>'}`);
    if (ok) add('REVIEW', 'CORS trong trinh duyet', 'Preflight dat cho endpoint nay; van can Network test thuc te');
  } catch (e) { add('FAIL', 'CORS preflight (OPTIONS)', e.message); }
}

async function runTask(id) {
  active = id;
  results[id] = { title: name[id], checks: [], manual: manual[id] };
  console.log(`\n======= ${id}: ${name[id]} =======`);
  switch (id) {
    case 'FE-001': {
      const file = read('package.json');
      try {
        const pkg = JSON.parse(file || '{}');
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        add(['react', 'react-dom', 'typescript', 'vite'].every(x => !!deps[x]) ? 'PASS' : 'FAIL', 'React + TypeScript + Vite trong package.json');
        add(['dev','build'].every(x => !!pkg.scripts?.[x]) ? 'PASS' : 'FAIL', 'npm scripts dev / build');
      } catch { add('FAIL', 'Doc package.json', 'JSON khong hop le'); }
      exists('vite.config.ts', 'Cau hinh Vite');
      pattern('src/services/apiClient.ts', /VITE_API_BASE_URL/, 'FE doc URL Backend tu env');
      await testWeb('/', 'FE server tra index.html');
      break;
    }
    case 'FE-002':
      everyPattern('src/App.tsx', [/BrowserRouter/, /<Routes>/, /<Route\b/, /path=["']\*["']/, /NotFoundPage/], 'Router va 404');
      everyPattern('src/App.tsx', [/function Private\b/, /function AdminOnly\b/, /<AppLayout\s*\/>/], 'Private va AdminOnly guards');
      everyPattern('src/layouts/AppLayout.tsx', [/Outlet/, /nav|sidebar/i, /header|topbar/i], 'Sidebar, Header, Outlet');
      await testWeb('/login', 'HTTP route /login (rewrite)');
      await testWeb('/app/subjects', 'HTTP route /app/subjects (rewrite)');
      break;
    case 'FE-003': {
      everyPattern('src/pages/AuthPage.tsx', [/mode/, /login|dang nhap|Đăng nhập/i, /register|dang ky|Đăng ký/i, /loading|submitting|pending|busy/i], 'Login + Register + loading');
      everyPattern('src/utils/authValidation.ts', [/isValidEmail/, /isStrongPassword/], 'Email va mat khau validation');
      everyPattern('src/services/authService.ts', [/signIn\(/, /signUp\(/], 'Goi API dang nhap/dang ky');
      const source = ['src/services/authService.ts','src/pages/AuthPage.tsx'].map(read).join('\n');
      add(/(?:localStorage|sessionStorage)\.setItem\(\s*['"`][^'"`]*(?:password|matkhau|mật khẩu)/i.test(source) ? 'FAIL' : 'PASS', 'Khong thay ghi password theo key ro rang trong storage', 'Kiem tra thu cong DevTools van bat buoc');
      break;
    }
    case 'FE-004':
      everyPattern('src/services/authService.ts', [/Authorization/, /Bearer/, /response\.status\s*===\s*401/, /response\.status\s*===\s*403/], 'Bearer, 401 va 403');
      everyPattern('src/services/apiClient.ts', [/apiJson/, /ensureApiSuccess/, /API_BASE_URL/], 'API Client dung chung');
      pattern('src/contexts/AuthContext.tsx', /edumind-auth-expired|clearAccessToken|fetchCurrentUser/, 'Quyen truy cap va het phien');
      await readOnlyGet('/api/auth/me', 'GET /api/auth/me (co token)', x => !!x && typeof x === 'object' && !!x.email);
      break;
    case 'FE-005':
      pattern('src/services/subjectService.ts', /\/api\/subjects/, 'GET subjects API');
      everyPattern('src/pages/SubjectsPage.tsx', [/useSubjects/, /filter|search/i, /loading/, /error/], 'Danh sach, tim kiem, loading/error');
      await readOnlyGet('/api/subjects', 'GET /api/subjects', Array.isArray);
      break;
    case 'FE-006':
      everyPattern('src/services/documentService.ts', [/new FormData\(/, /formData\.append\(["']file["']/, /\/api\/documents/, /getDocuments/], 'Upload multipart va danh sach');
      everyPattern('src/pages/DocumentsPage.tsx', [/validateFile/, /\.pdf/i, /\.docx/i, /getDocuments/, /uploadDocument/], 'File validation va cap nhat danh sach');
      pattern('src/pages/DocumentsPage.tsx', /pending|processing|ready|failed/i, 'Xu ly trang thai tai lieu');
      await readOnlyGet('/api/documents', 'GET /api/documents', Array.isArray);
      break;
    case 'FE-007':
      everyPattern('src/pages/DocumentDetailPage.tsx', [/getDocumentTextPreview/, /fetchDocumentBlob/, /sizeBytes/, /status/, /const ready\s*=/], 'Metadata, preview va trang thai');
      pattern('src/App.tsx', /path=["']documents\/:id["']/, 'Route chi tiet tai lieu');
      everyPattern('src/pages/DocumentDetailPage.tsx', [/ready\s*\?/, /ai-tutor/], 'Dieu kien Ready cho nut Hoi AI (kiem tra UI thu cong)');
      if (documentId) await readOnlyGet(`/api/documents/${documentId}/text`, 'GET preview text', x => !!x && Array.isArray(x.pages));
      else add('SKIP', 'GET preview text', 'Truyen --document-id <id> va EDUMIND_TEST_TOKEN');
      break;
    case 'FE-008':
      everyPattern('src/pages/AiTutorPage.tsx', [/askDocument|streamAskDocument/, /summarizeDocument/, /sources/, /pageNumber|citation/, /error|catch/i], 'Chat/tom tat/nguon/loi');
      exists('src/services/aiTutorService.ts', 'Service RAG / summary');
      add('REVIEW', 'AI RAG/nguon that', 'Khong tu dong goi AI, vi co the mat phi hoac ton GPU');
      break;
    case 'FE-009': {
      everyPattern('src/pages/QuizTakePage.tsx', [/type=["']radio["']/, /questionId:\s*q\.id/, /selectedOption:\s*choices\[q\.id\]/, /submitQuizAttempt/], 'Radio + payload questionId/selectedOption');
      everyPattern('src/services/quizService.ts', [/\/api\/attempts\/\$\{attemptId\}\/submit/, /method:\s*["']POST["']/], 'API nop bai');
      const src = read('src/pages/QuizTakePage.tsx') || '';
      const begin = src.indexOf('submitQuizAttempt(');
      const tail = begin >= 0 ? src.slice(begin, begin + 440) : '';
      add(!tail ? 'FAIL' : /correctOption/.test(tail) ? 'FAIL' : 'PASS', 'Payload tai diem goi submit khong thay correctOption', 'Chi la soat xet tinh; can xem Network request');
      break;
    }
    case 'FE-010':
      everyPattern('src/pages/QuizResultPage.tsx', [/getQuizAttempt/, /scorePercent/, /correctCount/, /isCorrect/, /explanation/], 'Ket qua va giai thich tu attempt');
      if (attemptId) await readOnlyGet(`/api/attempts/${attemptId}`, 'GET ket qua attempt', x => x && typeof x.scorePercent === 'number' && typeof x.correctCount === 'number');
      else add('SKIP', 'GET ket qua attempt', 'Truyen --attempt-id <id> va EDUMIND_TEST_TOKEN');
      break;
    case 'FE-011':
      everyPattern('src/services/learningProgressService.ts', [/\/api\/learning\/progress/, /summary/], 'API lich su / tien do');
      everyPattern('src/pages/LearningProgressPage.tsx', [/completedAttempts/, /averageScorePercent/, /empty|chưa|chua|không có/i], 'So luot, diem trung binh, empty state');
      await readOnlyGet('/api/learning/progress', 'GET learning/progress', x => x && x.summary && typeof x.summary.completedAttempts === 'number');
      break;
    case 'FE-012': {
      exists('src/components/ApiToastHost.tsx', 'Toast chung');
      pattern('src/App.tsx', /ApiToastHost/, 'Toast ket noi App');
      exists('src/styles/FeedbackSystem.css', 'CSS thong bao');
      const cssFiles = fs.readdirSync(path.join(frontend, 'src'), { recursive: true }).filter(x => String(x).endsWith('.css'));
      const mediaFiles = cssFiles.filter(x => {
        try { return /@media\s*\(/.test(fs.readFileSync(path.join(frontend, 'src', x), 'utf8')); } catch { return false; }
      });
      add(mediaFiles.length ? 'PASS' : 'FAIL', 'Co CSS media queries', `${mediaFiles.length} file; can thu resize thuc te`);
      add('REVIEW', 'Thong bao va responsive end-to-end', 'Phai thu tren trinh duyet o it nhat 2 kich thuoc');
      break;
    }
    case 'FE-013': {
      exists('package-lock.json', 'Lockfile de tai lap dependencies');
      exists('.env.example', 'Vi du cau hinh public API URL');
      const pkg = JSON.parse(read('package.json') || '{}');
      add(!!pkg.scripts?.build && !!pkg.scripts?.lint ? 'PASS' : 'FAIL', 'Build + lint scripts');
      runNpm('lint');
      const built = runNpm('build');
      if (built === null) add('SKIP', 'dist/index.html', 'Chua chay npm run build');
      else add(built && fs.existsSync(path.join(frontend,'dist/index.html')) ? 'PASS' : 'FAIL', 'dist/index.html duoc tao tu lan build thanh cong');
      await checkCors();
      await testWeb('/app/documents', 'Route refresh /app/documents');
      await testWeb('/app/progress', 'Route refresh /app/progress');
      await testWeb('/app/admin', 'Route refresh /app/admin');
      break;
    }
  }
  for (const x of manual[id]) add('REVIEW', `Can kiem thu: ${x}`);
}

const now = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = path.join(frontend, 'fe-check-reports');
try {
  if (!fs.existsSync(frontend)) throw new Error('Khong tim thay thu muc frontend');
  console.log('PROJECT:', frontend);
  for (const id of selected === 'ALL' ? tasks : [selected]) await runTask(id);
  fs.mkdirSync(reportDir, { recursive: true });
  const filebase = `${selected}_${now}`;
  const report = { dateUtc: new Date().toISOString(), selection: selected, frontend, api: apiUrl || '(khong thu)', web: webUrl || '(khong thu)', tasks: results };
  fs.writeFileSync(path.join(reportDir, `${filebase}.json`), JSON.stringify(report, null, 2), 'utf8');
  const lines = [
    `# Bao cao kiem tra FE - ${selected}`, '',
    `Ngay UTC: ${report.dateUtc}`, '',
    '**Ghi chu:** PASS la kiem tra code/GET/OPTIONS/build cua bo test; KHONG co nghia task da nghiem thu 100%.', '',
  ];
  for (const [id, task] of Object.entries(results)) {
    lines.push(`## ${id} — ${task.title}`, '', '| Trang thai | Kiem tra | Bang chung / ghi chu |', '|---|---|---|');
    for (const c of task.checks) {
      const clean = s => String(s).replaceAll('|','\\|').replace(/\r?\n/g,' ');
      lines.push(`| ${c.status} | ${clean(c.label)} | ${clean(c.evidence)} |`);
    }
    lines.push('', '**Nghiem thu thu cong:**', '', ...task.manual.map(x => `- [ ] ${x}`), '');
  }
  fs.writeFileSync(path.join(reportDir, `${filebase}.md`), lines.join('\n'), 'utf8');
  const checks = Object.values(results).flatMap(x => x.checks);
  const count = s => checks.filter(x => x.status === s).length;
  console.log(`\nTONG: PASS=${count('PASS')}  FAIL=${count('FAIL')}  REVIEW=${count('REVIEW')}  SKIP=${count('SKIP')}`);
  console.log('BAO CAO:', path.join(reportDir, `${filebase}.md`));
  console.log('Phai hoan thanh cac buoc REVIEW moi duoc danh dau task 100%.');
  process.exitCode = count('FAIL') > 0 ? 1 : 0;
} catch (error) {
  console.error('LOI BO KIEM TRA:', error.message);
  process.exitCode = 2;
}
