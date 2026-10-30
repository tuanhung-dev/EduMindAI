
using EduMind.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace EduMind.Api.Data;

public class EduMindDbContext : IdentityDbContext<EduMindUser>
{
    public EduMindDbContext(
        DbContextOptions<EduMindDbContext> options
    ) : base(options)
    {
    }

    // Bảng quản lý môn học
    public DbSet<Subject> Subjects => Set<Subject>();
    
    public DbSet<Document> Documents => Set<Document>();
    
    public DbSet<DocumentChunk> DocumentChunks
    => Set<DocumentChunk>();

    public DbSet<DocumentSummary> DocumentSummaries => Set<DocumentSummary>();

    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();

    public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
    public DbSet<QuizAnswer> QuizAnswers => Set<QuizAnswer>();

    public DbSet<AiChatSession> AiChatSessions => Set<AiChatSession>();
    public DbSet<AiChatMessage> AiChatMessages => Set<AiChatMessage>();

    public DbSet<FlashcardDeck> FlashcardDecks => Set<FlashcardDeck>();
    public DbSet<Flashcard> Flashcards => Set<Flashcard>();
    public DbSet<StudyTaskCompletion> StudyTaskCompletions => Set<StudyTaskCompletion>();
    public DbSet<FlashcardReviewEvent> FlashcardReviewEvents => Set<FlashcardReviewEvent>();

