
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

    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();

    public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
    public DbSet<QuizAnswer> QuizAnswers => Set<QuizAnswer>();

    protected override void OnModelCreating(
        ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
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
