from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
assert (ROOT / "backend/EduMind.Api/Models/StudyTaskCompletion.cs").exists()
assert (ROOT / "backend/EduMind.Api/Models/FlashcardReviewEvent.cs").exists()
for name in ("study_task_completions", "flashcard_review_events"):
    db = (ROOT / "backend/EduMind.Api/Data/EduMindDbContext.cs").read_text(encoding="utf8")
    assert f'ToTable("{name}")' in db, name
checks = {
    "Controllers/QuizAttemptsController.cs": None, # unchanged intentionally; checked via original project
    "Controllers/QuizzesController.cs": "QuizLearningRules.HasDocumentEvidence",
    "Controllers/FlashcardsController.cs": "FlashcardReviewEvents.Add",
    "Controllers/StudyPlansController.cs": "HttpPut(\"tasks/completion\")",
    "Controllers/LearningInsightsController.cs": "OwnerUserId == userId",
}
for rel, needle in checks.items():
    if not needle:
        continue
    path = ROOT / "backend/EduMind.Api" / rel
    assert needle in path.read_text(encoding="utf8"), path
print("[PASS] Các thành phần Nhóm B hiện diện trong bộ file")
print("Đây là kiểm tra cấu trúc, KHÔNG thay thế dotnet build hay kiểm thử thực tế.")