    protected override void OnModelCreating(
        ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Step 29.2: private conversations scoped to a document and an account.
        modelBuilder.Entity<AiChatSession>(entity =>
        {
            entity.ToTable("ai_chat_sessions");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.OwnerUserId).HasMaxLength(191).IsRequired();
            entity.Property(c => c.Title).HasMaxLength(180).IsRequired();
            entity.HasIndex(c => new { c.OwnerUserId, c.DocumentId, c.UpdatedAtUtc });
            entity.HasOne(c => c.Document).WithMany()
                .HasForeignKey(c => c.DocumentId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<AiChatMessage>(entity =>
        {
            entity.ToTable("ai_chat_messages");
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Role).HasMaxLength(12).IsRequired();
            entity.Property(m => m.Content).HasColumnType("longtext").IsRequired();
            entity.Property(m => m.SourcesJson).HasColumnType("longtext").IsRequired();
            entity.HasIndex(m => new { m.AiChatSessionId, m.Id });
            entity.HasOne(m => m.Session).WithMany(s => s.Messages)
                .HasForeignKey(m => m.AiChatSessionId).OnDelete(DeleteBehavior.Cascade);
        });

        // Group B: real spaced-practice events from this upgrade onward.
        modelBuilder.Entity<FlashcardReviewEvent>(entity =>
        {
            entity.ToTable("flashcard_review_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.OwnerUserId).HasMaxLength(191).IsRequired();
            entity.HasIndex(x => new { x.OwnerUserId, x.ReviewedAtUtc });
            // No FK to flashcards: review history stays after a deck is deleted.
        });

        // Group B: idempotent manual completion marks; never infer completion from a suggestion.
        modelBuilder.Entity<StudyTaskCompletion>(entity =>
        {
            entity.ToTable("study_task_completions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.OwnerUserId).HasMaxLength(191).IsRequired();
            entity.Property(x => x.Kind).HasMaxLength(24).IsRequired();
            entity.Property(x => x.StudyDate).HasColumnType("date").IsRequired();
            entity.HasIndex(x => new { x.OwnerUserId, x.StudyDate, x.DocumentId, x.Kind }).IsUnique();
            entity.HasOne(x => x.Document).WithMany()
                .HasForeignKey(x => x.DocumentId).OnDelete(DeleteBehavior.Cascade);
        });

        // Step 26: private PDF flashcard decks and persisted spaced-repetition progress.
        modelBuilder.Entity<FlashcardDeck>(entity =>
        {
            entity.ToTable("flashcard_decks");
            entity.HasKey(d => d.Id);
            entity.Property(d => d.OwnerUserId).HasMaxLength(191).IsRequired();
            entity.Property(d => d.Title).HasMaxLength(200).IsRequired();
            entity.Property(d => d.Topic).HasMaxLength(100).IsRequired();
            entity.HasIndex(d => new { d.OwnerUserId, d.CreatedAtUtc });
            entity.HasOne(d => d.Document).WithMany()
                .HasForeignKey(d => d.DocumentId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<Flashcard>(entity =>
        {
            entity.ToTable("flashcards");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Front).HasMaxLength(600).IsRequired();
            entity.Property(c => c.Back).HasMaxLength(1600).IsRequired();
            entity.HasIndex(c => new { c.FlashcardDeckId, c.Position }).IsUnique();
            entity.HasIndex(c => c.NextReviewAtUtc);
            entity.HasOne(c => c.Deck).WithMany(d => d.Cards)
                .HasForeignKey(c => c.FlashcardDeckId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EduMindUser>().Property(x => x.Id).HasMaxLength(191);

        modelBuilder.Entity<Subject>(entity =>
        {
            entity.ToTable("subjects");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id)
                  .ValueGeneratedOnAdd();

            entity.Property(x => x.Code)
                  .HasMaxLength(20)
                  .IsRequired();

            entity.HasIndex(x => x.Code)
                  .IsUnique();

            entity.Property(x => x.Name)
                  .HasMaxLength(150)
                  .IsRequired();

            entity.Property(x => x.Description)
                  .HasMaxLength(500);
        });
        
modelBuilder.Entity<Document>(entity =>
{
    entity.ToTable("documents");

    entity.HasKey(d => d.Id);

    entity.Property(d => d.Id)
        .ValueGeneratedOnAdd();

    entity.Property(d => d.OriginalFileName)
        .HasMaxLength(255)
        .IsRequired();

    entity.Property(d => d.StoredFileName)
        .HasMaxLength(50)
        .IsRequired();

    entity.Property(d => d.ContentType)
        .HasMaxLength(100)
        .IsRequired();

    entity.Property(d => d.Status)
        .HasMaxLength(30)
        .IsRequired();

    entity.HasIndex(d => d.StoredFileName)
        .IsUnique();

    entity.HasOne(d => d.Subject)
        .WithMany()
        .HasForeignKey(d => d.SubjectId)
        .OnDelete(DeleteBehavior.Restrict);
});


modelBuilder.Entity<DocumentChunk>(entity =>
{
    entity.ToTable("document_chunks");

    entity.HasKey(c => c.Id);

    entity.Property(c => c.Id)
        .ValueGeneratedOnAdd();

    entity.Property(c => c.Content)
        .HasColumnType("longtext")
        .IsRequired();

    entity.Property(c => c.PageNumber)
        .IsRequired();

    entity.Property(c => c.ChunkIndex)
        .IsRequired();

    entity.HasIndex(c => new
    {
        c.DocumentId,
        c.ChunkIndex
    }).IsUnique();

    entity.HasOne(c => c.Document)
        .WithMany()
        .HasForeignKey(c => c.DocumentId)
        .OnDelete(DeleteBehavior.Cascade);
});


        // Buoc 21.2: lich su tom tat PDF theo tai khoan.
        modelBuilder.Entity<DocumentSummary>(entity =>
        {
            entity.ToTable("document_summaries");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).ValueGeneratedOnAdd();
            entity.Property(s => s.OwnerUserId).HasMaxLength(191).IsRequired();
            entity.Property(s => s.Level).HasMaxLength(12).IsRequired();
            entity.Property(s => s.SummaryContent).HasColumnType("longtext").IsRequired();
            entity.Property(s => s.PagesJson).HasColumnType("longtext").IsRequired();
            entity.Property(s => s.SourcesJson).HasColumnType("longtext").IsRequired();
            entity.Property(s => s.CoverageNote).HasMaxLength(600).IsRequired();
            entity.HasIndex(s => new { s.DocumentId, s.OwnerUserId, s.CreatedAtUtc });
            entity.HasOne(s => s.Document).WithMany()
                .HasForeignKey(s => s.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Bước 14: lưu đề trắc nghiệm và đáp án ở phía Backend.
        modelBuilder.Entity<Quiz>(entity =>
        {
            entity.ToTable("quizzes");
            entity.HasKey(q => q.Id);
            entity.Property(q => q.Title).HasMaxLength(180).IsRequired();
            entity.Property(q => q.Difficulty).HasMaxLength(12).IsRequired();
            entity.Property(q => q.OwnerUserId).HasMaxLength(191);
            entity.HasIndex(q => q.OwnerUserId);
            entity.HasIndex(q => new { q.DocumentId, q.CreatedAtUtc });
            entity.HasOne(q => q.Document).WithMany()
                .HasForeignKey(q => q.DocumentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<QuizQuestion>(entity =>
        {
            entity.ToTable("quiz_questions");
            entity.HasKey(q => q.Id);
            entity.Property(q => q.Content).HasMaxLength(1500).IsRequired();
            entity.Property(q => q.OptionA).HasMaxLength(600).IsRequired();
            entity.Property(q => q.OptionB).HasMaxLength(600).IsRequired();
            entity.Property(q => q.OptionC).HasMaxLength(600).IsRequired();
            entity.Property(q => q.OptionD).HasMaxLength(600).IsRequired();
            entity.Property(q => q.CorrectOption).HasMaxLength(1).IsRequired();
            entity.Property(q => q.Explanation).HasMaxLength(2000).IsRequired();
            entity.Property(q => q.SourceExcerpt).HasMaxLength(500).IsRequired();
            entity.HasIndex(q => new { q.QuizId, q.Position }).IsUnique();
            entity.HasOne(q => q.Quiz).WithMany(q => q.Questions)
                .HasForeignKey(q => q.QuizId)
                .OnDelete(DeleteBehavior.Cascade);
            // SourceChunkId không là FK: index lại PDF sẽ xóa chunks cũ.
        });



        // Bước 15: lịch sử làm bài và các đáp án được chấm ở Backend.
        modelBuilder.Entity<QuizAttempt>(entity =>
        {
            entity.ToTable("quiz_attempts");
            entity.HasKey(a => a.Id);
            entity.Property(a => a.ScorePercent).HasPrecision(5, 2);
            entity.Property(a => a.OwnerUserId).HasMaxLength(191);
            entity.HasIndex(a => a.OwnerUserId);
            entity.HasIndex(a => new { a.QuizId, a.StartedAtUtc });
            entity.HasOne(a => a.Quiz).WithMany()
                .HasForeignKey(a => a.QuizId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<QuizAnswer>(entity =>
        {
            entity.ToTable("quiz_answers");
            entity.HasKey(a => a.Id);
            entity.Property(a => a.SelectedOption).HasMaxLength(1);
            entity.HasIndex(a => new { a.QuizAttemptId, a.QuestionId }).IsUnique();
            entity.HasOne(a => a.QuizAttempt).WithMany(a => a.Answers)
                .HasForeignKey(a => a.QuizAttemptId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(a => a.Question).WithMany()
                .HasForeignKey(a => a.QuestionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

    }
}
